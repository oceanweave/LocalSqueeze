const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const { Worker } = require('node:worker_threads');
const { createFixtures } = require('../tests/pdf-fixtures.cjs');
async function main() {
  const [platform, arch] = process.argv.slice(2);
  if (!platform || !arch) throw new Error('Usage: node scripts/verify-pdf-runtime.cjs <platform> <arch>');
  const app = path.join(__dirname, '..', 'out', `LocalSqueeze-${platform}-${arch}`);
  const resources = platform === 'darwin' ? path.join(app, 'LocalSqueeze.app', 'Contents', 'Resources') : path.join(app, 'resources');
  const dependency = path.join(resources, 'app.asar.unpacked', 'node_modules', '@neslinesli93', 'qpdf-wasm', 'dist');
  for (const file of [path.join(dependency, 'qpdf.js'), path.join(dependency, 'qpdf.wasm'), path.join(resources, 'THIRD_PARTY_NOTICES.md'), path.join(resources, 'licenses', 'Apache-2.0.txt')]) assert.ok(fs.statSync(file).size > 0, `Missing packaged PDF runtime: ${file}`);
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'localsqueeze-packaged-pdf-'));
  const { input } = await createFixtures(temp);
  await new Promise((resolve, reject) => {
    const worker = new Worker(fs.readFileSync(path.join(__dirname, '../src/server/pdf/worker.cjs'), 'utf8'), { eval: true, workerData: {
      inputPath: input, settings: { preset: 'balanced', imageQuality: 75 }, modulePath: path.join(dependency, 'qpdf.js'), wasmPath: path.join(dependency, 'qpdf.wasm')
    } });
    const timer = setTimeout(() => { worker.terminate(); reject(new Error('Packaged PDF runtime timeout')); }, 60000);
    worker.on('message', message => {
      if (message.progress) return;
      clearTimeout(timer); worker.terminate();
      if (message.error) { reject(new Error(message.error)); return; }
      try { assert.equal(message.result.pageCount, 2); assert.ok(message.result.data.length < fs.statSync(input).size / 2); resolve(); }
      catch (error) { reject(error); }
    });
    worker.on('error', error => { clearTimeout(timer); reject(error); });
  });
  fs.rmSync(temp, { recursive: true, force: true });
  console.log(`PASS ${platform}-${arch}: bundled QPDF JS/WASM and licenses present; real PDF compression works`);
}
main().catch(error => { console.error(error); process.exitCode = 1; });
