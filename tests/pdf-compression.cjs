const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const { Worker } = require('node:worker_threads');
const { PDFDocument, PDFName, PDFArray, PDFRawStream, decodePDFRawStream } = require('pdf-lib');
require('ts-node').register({ transpileOnly: true, compilerOptions: { module: 'CommonJS' } });
const { normalizePdfSettings } = require('../src/lib/pdf-settings.ts');
const { createFixtures } = require('./pdf-fixtures.cjs');
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'localsqueeze-pdf-test-'));
const workerSource = fs.readFileSync(path.join(__dirname, '../src/server/pdf/worker.cjs'), 'utf8');
function compress(inputPath, settings = {}) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(workerSource, { eval: true, workerData: {
      inputPath, settings: normalizePdfSettings(settings),
      modulePath: require.resolve('@neslinesli93/qpdf-wasm'), wasmPath: require.resolve('@neslinesli93/qpdf-wasm/dist/qpdf.wasm')
    } });
    const timer = setTimeout(() => { worker.terminate(); reject(new Error('Worker timeout')); }, 60000);
    worker.on('message', message => {
      if (message.progress) return;
      clearTimeout(timer); worker.terminate();
      if (message.error) reject(new Error(message.error)); else resolve(message.result);
    });
    worker.on('error', error => { clearTimeout(timer); reject(error); });
  });
}
function contents(document) {
  return document.getPages().map(page => {
    const content = page.node.Contents();
    const streams = content instanceof PDFArray ? content.asArray().map(ref => document.context.lookup(ref)) : content ? [content] : [];
    return streams.map(stream => Buffer.from(decodePDFRawStream(stream).decode()).toString()).join('\n').replace(/\s+/g, ' ').trim();
  });
}
async function main() {
  const { input, signedPath } = await createFixtures(directory);
  const original = fs.readFileSync(input);
  const source = await PDFDocument.load(original);
  const lossless = await compress(input, { preset: 'lossless' });
  const balanced = await compress(input);
  const strong = await compress(input, { preset: 'strong' });
  for (const [name, result] of Object.entries({ lossless, balanced, strong })) {
    assert.equal(result.pageCount, 2);
    assert.ok(result.data.length <= original.length);
    const document = await PDFDocument.load(result.data, { updateMetadata: false });
    assert.equal(document.getPageCount(), 2);
    assert.deepEqual(document.getPages().map(p => p.getSize()), source.getPages().map(p => p.getSize()));
    assert.deepEqual(contents(document), contents(source), 'Text and vector page streams must remain intact');
    const masks = doc => doc.context.enumerateIndirectObjects().filter(([, object]) => object instanceof PDFRawStream && object.dict.has(PDFName.of('SMask'))).length;
    assert.equal(masks(document), masks(source), 'Transparency soft mask must be preserved');
    assert.equal(document.getForm().getTextField('test.name').getText(), 'LocalSqueeze');
    const annotations = document.getPage(0).node.Annots().asArray().map(ref => document.context.lookup(ref));
    const link = annotations.find(annot => annot.get(PDFName.of('Subtype'))?.toString() === '/Link');
    assert.equal(link.lookup(PDFName.of('A')).lookup(PDFName.of('URI')).decodeText(), 'https://example.com');
    fs.writeFileSync(path.join(directory, `${name}.pdf`), result.data);
    console.log(`PASS ${name}: ${original.length} -> ${result.data.length} bytes, pages/text/vectors/form/link preserved`);
  }
  assert.ok(balanced.data.length < original.length * 0.5, 'Image-heavy PDF must actually shrink');
  assert.ok(strong.data.length < balanced.data.length, 'Strong compression must have a measurable effect');
  const target = await compress(input, { targetEnabled: true, targetSizeMB: 2 });
  assert.equal(target.targetMet, true);
  assert.ok(target.data.length < 2 * 1024 * 1024);
  const impossible = await compress(input, { targetEnabled: true, targetSizeMB: 0.01 });
  assert.equal(impossible.targetMet, false);
  assert.match(impossible.warning, /未达到/);
  const preserve = await compress(input, { preset: 'lossless', targetEnabled: true, targetSizeMB: 0.01 });
  assert.equal(preserve.targetMet, false);
  assert.match(preserve.warning, /无损/);
  console.log('PASS optional targets report actual byte result and do not override lossless mode');
  await assert.rejects(compress(signedPath), /签名/);
  const invalid = path.join(directory, 'broken.pdf');
  fs.writeFileSync(invalid, '%PDF-1.7\ninvalid');
  await assert.rejects(compress(invalid), /结构异常|损坏/);
  const module = await require('@neslinesli93/qpdf-wasm')({ noInitialRun: true, wasmBinary: fs.readFileSync(require.resolve('@neslinesli93/qpdf-wasm/dist/qpdf.wasm')) });
  module.FS.writeFile('/input.pdf', original);
  assert.equal(module.callMain(['/input.pdf', '--encrypt', 'secret', 'owner', '256', '--', '/encrypted.pdf']), 0);
  const encrypted = path.join(directory, 'encrypted.pdf');
  fs.writeFileSync(encrypted, module.FS.readFile('/encrypted.pdf'));
  await assert.rejects(compress(encrypted), /加密/);
  console.log('PASS signed, corrupt and encrypted PDFs fail clearly');
  assert.deepEqual(fs.readFileSync(input), original, 'Original must remain unchanged');
  const tiny = await PDFDocument.create(); tiny.addPage().drawText('Text only');
  const tinyPath = path.join(directory, 'tiny.pdf'); fs.writeFileSync(tinyPath, await tiny.save());
  const compact = await compress(tinyPath);
  assert.ok(compact.data.length <= fs.statSync(tinyPath).size);
  console.log('PASS no-growth fallback and original file protection');
  const photo = await PDFDocument.create();
  const jpeg = await photo.embedJpg(await require('sharp')(path.join(__dirname, '../src/assets/icons/win/pexels-gn0me-32296411.jpg')).resize(1600, 2100, { fit: 'inside' }).jpeg({ quality: 95 }).toBuffer());
  photo.addPage().drawImage(jpeg, { x: 0, y: 0, width: 400, height: 550 });
  const jpegPath = path.join(directory, 'jpeg-scan.pdf'); fs.writeFileSync(jpegPath, await photo.save());
  const recompressed = await compress(jpegPath, { preset: 'strong' });
  assert.ok(recompressed.data.length < fs.statSync(jpegPath).size * 0.8, 'Existing JPEG scans must also benefit from quality control');
  console.log('PASS existing JPEG image recompression and PNG transparency masks');
  console.log(`PDF fixtures: ${directory}`);
}
main().catch(error => { console.error(error); process.exitCode = 1; });
