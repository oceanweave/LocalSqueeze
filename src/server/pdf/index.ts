import { app, dialog, ipcMain } from 'electron';
import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { Worker } from 'node:worker_threads';
// Vite embeds this worker source; it is not a Node filesystem import.
// eslint-disable-next-line import/no-unresolved
import workerSource from './worker.cjs?raw';
import { normalizePdfSettings, type PdfSettings } from '../../lib/pdf-settings';
import { StorageManager } from '../storage';
import type { ProcessedImage } from '../../types/global';

const maxBytes = 150 * 1024 * 1024;
let running = false;
function unpacked(file: string) { return file.replace(/app\.asar([/\\])/, 'app.asar.unpacked$1'); }
function processPdf(inputPath: string, settings: PdfSettings, onProgress: (value: { attempt: number; total: number }) => void): Promise<{ data: Uint8Array; pageCount: number; targetMet?: boolean; warning?: string }> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const worker = new Worker(workerSource, { eval: true, workerData: {
      inputPath, settings,
      modulePath: unpacked(require.resolve('@neslinesli93/qpdf-wasm')),
      wasmPath: unpacked(require.resolve('@neslinesli93/qpdf-wasm/dist/qpdf.wasm'))
    } });
    const timer = setTimeout(() => { reject(new Error('PDF 处理超过 3 分钟，已停止。可尝试较小的文件或关闭目标体积。')); void worker.terminate(); }, 180000);
    worker.on('message', message => {
      if (message.progress) { onProgress(message.progress); return; }
      settled = true;
      clearTimeout(timer);
      void worker.terminate();
      if (message.error) reject(new Error(message.error));
      else resolve(message.result);
    });
    worker.on('error', error => { clearTimeout(timer); reject(error); });
    worker.on('exit', () => { clearTimeout(timer); if (!settled) reject(new Error('PDF 处理进程已停止，文件可能过大或格式不受支持。')); });
  });
}
export function initPdfHandlers() {
  ipcMain.handle('select-pdf-files', async () => dialog.showOpenDialog({ filters: [{ name: 'PDF 文档', extensions: ['pdf'] }], properties: ['openFile', 'multiSelections'] }));
  ipcMain.handle('get-pdfs-from-folder', async (_, directory: string) => {
    const entries = await fs.readdir(directory, { withFileTypes: true });
    return entries.filter(entry => entry.isFile() && path.extname(entry.name).toLowerCase() === '.pdf').map(entry => path.join(directory, entry.name));
  });
  ipcMain.handle('compress-pdf', async (event, args: { inputPath: string; settings: PdfSettings; name?: string }) => {
    if (running) return { success: false, error: '已有 PDF 正在处理，请等待完成。' };
    running = true;
    let directory: string | undefined;
    try {
      if (!args || typeof args.inputPath !== 'string') throw new Error('请选择 PDF 文件。');
      const stat = await fs.stat(args.inputPath);
      if (!stat.isFile() || !stat.size || stat.size > maxBytes) throw new Error('请选择非空 PDF，单个文件最大支持 150 MB。');
      const handle = await fs.open(args.inputPath, 'r');
      const header = Buffer.alloc(1024);
      try { await handle.read(header, 0, header.length, 0); } finally { await handle.close(); }
      if (!header.includes(Buffer.from('%PDF-'))) throw new Error('文件内容不是有效的 PDF。');
      const settings = normalizePdfSettings(args.settings);
      const result = await processPdf(args.inputPath, settings, progress => {
        if (!event.sender.isDestroyed()) event.sender.send('pdf-compression-progress', progress);
      });
      directory = path.join(app.getPath('userData'), 'compressed-pdfs', randomUUID());
      await fs.mkdir(directory, { recursive: true });
      const sourceName = typeof args.name === 'string' ? args.name : path.basename(args.inputPath);
      const safeName = Array.from(path.basename(sourceName, path.extname(sourceName))).map(character => character.charCodeAt(0) < 32 || /[<>:"/\\|?*]/.test(character) ? '_' : character).join('');
      const name = safeName.slice(0, 100) + '_compressed.pdf';
      const outputPath = path.join(directory, name);
      await fs.writeFile(outputPath, result.data);
      const record: ProcessedImage = {
        operation: 'pdf', id: randomUUID(), name, originalPath: args.inputPath, outputPath,
        originalSize: stat.size, compressedSize: result.data.length,
        compressionRate: `${((1 - result.data.length / stat.size) * 100).toFixed(1)}%`,
        width: 0, height: 0, pageCount: result.pageCount, format: 'pdf', processedAt: Date.now(),
        warning: result.warning, targetMet: result.targetMet
      };
      await StorageManager.getInstance().addProcessedImage(record);
      return { success: true, record };
    } catch (error) {
      if (directory) await fs.rm(directory, { recursive: true, force: true }).catch(() => undefined);
      return { success: false, error: error instanceof Error ? error.message : 'PDF 压缩失败。' };
    } finally { running = false; }
  });
}
