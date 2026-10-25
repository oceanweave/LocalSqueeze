// Exercise the target resolver used by our installed Forge, including --targets overrides.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
require('ts-node').register({ transpileOnly: true, compilerOptions: { module: 'commonjs', moduleResolution: 'node' } });
const config = require('../forge.config.ts').default;
const makePath = require.resolve('@electron-forge/core/dist/api/make');
const resolver = new Module(makePath, module);
resolver.filename = makePath;
resolver.paths = Module._nodeModulePaths(path.dirname(makePath));
resolver._compile(fs.readFileSync(makePath, 'utf8') + '\nexports.resolveConfiguredTargets = generateTargets;', makePath);
const targets = resolver.exports.resolveConfiguredTargets;

(async () => {
  const [selected] = targets(config, ['@electron-forge/maker-squirrel']);
  const Squirrel = require('@electron-forge/maker-squirrel').default;
  const maker = selected.__isElectronForgeMaker ? selected : new Squirrel(selected.config, selected.platforms);
  await maker.prepareConfig('x64');
  const installer = require('electron-winstaller');
  let captured;
  const original = installer.createWindowsInstaller;
  installer.createWindowsInstaller = async options => { captured = options; };
  const temp = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'localsqueeze-release-'));
  try {
    await maker.make({ dir: temp, makeDir: path.join(temp, 'make'), targetArch: 'x64',
      packageJSON: require('../package.json'), appName: 'LocalSqueeze', forgeConfig: config });
    assert.equal(captured.name, 'LocalSqueeze', 'CLI override must retain the configured NuGet package name');
    assert.equal(captured.exe, 'LocalSqueeze.exe');
    assert.equal(captured.setupExe, 'LocalSqueeze-Setup.exe');
    assert.equal(captured.setupIcon, './src/assets/icons/win/icon.ico');
    assert.match(captured.name, /^[A-Za-z0-9_.-]+$/, 'NuGet name cannot contain npm scope/path separators');
    console.log('PASS actual Squirrel maker keeps Windows installer metadata with CLI targets');
  } finally {
    installer.createWindowsInstaller = original;
    fs.rmSync(temp, { recursive: true, force: true });
  }
  for (const platform of ['darwin', 'win32']) {
    const [zip] = targets(config, ['@electron-forge/maker-zip']);
    const Zip = require('@electron-forge/maker-zip').default;
    const instance = zip.__isElectronForgeMaker ? zip : new Zip(zip.config, zip.platforms);
    assert.ok(instance.platforms.includes(platform), `ZIP remains enabled for ${platform}`);
  }
  const [dmg] = targets(config, ['@electron-forge/maker-dmg']);
  const Dmg = require('@electron-forge/maker-dmg').default;
  const instance = dmg.__isElectronForgeMaker ? dmg : new Dmg(dmg.config, dmg.platforms);
  for (const [arch, suffix] of [['arm64', 'apple-silicon'], ['x64', 'intel']]) {
    await instance.prepareConfig(arch);
    assert.equal(instance.config.name, `LocalSqueeze-${suffix}`);
    assert.equal(instance.config.icon, './src/assets/icons/icon.icns');
  }
  console.log('PASS CLI targets retain Mac DMG configuration and Windows/Mac ZIP platforms');
})().catch(error => { console.error(error); process.exitCode = 1; });
