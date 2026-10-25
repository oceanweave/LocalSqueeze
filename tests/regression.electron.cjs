const { app } = require('electron');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const sharp = require('sharp');

const root = path.join(__dirname, '..');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'localsqueeze-regression-'));
app.setPath('userData', temp);
const timer = setTimeout(() => { console.error('FAIL test timeout'); app.exit(1); }, 180000);
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
      catch (error) { failures++; console.error(`FAIL ${name}: ${error.stack || error.message}`); }
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
      await test('PNG mode appears inside output format only when applicable and retains selection', async () => {
        assert.ok((await run('document.querySelector("#png-color-scope").textContent')).includes('仅对 PNG 原图生效'));
        assert.equal(await run('!!document.querySelector("#output-format-settings #png-color-preserve")'), true);
        await run('document.querySelector("#png-color-preserve").click()');
        for (const format of ['JPEG', 'WEBP', 'GIF']) {
          await run(`Array.from(document.querySelectorAll('button')).find(button=>button.textContent===${JSON.stringify(format)}).click()`);
          assert.equal(await run('!!document.querySelector("#png-color-mode-title")'), false);
          assert.equal(await run('!!document.querySelector("#png-color-preserve")'), false);
        }
        await run(`Array.from(document.querySelectorAll('button')).find(button=>button.textContent==='PNG').click()`);
        assert.equal(await run('document.querySelector("#png-color-preserve").checked'), true);
        assert.ok((await run('document.querySelector("#png-color-scope").textContent')).includes('当前输出为 PNG'));
        await sleep(100);
        const saved = await run('window.compression.getCompressionSettings()');
        assert.equal(saved.settings.outputFormat, 'png');
        assert.equal(saved.settings.keepFormat, false);
        assert.equal(saved.settings.optimizeColors, false);
        await run('document.querySelector("#keep-format").click()');
        assert.ok((await run('document.querySelector("#png-color-scope").textContent')).includes('保持原始格式'));
        await run('document.querySelector("#png-color-reduce").click()');
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
      const resizeInput = path.join(temp, 'resize-colors.png');
      await sharp({ create: { width: 400, height: 300, channels: 3, background: '#ff0000' } })
        .composite([{ input: await sharp({ create: { width: 200, height: 300, channels: 3, background: '#0000ff' } }).png().toBuffer(), left: 200, top: 0 }])
        .png().withExif({ IFD0: { Artist: 'private-person-for-test' } }).toFile(resizeInput);
      const resizeDefaults = { presetId: 'custom', width: 150, height: 200, dpi: 300, fit: 'crop', format: 'png', background: '#ffffff', quality: 90 };
      const resize = (settings = {}, crop = { unit: '%', x: 0, y: 0, width: 50, height: 100 }, inputPath = resizeInput) =>
        run(`window.electron.ipcRenderer.invoke('resize-image', ${JSON.stringify({ imagePath: inputPath, name: 'same-name.png', settings: { ...resizeDefaults, ...settings }, crop })})`);
      await test('resize generates exact pixels and the selected region without modifying source', async () => {
        const before = fs.readFileSync(resizeInput);
        const left = await resize();
        const right = await resize({}, { unit: '%', x: 50, y: 0, width: 50, height: 100 });
        assert.equal(left.success, true, left.error);
        assert.equal(right.success, true, right.error);
        assert.notEqual(left.image.outputPath, right.image.outputPath, 'duplicate names get independent outputs');
        const meta = await sharp(left.image.outputPath).metadata();
        assert.equal(meta.width, 150); assert.equal(meta.height, 200); assert.equal(meta.density, 300);
        assert.equal(meta.paletteBitDepth, undefined, 'resize PNG does not reduce colors');
        assert.ok(!meta.exif?.toString().includes('private-person-for-test'), 'source EXIF is removed');
        const red = await sharp(left.image.outputPath).removeAlpha().raw().toBuffer();
        const blue = await sharp(right.image.outputPath).removeAlpha().raw().toBuffer();
        assert.deepEqual([...red.subarray(0, 3)], [255, 0, 0]);
        assert.deepEqual([...blue.subarray(0, 3)], [0, 0, 255]);
        assert.deepEqual(fs.readFileSync(resizeInput), before);
      });
      await test('resize contain adds selected padding and stretch fills exact dimensions', async () => {
        const contain = await resize({ fit: 'contain', background: '#00ff00' });
        const stretch = await resize({ fit: 'stretch' });
        assert.equal(contain.success, true, contain.error); assert.equal(stretch.success, true, stretch.error);
        const padded = await sharp(contain.image.outputPath).removeAlpha().raw().toBuffer();
        const filled = await sharp(stretch.image.outputPath).removeAlpha().raw().toBuffer();
        assert.deepEqual([...padded.subarray(0, 3)], [0, 255, 0]);
        assert.deepEqual([...filled.subarray(0, 3)], [255, 0, 0]);
        assert.equal((await sharp(stretch.image.outputPath).metadata()).height, 200);
      });
      await test('resize normalizes EXIF orientation for both preview and crop', async () => {
        const rotated = path.join(temp, 'resize-oriented.jpg');
        await sharp(resizeInput).jpeg({ quality: 100 }).withMetadata({ orientation: 6 }).toFile(rotated);
        const prepared = await run(`window.electron.ipcRenderer.invoke('prepare-resize-image', ${JSON.stringify(rotated)})`);
        assert.equal(prepared.width, 300); assert.equal(prepared.height, 400);
        const preview = await sharp(Buffer.from(prepared.previewUrl.split(',')[1], 'base64')).metadata();
        assert.equal(preview.width, 300); assert.equal(preview.height, 400);
        const result = await resize({}, { unit: '%', x: 0, y: 50, width: 100, height: 50 }, rotated);
        assert.equal(result.success, true, result.error);
        const pixel = await sharp(result.image.outputPath).resize(1, 1).removeAlpha().raw().toBuffer();
        assert.ok(pixel[2] > 240 && pixel[0] < 10, 'oriented bottom half is blue');
      });
      await test('resize enlarges to requested pixels and handles transparent or animated input explicitly', async () => {
        const small = path.join(temp, 'resize-transparent.png');
        await sharp({ create: { width: 10, height: 20, channels: 4, background: '#00000000' } }).png().toFile(small);
        const jpeg = await resize({ fit:'stretch', format:'jpeg', background:'#ffffff' }, undefined, small);
        assert.equal(jpeg.success,true,jpeg.error);
        const meta = await sharp(jpeg.image.outputPath).metadata();
        assert.equal(meta.width,150);assert.equal(meta.height,200);assert.equal(meta.format,'jpeg');
        assert.deepEqual([...(await sharp(jpeg.image.outputPath).raw().toBuffer()).subarray(0,3)],[255,255,255]);
        const webp = await resize({fit:'contain',format:'webp'},undefined,small);
        assert.equal((await sharp(webp.image.outputPath).metadata()).format,'webp');
        const animated = path.join(temp,'resize-animated.gif');
        const frames=Buffer.alloc(16*32*3,100);frames.fill(220,16*16*3);
        await sharp(frames,{raw:{width:16,height:32,channels:3,pageHeight:16}}).gif({delay:[100,100],loop:0}).toFile(animated);
        assert.equal((await sharp(animated,{animated:true}).metadata()).pages,2);
        const prepared=await run(`window.electron.ipcRenderer.invoke('prepare-resize-image',${JSON.stringify(animated)})`);
        assert.ok(prepared.warning.includes('第一帧'));
        const result=await resize({fit:'stretch'},undefined,animated);
        assert.equal(result.success,true,result.error);assert.ok(result.image.warning.includes('第一帧'));
      });
      await test('resize rejects invalid dimensions, crop, format and corrupt input', async () => {
        for (const settings of [{ width: 0 }, { width: 1.5 }, { width: 20000, height: 20000 }, { format: 'bad' }, { dpi: 0 }]) {
          assert.equal((await resize(settings)).success, false);
        }
        assert.equal((await resize({}, { unit: '%', x: 80, y: 0, width: 50, height: 100 })).success, false);
        const invalid = path.join(temp, 'not-an-image.png');fs.writeFileSync(invalid, 'not an image');
        assert.equal((await run(`window.electron.ipcRenderer.invoke('prepare-resize-image', ${JSON.stringify(invalid)})`)).success, false);
      });
      await test('resize workbench pastes multiple images and crop frame responds to real dragging', async () => {
        await run(`document.querySelector('a[href="#/resize"]').click()`);
        await waitFor('!!document.querySelector("#resize-workspace")', 'resize workbench');
        const image = fs.readFileSync(resizeInput).toString('base64');
        await run(`(() => { const data=new DataTransfer(); for(let n=0;n<2;n++) data.items.add(new File([Uint8Array.from(atob('${image}'),c=>c.charCodeAt(0))],'same.png',{type:'image/png'})); document.body.dispatchEvent(new ClipboardEvent('paste',{bubbles:true,cancelable:true,clipboardData:data})); })()`);
        await waitFor('document.querySelectorAll("[aria-label=待处理图片] > div").length===2', 'two pasted inputs');
        await run('document.querySelector("#resize-mode-dimensions").click()');
        await run('document.querySelector("#resize-pixels-150x200").click()');
        window.setSize(1400, 1100);
        await run('document.querySelector("#resize-canvas").scrollIntoView({block:"center"})');
        await sleep(100);
        const before = await run(`(() => { const e=document.querySelector('.ReactCrop__crop-selection'), r=e.getBoundingClientRect(); return {left:e.style.left,x:r.x+r.width/2,y:r.y+r.height/2}; })()`);
        window.webContents.sendInputEvent({type:'mouseDown',x:Math.round(before.x),y:Math.round(before.y),button:'left',clickCount:1});
        window.webContents.sendInputEvent({type:'mouseMove',x:Math.round(before.x+35),y:Math.round(before.y)});
        window.webContents.sendInputEvent({type:'mouseUp',x:Math.round(before.x+35),y:Math.round(before.y),button:'left',clickCount:1});
        await sleep(100);
        const after = await run('document.querySelector(".ReactCrop__crop-selection").style.left');
        assert.ok(parseFloat(after)>parseFloat(before.left), 'dragging moves the selected crop');
        const handle = await run(`(() => { const e=document.querySelector('.ReactCrop__drag-handle.ord-se'), r=e.getBoundingClientRect(); return {x:r.x+r.width/2,y:r.y+r.height/2,width:document.querySelector('.ReactCrop__crop-selection').style.width}; })()`);
        window.webContents.sendInputEvent({type:'mouseDown',x:Math.round(handle.x),y:Math.round(handle.y),button:'left',clickCount:1});
        window.webContents.sendInputEvent({type:'mouseMove',x:Math.round(handle.x-20),y:Math.round(handle.y-25)});
        window.webContents.sendInputEvent({type:'mouseUp',x:Math.round(handle.x-20),y:Math.round(handle.y-25),button:'left',clickCount:1});
        await sleep(100);
        assert.ok(parseFloat(await run('document.querySelector(".ReactCrop__crop-selection").style.width')) < parseFloat(handle.width), 'corner handle resizes the crop');
        await run('document.querySelector(".ReactCrop__crop-selection").focus()');
        const keyboardBefore = parseFloat(await run('document.querySelector(".ReactCrop__crop-selection").style.left'));
        window.webContents.sendInputEvent({type:'keyDown',keyCode:'Right'});
        window.webContents.sendInputEvent({type:'keyUp',keyCode:'Right'});
        await sleep(100);
        assert.ok(parseFloat(await run('document.querySelector(".ReactCrop__crop-selection").style.left')) > keyboardBefore, 'keyboard nudges crop');
        fs.writeFileSync(path.join(temp, 'resize-workbench.png'), (await window.webContents.capturePage()).toPNG());
        console.log('Resize preview: ' + path.join(temp, 'resize-workbench.png'));
      });
      await test('resize batch and separate exports preserve workbench without changing compression stats', async () => {
        const before = await run('window.stats.getStats()');
        await run('document.querySelector("#resize-generate-all").click()');
        await waitFor('document.querySelector("#resize-status").textContent.includes("成功 2 张")', 'resize batch');
        const after = await run('window.stats.getStats()');
        assert.equal(after.stats.totalProcessedImages, before.stats.totalProcessedImages);
        const history = await run('window.stats.getRecentImages(1000)');
        const resized = history.images.filter(image=>image.operation==='resize');
        assert.equal(resized.length, 2);
        for (const image of resized) {
          const meta = await sharp(image.outputPath).metadata();
          assert.equal(meta.width,150);assert.equal(meta.height,200);
        }
        await run(`document.querySelector('a[href="#/resize/export"]').click()`);
        await waitFor('document.querySelectorAll("#export-workspace article").length===2', 'resize export list');
        assert.equal(await run('document.querySelector("#export-workspace").dataset.operation'), 'resize');
        await run(`document.querySelector('a[href="#/export"]').click()`);
        await waitFor('document.querySelector("#export-workspace")?.dataset.operation==="compression"', 'compression export list');
        assert.equal(await run('document.querySelectorAll("#export-workspace article").length'), history.images.length-2);
        await run(`document.querySelector('a[href="#/resize"]').click()`);
        await waitFor('!!document.querySelector("#resize-workspace")', 'return to workbench');
        assert.equal(await run('document.querySelector("#resize-width").value'), '150');
        assert.equal(await run('document.querySelectorAll("[aria-label=待处理图片] > div").length'),2);
        assert.equal(await run('!!document.querySelector("#resize-save")'), true);
        const destination = path.join(temp,'exported-resize');
        const first = await run(`window.electron.ipcRenderer.invoke('export-all-files',${JSON.stringify({files:resized.map(i=>i.outputPath),outputDir:destination})})`);
        assert.equal(first.success,true);assert.equal(first.exportedCount,2);
        assert.equal(fs.readdirSync(destination).length,2,'same input name does not overwrite another result');
        await run(`window.electron.ipcRenderer.invoke('export-all-files',${JSON.stringify({files:[resized[0].outputPath],outputDir:destination})})`);
        assert.equal(fs.readdirSync(destination).length,3,'existing export remains intact');
      });
      const field = (selector,value) => run(`(()=>{const input=document.querySelector(${JSON.stringify(selector)});Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,${JSON.stringify(String(value))});input.dispatchEvent(new Event('input',{bubbles:true}));})()`);
      const select = (selector,value) => run(`(()=>{const input=document.querySelector(${JSON.stringify(selector)});input.value=${JSON.stringify(value)};input.dispatchEvent(new Event('change',{bubbles:true}));})()`);
      const generate = async () => {
        const before=await run('window.stats.getRecentImages(1)');
        await run('document.querySelector("#resize-generate").click()');
        await waitFor(`!document.querySelector('#resize-generate').disabled && document.querySelector('#resize-status').textContent.includes('成功 1 张')`,'generate required size',400);
        const after=await run('window.stats.getRecentImages(1)');
        assert.notEqual(after.images[0].id,before.images[0]?.id,'a new result was generated');return after.images[0];
      };
      await test('requirement UI hides technical settings and one-inch needs only its preset',async()=>{
        await run('document.querySelector("#resize-mode-photo").click()');await select('#resize-preset','one-inch');
        assert.equal(await run('document.querySelector("#resize-advanced").open'),false);
        assert.equal(await run('document.querySelector("#resize-dpi").checkVisibility()'),false);
        assert.equal(await run('!!document.querySelector("#resize-width")'),false);
        assert.equal(await run('document.querySelector("#resize-compression-enabled").checked'),false);
        const result=await generate();assert.equal(result.width,295);assert.equal(result.height,413);
      });
      await test('physical dimensions convert units without changing the requested print size',async()=>{
        await run('document.querySelector("#resize-mode-dimensions").click()');await select('#resize-unit','cm');
        await field('#resize-width',3);await field('#resize-height',4);
        let result=await generate();assert.equal(result.width,354);assert.equal(result.height,472);
        await select('#resize-unit','mm');
        assert.equal(await run('document.querySelector("#resize-width").value'),'30');
        assert.equal(await run('document.querySelector("#resize-height").value'),'40');
        await run('document.querySelector("#resize-advanced").open=true');await field('#resize-dpi',600);
        result=await generate();assert.equal(result.width,709);assert.equal(result.height,945);
        await field('#resize-dpi',300);await run('document.querySelector("#resize-advanced").open=false');
      });
      await test('one-side and maximum-size requirements retain the entire image',async()=>{
        await select('#resize-unit','px');await select('#resize-dimension-policy','width');await field('#resize-width',150);
        let result=await generate();assert.equal(result.width,150);assert.equal(result.height,113);
        assert.equal(await run('!!document.querySelector(".ReactCrop__crop-selection")'),false);
        await select('#resize-dimension-policy','height');await field('#resize-height',200);
        result=await generate();assert.equal(result.width,267);assert.equal(result.height,200);
        await select('#resize-dimension-policy','within');await field('#resize-width',100);await field('#resize-height',100);
        result=await generate();assert.equal(result.width,100);assert.equal(result.height,75);
      });
      await test('aspect ratio cropping supports native size, specified pixels and custom ratios',async()=>{
        await run('document.querySelector("#resize-mode-ratio").click()');
        await run(`Array.from(document.querySelectorAll('button')).find(b=>b.textContent==='16:9').click()`);
        let result=await generate();assert.equal(result.width*9,result.height*16);
        await select('#resize-ratio-output','width');await field('#resize-ratio-output-width',1920);
        result=await generate();assert.equal(result.width,1920);assert.equal(result.height,1080);
        await run(`Array.from(document.querySelectorAll('button')).find(b=>b.textContent==='自定义').click()`);
        await field('#resize-ratio-width',5);await field('#resize-ratio-height',4);await field('#resize-ratio-output-width',500);
        result=await generate();assert.equal(result.width,500);assert.equal(result.height,400);
      });
      await test('batch percentage scaling calculates each source independently',async()=>{
        const portrait=await sharp({create:{width:200,height:400,channels:3,background:'#00ff00'}}).png().toBuffer();
        await run(`(()=>{const d=new DataTransfer();d.items.add(new File([Uint8Array.from(atob('${portrait.toString('base64')}'),c=>c.charCodeAt(0))],'portrait.png',{type:'image/png'}));document.body.dispatchEvent(new ClipboardEvent('paste',{bubbles:true,cancelable:true,clipboardData:d}));})()`);
        await waitFor('document.querySelectorAll("[aria-label=待处理图片] > div").length===3','mixed-size inputs');
        await run('document.querySelector("#resize-mode-scale").click()');await field('#resize-percent',50);
        await run('document.querySelector("#resize-generate-all").click()');
        await waitFor('document.querySelector("#resize-status").textContent.includes("成功 3 张")','mixed batch',400);
        const history=await run('window.stats.getRecentImages(3)');
        assert.deepEqual(history.images.map(i=>`${i.width}x${i.height}`).sort(),['100x200','200x150','200x150']);
      });
      await test('compression is optional, shares color strategy and never changes the required pixels',async()=>{
        const lossless=await resize({width:300,height:200,fit:'stretch',format:'png',compressionEnabled:false},undefined,input);
        const reduced=await resize({width:300,height:200,fit:'stretch',format:'png',compressionEnabled:true,optimizeColors:true,quality:20},undefined,input);
        assert.equal(lossless.success,true,lossless.error);assert.equal(reduced.success,true,reduced.error);
        assert.ok(reduced.image.compressedSize<lossless.image.compressedSize);
        const limited=await resize({width:300,height:200,fit:'stretch',format:'jpeg',compressionEnabled:true,quality:90,targetSizeKB:20},undefined,input);
        assert.equal(limited.success,true,limited.error);assert.equal(limited.image.targetMet,true);
        assert.ok(limited.image.compressedSize<20*1024);assert.equal(limited.image.width,300);assert.equal(limited.image.height,200);
        const impossible=await resize({compressionEnabled:true,targetSizeKB:1},undefined,input);
        assert.equal(impossible.success,true,impossible.error);assert.equal(impossible.image.targetMet,false);assert.ok(impossible.image.warning.includes('保持指定像素'));
        assert.equal(impossible.image.width,150);assert.equal(impossible.image.height,200);
        assert.equal((await resize({compressionEnabled:false,targetSizeKB:20})).success,false);
        await run('document.querySelector("#resize-mode-dimensions").click()');await select('#resize-dimension-policy','exact');await run('document.querySelector("#resize-pixels-150x200").click()');
        await select('#resize-format','png');await run('document.querySelector("#resize-compression-enabled").click()');
        await run(`Array.from(document.querySelectorAll('button')).find(b=>b.textContent.includes('套用“图片压缩”')).click()`);await sleep(100);
        const shared=await run('window.compression.getCompressionSettings()');
        assert.equal(await run('document.querySelector("#resize-quality").value'),String(100-shared.settings.quality));
        assert.equal(await run('document.querySelector("#resize-format").value'),'png');
        const textured=await sharp(input).resize(400,300).png().toBuffer();
        await run(`(()=>{const d=new DataTransfer();d.items.add(new File([Uint8Array.from(atob('${textured.toString('base64')}'),c=>c.charCodeAt(0))],'texture.png',{type:'image/png'}));document.body.dispatchEvent(new ClipboardEvent('paste',{bubbles:true,cancelable:true,clipboardData:d}));})()`);
        await waitFor('document.querySelectorAll("[aria-label=待处理图片] > div").length===4','textured input');
        await select('#resize-png-colors','preserve');
        await run('document.querySelector("#resize-target-enabled").click()');await field('#resize-target-size',1);
        const generated=await generate();assert.equal(generated.targetMet,false);assert.equal(generated.width,150);assert.equal(generated.height,200);
        assert.ok((await run('document.querySelector("#resize-status").textContent')).includes('未达到文件大小要求'));
        await run('document.querySelector("#resize-compression-enabled").click()');
        assert.equal(await run('!!document.querySelector("#resize-target-size")'),false);
        assert.equal(JSON.parse(await run('localStorage.getItem("resizeSettings")')).targetEnabled,false);
        assert.deepEqual(await run('window.testAlerts'),[]);
      });
    } catch (error) { failures++; console.error(error); }
    clearTimeout(timer);
    app.exit(failures ? 1 : 0);
  });
});
require(path.join(root, '.vite/build/main.js'));
