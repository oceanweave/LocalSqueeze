// Runs in an isolated Node worker: QPDF's synchronous WASM work must never block Electron.
const { parentPort, workerData } = require('node:worker_threads');
const fs = require('node:fs');

async function compress() {
  const messages = [];
  let stdout = [];
  // This pinned Emscripten build binds console output rather than Module.print.
  // Only this worker's console is redirected; no document content reaches app logs.
  console.log = line => stdout.push(String(line));
  console.error = line => messages.push(String(line));
  const createModule = require(workerData.modulePath);
  const wasmBinary = fs.readFileSync(workerData.wasmPath);
  const original = fs.readFileSync(workerData.inputPath);
  // QPDF's CLI changes process-global C++ stream state. Use a fresh WASM
  // instance for each command so an earlier inspection cannot mute later checks.
  const run = async (args, input = original, outputPath) => {
    stdout = [];
    messages.length = 0;
    const qpdf = await createModule({ noInitialRun: true, wasmBinary });
    qpdf.FS.writeFile('/input.pdf', input);
    const code = qpdf.callMain([...args]);
    return {
      code, text: stdout.join('\n'), warning: messages.join('\n'),
      data: outputPath && (code === 0 || code === 3) ? Buffer.from(qpdf.FS.readFile(outputPath)) : undefined
    };
  };
  const encrypted = await run(['/input.pdf', '--is-encrypted']);
  if (encrypted.code === 0 || /invalid password|password required/i.test(encrypted.warning)) throw new Error('暂不支持加密 PDF，请先在原软件中另存为未加密的副本。');
  const info = await run(['/input.pdf', '--json', '--json-stream-data=none']);
  if (info.code !== 0) throw new Error('PDF 结构异常或文件已损坏，请先在阅读器中修复后重试。');
  const document = JSON.parse(info.text);
  // Examine the object graph, not text content: signed documents must not be silently invalidated.
  const signed = value => value && typeof value === 'object' && (
    value['/Type'] === '/Sig' || value['/FT'] === '/Sig' || Array.isArray(value['/ByteRange']) || Object.values(value).some(signed)
  );
  if (signed(document)) throw new Error('检测到数字签名或签名字段。压缩可能使签名失效，请使用签名前的副本。');
  const pageCount = document.pages?.length;
  if (!pageCount) throw new Error('此 PDF 没有可处理的页面。');
  const settings = workerData.settings;
  const limit = settings.targetEnabled ? Math.ceil(settings.targetSizeMB * 1024 * 1024) - 1 : Infinity;
  const qualities = settings.preset === 'lossless' ? [null] : [settings.imageQuality];
  if (settings.targetEnabled && settings.preset !== 'lossless') {
    for (const quality of [65, 50, 35, 20]) if (quality < settings.imageQuality) qualities.push(quality);
  }
  let best = original;
  let engineWarning = false;
  for (let i = 0; i < qualities.length; i++) {
    const args = ['/input.pdf', '--object-streams=generate', '--compress-streams=y', '--decode-level=generalized', '--recompress-flate', '--compression-level=9'];
    if (qualities[i] !== null) args.push('--optimize-images', `--jpeg-quality=${qualities[i]}`);
    const output = `/output-${i}.pdf`;
    const result = await run([...args, output], original, output);
    if (result.code !== 0) throw new Error('PDF 压缩未能完整完成，请检查文件是否损坏。');
    const candidate = result.data;
    const check = await run(['/input.pdf', '--check'], candidate);
    if (check.code !== 0) throw new Error('压缩后的 PDF 校验失败，已保留原文件。');
    const pages = await run(['/input.pdf', '--show-npages'], candidate);
    if (pages.code !== 0 || Number(pages.text.trim()) !== pageCount) throw new Error('压缩后的页数校验失败，已保留原文件。');
    engineWarning ||= !!result.warning;
    if (candidate.length < best.length) best = Buffer.from(candidate);
    parentPort.postMessage({ progress: { attempt: i + 1, total: qualities.length } });
    if (best.length <= limit) break;
  }
  const warnings = [];
  if (best.length === original.length) warnings.push('文件已较为紧凑，本次保留原文件内容，未增加体积。');
  const targetMet = settings.targetEnabled ? best.length <= limit : undefined;
  if (targetMet === false) warnings.push(settings.preset === 'lossless'
    ? '未达到目标体积。无损整理不会降低图片质量，可尝试均衡或强力压缩。'
    : '未达到目标体积。已在保留页面尺寸和文字的前提下尝试降低图片质量；目标不保证达成。');
  if (engineWarning) warnings.push('文件包含兼容性提示，请预览确认显示正常。');
  return { data: best, pageCount, targetMet, warning: warnings.join(' ') || undefined };
}
compress().then(result => parentPort.postMessage({ result })).catch(error => parentPort.postMessage({ error: error.message || 'PDF 压缩失败' }));
