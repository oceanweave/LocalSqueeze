const { app } = require('electron');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const sharp = require('sharp');

const root = path.join(__dirname, '..');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'localsqueeze-regression-'));
app.setPath('userData', temp);
const timer = setTimeout(() => { console.error('FAIL test timeout'); app.exit(1); }, 120000);
app.on('browser-window-created', (_, window) => {
  window.webContents.once('did-finish-load', async () => {
    let failures = 0;
    const run = code => window.webContents.executeJavaScript(code, true);
    const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
    const waitFor = async (code, label, attempts = 100) => {
      for (let attempt = 0; attempt < attempts; attempt++) {
        if (await run(code)) return;
        await sleep(50);
      }
      throw new Error(`Timed out: ${label}`);
    };
    const test = async (name, fn) => {
      try { await fn(); console.log(`PASS ${name}`); }
      catch (error) { failures++; console.error(`FAIL ${name}: ${error.message}`); }
    };
    try {
      await waitFor('!!window.compression && !!document.querySelector("nav")', 'app ready');
      await run('window.testAlerts=[]; window.alert=message=>window.testAlerts.push(message); undefined;');
      const input = path.join(temp, 'screenshot.png');
      const pixels = Buffer.alloc(960 * 640 * 3);
      let seed = 42;
      for (let i = 0; i < pixels.length; i++) {
        seed = (1664525 * seed + 1013904223) >>> 0;
        pixels[i] = seed >>> 24;
      }
      await sharp(pixels, { raw: { width: 960, height: 640, channels: 3 } }).png().withMetadata().toFile(input);
      const defaults = { quality: 80, keepDimensions: true, keepFormat: true, removeMetadata: true, optimizeColors: true, progressive: false };
      let index = 0;
      const compress = async (patch = {}) => {
        const settings = { ...defaults, ...patch };
        const output = path.join(temp, `output-${index++}.${settings.keepFormat ? 'png' : settings.outputFormat}`);
        const result = await run(`window.compression.compressImage(${JSON.stringify(input)}, ${JSON.stringify(settings)}, ${JSON.stringify(output)})`);
        assert.equal(result.success, true, result.error);
        return result;
      };
      await test('selected WebP format matches actual encoded bytes', async () => {
        const result = await compress({ keepFormat: false, outputFormat: 'webp' });
        assert.equal((await sharp(result.outputPath).metadata()).format, 'webp');
      });
      await test('remove metadata actually removes ICC and EXIF', async () => {
        const result = await compress();
        const metadata = await sharp(result.outputPath).metadata();
        assert.equal(metadata.icc, undefined);
        assert.equal(metadata.exif, undefined);
      });
      await test('PNG strength reduces file size', async () => {
        const high = await compress({ quality: 80 });
        const low = await compress({ quality: 17 });
        console.log(`PNG quality 80: ${high.compressedSize}, quality 17: ${low.compressedSize}`);
        assert.ok(low.compressedSize < high.compressedSize * 0.8);
      });
      await test('PNG color preservation retains gradient pixels and alpha', async () => {
        const gradient = path.join(temp, 'gradient.png');
        const rgba = Buffer.alloc(256 * 128 * 4);
        for (let y = 0; y < 128; y++) for (let x = 0; x < 256; x++) {
          const offset = (y * 256 + x) * 4;
          rgba[offset] = x; rgba[offset + 1] = y * 2; rgba[offset + 2] = 128; rgba[offset + 3] = (x + y) % 256;
        }
        await sharp(rgba, { raw: { width: 256, height: 128, channels: 4 } }).png().toFile(gradient);
        const result = await run(`window.compression.compressImage(${JSON.stringify(gradient)}, ${JSON.stringify({ ...defaults, quality: 20, optimizeColors: false })}, ${JSON.stringify(path.join(temp, 'gradient-preserved.png'))})`);
        assert.equal(result.success, true, result.error);
        assert.deepEqual(await sharp(result.outputPath).raw().toBuffer(), await sharp(gradient).raw().toBuffer());
      });
      await test('size target never silently reduces colors in PNG preserve mode', async () => {
        const result = await compress({ optimizeColors: false, targetSizeKB: 1, targetAllowResize: false });
        assert.equal(result.targetMet, false);
        assert.ok(result.warning);
        assert.deepEqual(await sharp(result.outputPath).raw().toBuffer(), await sharp(input).raw().toBuffer());
      });
      await test('optional target produces strictly less than 200 KB', async () => {
        const result = await compress({ targetSizeKB: 200, targetAllowResize: true });
        assert.ok(result.compressedSize < 200 * 1024, `actual bytes ${result.compressedSize}`);
        assert.equal(result.targetMet, true);
      });
      await test('unreachable target warns and keeps requested dimensions', async () => {
        const result = await compress({ targetSizeKB: 1, targetAllowResize: false });
        assert.equal(result.targetMet, false);
        assert.ok(result.warning);
        assert.equal(result.width, 960);
        assert.equal(result.height, 640);
      });
      await test('target permits proportional downscale when needed', async () => {
        const result = await compress({ targetSizeKB: 10, targetAllowResize: true });
        assert.ok(result.compressedSize < 10 * 1024);
        assert.equal(result.targetMet, true);
        assert.ok(result.width < 960);
        assert.ok(Math.abs(result.width / result.height - 1.5) < 0.02);
      });
      await test('batch uses the same format and target behavior', async () => {
        const result = await run(`window.compression.batchCompressImages([${JSON.stringify(input)}], ${JSON.stringify({ ...defaults, keepFormat: false, outputFormat: 'webp', targetSizeKB: 50, targetAllowResize: true })}, ${JSON.stringify(path.join(temp, 'batch'))})`);
        assert.equal(result.success, true);
        assert.equal(result.results[0].success, true);
        assert.ok(result.results[0].compressedSize < 50 * 1024);
        assert.equal((await sharp(result.results[0].outputPath).metadata()).format, 'webp');
      });
      await test('quality zero is clamped and invalid targets are rejected', async () => {
        await compress({ quality: 0 });
        const invalid = await run(`window.compression.compressImage(${JSON.stringify(input)}, ${JSON.stringify({ ...defaults, targetSizeKB: -1 })})`);
        assert.equal(invalid.success, false);
        assert.ok(invalid.error.includes('目标体积'));
      });
      await test('JPEG orientation is preserved visually and transparency becomes white', async () => {
        const oriented = path.join(temp, 'oriented.jpg');
        await sharp({ create: { width: 80, height: 40, channels: 3, background: '#dd8811' } })
          .jpeg().withMetadata({ orientation: 6 }).toFile(oriented);
        const result = await run(`window.compression.compressImage(${JSON.stringify(oriented)}, ${JSON.stringify(defaults)}, ${JSON.stringify(path.join(temp, 'rotated.jpg'))})`);
        assert.equal(result.success, true);
        assert.equal(result.width, 40);
        assert.equal(result.height, 80);
        const transparent = path.join(temp, 'transparent.png');
        await sharp({ create: { width: 16, height: 16, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).png().toFile(transparent);
        const flattened = await run(`window.compression.compressImage(${JSON.stringify(transparent)}, ${JSON.stringify({ ...defaults, keepFormat: false, outputFormat: 'jpeg' })}, ${JSON.stringify(path.join(temp, 'white.jpg'))})`);
        assert.equal(flattened.success, true);
        const pixel = await sharp(flattened.outputPath).raw().toBuffer();
        assert.ok(pixel[0] > 250 && pixel[1] > 250 && pixel[2] > 250);
      });
      await test('already-small same-format image does not grow', async () => {
        const small = path.join(temp, 'small.png');
        await sharp({ create: { width: 32, height: 32, channels: 3, background: '#ff0000' } }).png().toFile(small);
        const result = await run(`window.compression.compressImage(${JSON.stringify(small)}, ${JSON.stringify(defaults)}, ${JSON.stringify(path.join(temp, 'small-output.png'))})`);
        assert.equal(result.success, true);
        assert.ok(result.compressedSize <= result.originalSize);
      });
      await test('animated GIF keeps its frames', async () => {
        const animated = path.join(temp, 'animated.gif');
        const frames = Buffer.alloc(32 * 64 * 3, 0);
        frames.fill(255, 0, 32 * 32 * 3);
        await sharp(frames, { raw: { width: 32, height: 64, channels: 3, pageHeight: 32 } })
          .gif({ delay: [100, 100], loop: 0 }).toFile(animated);
        const result = await run(`window.compression.compressImage(${JSON.stringify(animated)}, ${JSON.stringify(defaults)}, ${JSON.stringify(path.join(temp, 'animated-output.gif'))})`);
        assert.equal(result.success, true);
        assert.equal((await sharp(result.outputPath, { animated: true }).metadata()).pages, 2);
      });
      await test('legacy PNG settings migrate to the actual prior palette behavior', async () => {
        await run(`window.compression.saveCompressionSettings({quality:17,optimizeColors:false})`);
        const saved = await run('window.compression.getCompressionSettings()');
        assert.equal(saved.settings.settingsVersion, 2);
        assert.equal(saved.settings.quality, 17);
        assert.equal(saved.settings.optimizeColors, true);
      });
      await test('PNG mode persists through preset changes and page navigation', async () => {
        await run(`document.querySelector('a[href="#/settings"]').click()`);
        await waitFor('!!document.querySelector("#png-color-reduce")', 'color mode controls');
        assert.equal(await run('document.querySelector("#png-color-reduce").checked'), true);
        await run('document.querySelector("#png-color-preserve").click()');
        await run(`Array.from(document.querySelectorAll('button')).find(button=>button.textContent==='轻度压缩').click()`);
        await sleep(100);
        let saved = await run('window.compression.getCompressionSettings()');
        assert.equal(saved.settings.optimizeColors, false);
        assert.equal(saved.settings.quality, 80);
        await run(`document.querySelector('a[href="#/"]').click()`);
        await run(`document.querySelector('a[href="#/settings"]').click()`);
        await waitFor('!!document.querySelector("#png-color-preserve")', 'saved color mode');
        assert.equal(await run('document.querySelector("#png-color-preserve").checked'), true);
        await run('document.querySelector("#png-color-reduce").click()');
        await sleep(100);
        saved = await run('window.compression.getCompressionSettings()');
        assert.equal(saved.settings.optimizeColors, true);
      });
      await test('changing a checkbox persists its new value', async () => {
        await waitFor('!!document.querySelector("#keep-dimensions")', 'settings loaded');
        await run('document.querySelector("#keep-dimensions").click()');
        await sleep(300);
        const saved = await run('window.compression.getCompressionSettings()');
        assert.equal(saved.settings.keepDimensions, false);
      });
      await test('optional target setting persists and reaches paste compression', async () => {
        await waitFor('!!document.querySelector("#target-enabled")', 'target controls');
        await run('document.querySelector("#target-enabled").click()');
        await sleep(100);
        await run(`(() => { const input=document.querySelector('#target-size'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'73'); input.dispatchEvent(new Event('input',{bubbles:true})); })()`);
        await sleep(100);
        let saved = await run('window.compression.getCompressionSettings()');
        assert.equal(saved.settings.targetSizeKB, 73);
        await run(`Array.from(document.querySelectorAll('button')).find(button=>button.textContent==='200 KB').click()`);
        await sleep(100);
        saved = await run('window.compression.getCompressionSettings()');
        assert.equal(saved.settings.targetEnabled, true);
        assert.equal(saved.settings.targetSizeKB, 200);
        window.setSize(1100, 900);
        fs.writeFileSync(path.join(temp, 'settings-preview.png'), (await window.webContents.capturePage()).toPNG());
        console.log('Settings preview: ' + path.join(temp, 'settings-preview.png'));
        await run(`document.querySelector('a[href="#/process"]').click()`);
        await waitFor('!!document.querySelector("input[type=file]")', 'process page');
        const image = fs.readFileSync(input).toString('base64');
        await run(`(() => { const data=new DataTransfer(); data.items.add(new File([Uint8Array.from(atob('${image}'),c=>c.charCodeAt(0))],'image.png',{type:'image/png'})); document.body.dispatchEvent(new ClipboardEvent('paste',{bubbles:true,cancelable:true,clipboardData:data})); })()`);
        await waitFor('document.body.innerText.includes("所有文件已处理")', 'paste compressed', 400);
        const recent = await run('window.stats.getRecentImages(1)');
        assert.ok(recent.images[0].compressedSize < 200 * 1024);
        assert.deepEqual(await run('window.testAlerts'), []);
      });
      await test('quick settings link stays inside packaged app', async () => {
        await run(`document.querySelector('a[href="#/process"]').click()`);
        await waitFor('!!Array.from(document.querySelectorAll("a")).find(a=>a.textContent.includes("前往压缩设置"))', 'settings link');
        await run(`Array.from(document.querySelectorAll('a')).find(a=>a.textContent.includes('前往压缩设置')).click()`);
        await sleep(150);
        const state = await run('({url:location.href,settings:document.body.innerText.includes("压缩预设")})');
        assert.equal(state.settings, true, state.url);
        assert.ok(state.url.includes('#/settings'));
      });
    } catch (error) { failures++; console.error(error); }
    clearTimeout(timer);
    app.exit(failures ? 1 : 0);
  });
});
require(path.join(root, '.vite/build/main.js'));
