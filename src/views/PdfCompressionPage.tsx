import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { FileDown, FileText, FolderOpen, Upload, X } from 'lucide-react';
import { usePdfWorkspace, type PdfItem } from '../contexts/PdfWorkspace';
import { normalizePdfSettings, pdfPresets, type PdfSettings } from '../lib/pdf-settings';
import { formatFileSize } from '../lib/utils';

const button = 'inline-flex items-center justify-center gap-2 rounded-md border border-border px-3 py-2 text-sm hover:bg-accent disabled:opacity-50';
const primary = button + ' bg-primary text-primary-foreground hover:bg-primary/90';
const field = 'rounded-md border border-border bg-background px-3 py-2';
const statuses = { ready: '待处理', processing: '正在压缩…', done: '已完成', error: '处理失败' };
export default function PdfCompressionPage() {
  const { items, setItems, settings, setSettings, processing, setProcessing, message, setMessage, stop } = usePdfWorkspace();
  const [importing, setImporting] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [progress, setProgress] = useState('');
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const listener = (value: { attempt: number; total: number }) => setProgress(value.total > 1 ? `正在尝试第 ${value.attempt} / ${value.total} 档图片质量` : '正在校验压缩结果');
    window.electron.ipcRenderer.on('pdf-compression-progress', listener);
    return () => window.electron.ipcRenderer.removeAllListeners('pdf-compression-progress');
  }, []);
  const patch = (value: Partial<PdfSettings>) => setSettings(previous => normalizePdfSettings({ ...previous, ...value }));
  const addPaths = (paths: { path: string; name?: string; size?: number }[]) => {
    setItems(previous => {
      const seen = new Set(previous.map(item => item.path));
      const added: PdfItem[] = [];
      for (const file of paths) {
        if (seen.has(file.path)) continue;
        seen.add(file.path);
        added.push({ id: crypto.randomUUID(), path: file.path, name: file.name || file.path.split(/[/\\]/).pop() || 'document.pdf', size: file.size, status: 'ready' });
      }
      return [...previous, ...added];
    });
  };
  const chooseFiles = async () => {
    setImporting(true);
    try {
      const result = await window.electron.ipcRenderer.invoke('select-pdf-files');
      if (!result.canceled) { addPaths(result.filePaths.map((path: string) => ({ path }))); setMessage(`已选择 ${result.filePaths.length} 个 PDF。`); }
    } catch (error) { setMessage(`导入失败：${String(error)}`); }
    finally { setImporting(false); }
  };
  const chooseFolder = async () => {
    setImporting(true);
    try {
      const result = await window.electron.ipcRenderer.invoke('select-folder');
      if (result.canceled || !result.filePaths?.[0]) return;
      const paths: string[] = await window.electron.ipcRenderer.invoke('get-pdfs-from-folder', result.filePaths[0]);
      addPaths(paths.map(path => ({ path })));
      setMessage(paths.length ? `已导入 ${paths.length} 个 PDF（不包含子文件夹）。` : '此文件夹中没有 PDF。');
    } catch (error) { setMessage(`导入失败：${String(error)}`); }
    finally { setImporting(false); }
  };
  const importFiles = async (files: File[]) => {
    setImporting(true);
    const imported: { path: string; name: string; size: number }[] = [];
    const errors: string[] = [];
    try {
      for (const file of files) {
        if (!file.name.toLowerCase().endsWith('.pdf')) { errors.push(`${file.name}：仅支持 PDF`); continue; }
        if (!file.size || file.size > 150 * 1024 * 1024) { errors.push(`${file.name}：非空文件且不超过 150 MB`); continue; }
        try {
          const saved = await window.electron.ipcRenderer.invoke('save-temp-file', { filename: file.name, data: await file.arrayBuffer() });
          if (!saved.path) throw new Error('暂存失败');
          imported.push({ path: saved.path, name: file.name, size: file.size });
        } catch (error) { errors.push(`${file.name}：${String(error)}`); }
      }
      addPaths(imported);
      setMessage(`已导入 ${imported.length} 个 PDF。${errors.length ? ` ${errors.join('；')}` : ''}`);
    } finally { setImporting(false); }
  };
  const processFiles = async () => {
    const queue = items.filter(item => item.status === 'ready' || item.status === 'error');
    if (!queue.length || processing) return;
    setProcessing(true); stop.current = false;
    const snapshot = { ...settings };
    let completed = 0; let failed = 0;
    try {
      for (const [index, item] of queue.entries()) {
        if (stop.current) break;
        setMessage(`正在处理 ${index + 1} / ${queue.length}：${item.name}`);
        setProgress('正在整理 PDF 和内嵌图片');
        setItems(previous => previous.map(file => file.id === item.id ? { ...file, status: 'processing', error: undefined } : file));
        try {
          const result = await window.electron.ipcRenderer.invoke('compress-pdf', { inputPath: item.path, name: item.name, settings: snapshot });
          if (!result.success) throw new Error(result.error || '压缩失败');
          completed++;
          setItems(previous => previous.map(file => file.id === item.id ? { ...file, status: 'done', result: result.record } : file));
        } catch (error) {
          failed++;
          setItems(previous => previous.map(file => file.id === item.id ? { ...file, status: 'error', error: error instanceof Error ? error.message : '压缩失败' } : file));
        }
      }
      setMessage(`${stop.current ? '已停止后续处理。' : ''}完成 ${completed} 个，失败 ${failed} 个。结果可预览、另存为或批量导出。`);
    } finally { setProcessing(false); setProgress(''); }
  };
  const saveOne = async (item: PdfItem) => {
    if (!item.result) return;
    try {
      const result = await window.electron.ipcRenderer.invoke('save-file', { sourcePath: item.result.outputPath, suggestedName: item.result.name });
      if (result.success) setMessage(`已保存到 ${result.path}`);
      else if (result.error) setMessage(`保存失败：${result.error}`);
    } catch (error) { setMessage(`保存失败：${String(error)}`); }
  };
  const pending = items.filter(item => item.status === 'ready' || item.status === 'error').length;
  const done = items.filter(item => item.result);
  const saved = done.reduce((sum, item) => item.result ? sum + item.result.originalSize - item.result.compressedSize : sum, 0);
  return <div id="pdf-workspace" className="space-y-6">
    <div className="flex flex-wrap justify-between items-start gap-3"><div><h1 className="text-3xl font-bold">PDF 压缩</h1><p className="mt-2 text-muted-foreground">减小文档体积，保留文字、矢量内容和页面尺寸。文件全程在本机处理。</p></div><Link className={button} to="/pdf/export"><FileDown size={16} />导出管理</Link></div>
    <section className="rounded-xl border border-border bg-card p-5 space-y-4">
      <h2 className="text-lg font-semibold">1. 导入 PDF</h2>
      <div id="pdf-drop-zone" className={'rounded-lg border-2 border-dashed p-7 text-center space-y-3 ' + (dragging ? 'border-primary bg-primary/5' : 'border-border')}
        onDragOver={event => { event.preventDefault(); if (!processing && !importing) setDragging(true); }} onDragLeave={() => setDragging(false)}
        onDrop={event => { event.preventDefault(); setDragging(false); if (!processing && !importing) void importFiles(Array.from(event.dataTransfer.files)); }}>
        <Upload className="mx-auto text-primary" size={30} /><p>拖入 PDF 文件，或选择文件／文件夹</p><p className="text-xs text-muted-foreground">支持批量处理，单个文件最大 150 MB。原文件不会被覆盖。</p>
        <div className="flex justify-center flex-wrap gap-3"><button className={primary} disabled={processing || importing} onClick={chooseFiles}>选择 PDF</button><button className={button} disabled={processing || importing} onClick={chooseFolder}><FolderOpen size={16} />选择文件夹</button></div>
        <input ref={input} id="pdf-file-input" type="file" accept=".pdf,application/pdf" multiple hidden onChange={event => { if (!processing && !importing) void importFiles(Array.from(event.target.files || [])); event.target.value = ''; }} />
      </div>
    </section>
    <section className="rounded-xl border border-border bg-card p-5 space-y-5">
      <h2 className="text-lg font-semibold">2. 选择压缩方式</h2>
      <fieldset disabled={processing} className="space-y-5"><legend className="sr-only">PDF 压缩设置</legend>
        <div className="grid grid-cols-1 lg:grid-cols-2 2xl:grid-cols-4 gap-3">{pdfPresets.map(preset => <label key={preset.id} className={'rounded-lg border p-4 cursor-pointer space-y-2 ' + (settings.preset === preset.id ? 'border-primary bg-primary/5' : 'border-border')}><span className="flex gap-2 items-center font-medium"><input type="radio" name="pdf-preset" value={preset.id} checked={settings.preset === preset.id} onChange={() => patch({ preset: preset.id })} />{preset.label}</span><span className="block text-xs leading-5 text-muted-foreground">{preset.description}</span></label>)}</div>
        {settings.preset === 'custom' && <label className="block space-y-2 text-sm">内嵌图片质量：{settings.imageQuality}<input aria-label="PDF 内嵌图片质量" className="block w-full accent-primary" type="range" min="20" max="95" value={settings.imageQuality} onChange={event => patch({ imageQuality: Number(event.target.value) })} /></label>}
        <div className="rounded-lg bg-muted p-4 space-y-3"><label className="flex gap-2 items-center text-sm font-medium"><input type="checkbox" id="pdf-target-enabled" checked={settings.targetEnabled} onChange={event => patch({ targetEnabled: event.target.checked })} />尝试压缩到指定体积（可选）</label>
          {settings.targetEnabled && <div className="space-y-2"><label className="flex flex-wrap gap-2 items-center text-sm">每个文件小于<input id="pdf-target-size" aria-label="PDF 目标体积 MB" type="number" className={field + ' w-28'} min="0.01" max="150" step="0.01" value={settings.targetSizeMB} onChange={event => setSettings(previous => ({ ...previous, targetSizeMB: event.target.value === '' ? 0 : Number(event.target.value) }))} onBlur={() => setSettings(previous => normalizePdfSettings(previous))} />MB</label><p className="text-xs text-muted-foreground">1 MB = 1024 KB。{settings.preset === 'lossless' ? '无损模式仅整理结构，不会降低图片质量。' : '会逐档降低内嵌图片质量，最低至 20。'}目标不保证达成；未达标会明确提示，不删页、不缩小页面。</p></div>}
        </div>
      </fieldset>
      <details className="text-sm text-muted-foreground"><summary className="cursor-pointer font-medium text-foreground">哪种 PDF 效果明显？</summary><div className="mt-3 space-y-2 leading-6"><p>扫描件、相册、含大量照片的 PDF 通常更适合均衡或强力压缩。纯文字、矢量图，以及已经压缩的 PDF，体积可能变化不大；结果更大时会保留原文件内容。</p><p>只重新压缩适用的内嵌图片，不把整页变成截图，也不缩减图片像素。原有文字搜索、链接和表单会保留；不会给扫描件自动添加 OCR 文字。</p><p>当前不处理加密文件、数字签名或签名字段。特殊格式、印刷和归档文件请保留原件，并在导出前预览确认。</p></div></details>
    </section>
    <section className="rounded-xl border border-border bg-card p-5 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-lg font-semibold">3. 压缩与导出</h2><p className="text-sm text-muted-foreground mt-1">{items.length} 个文件 · 已完成 {done.length} 个 · 节省 {formatFileSize(saved)}</p></div><div className="flex gap-2 flex-wrap"><button className={button} disabled={processing || !items.length} onClick={() => { setItems([]); setMessage('已清空当前列表，历史结果仍可在导出管理查看。'); }}>清空列表</button><button className={button} disabled={processing || !done.length} onClick={() => setItems(previous => previous.map(item => ({ ...item, status: 'ready', error: undefined, result: undefined })))}>按新设置重新压缩</button><button id="pdf-compress" className={primary} disabled={processing || importing || !pending || (settings.targetEnabled && (settings.targetSizeMB < 0.01 || settings.targetSizeMB > 150))} onClick={processFiles}>{processing ? '正在压缩…' : `开始压缩 ${pending} 个 PDF`}</button>{processing && <button className={button} onClick={() => { stop.current = true; setMessage('当前文件完成后停止后续处理。'); }}>处理完当前文件后停止</button>}</div></div>
      {!items.length ? <p className="py-8 text-center text-muted-foreground">导入 PDF 后即可开始压缩</p> : <div className="space-y-3">{items.map(item => <article key={item.id} data-pdf-id={item.id} className="rounded-lg border border-border p-4 flex gap-3 items-start"><FileText className="text-primary shrink-0 mt-1" size={27} /><div className="min-w-0 flex-1 space-y-2"><p className="font-medium break-all">{item.name}</p><p className="text-xs text-muted-foreground">{statuses[item.status]}{item.status === 'processing' && ` · ${progress}`}{!item.result && item.size ? ` · ${formatFileSize(item.size)}` : ''}</p>{item.result && <><p className="text-sm">{item.result.pageCount} 页 · {formatFileSize(item.result.originalSize)} → {formatFileSize(item.result.compressedSize)} <span className="text-primary">节省 {item.result.compressionRate}</span>{item.result.targetMet !== undefined && <span className={item.result.targetMet ? 'text-green-700 ml-2' : 'text-amber-700 ml-2'}>{item.result.targetMet ? '目标已达成' : '未达到目标'}</span>}</p>{item.result.warning && <p className="text-sm text-amber-700">{item.result.warning}</p>}<div className="flex gap-2"><button className={button} onClick={() => window.electron.ipcRenderer.invoke('open-file', item.result?.outputPath)}>预览 PDF</button><button className={button} onClick={() => saveOne(item)}>另存为</button></div></>}{item.error && <p role="alert" className="text-sm text-destructive">{item.error}</p>}</div><button className={button} aria-label={`移除 ${item.name}`} disabled={processing} onClick={() => setItems(previous => previous.filter(file => file.id !== item.id))}><X size={15} /></button></article>)}</div>}
    </section>
    <p role="status" aria-live="polite" className="text-sm text-muted-foreground">{message}</p>
  </div>;
}
