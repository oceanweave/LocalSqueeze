const path = require('node:path');
const { builtinModules } = require('node:module');
const { spawnSync } = require('node:child_process');
const { build } = require('vite');

async function main() {
  const root = path.join(__dirname, '..');
  process.chdir(root);
  for (const entry of ['main', 'preload']) {
    await build({
      configFile: `vite.${entry}.config.ts`,
      define: {
        MAIN_WINDOW_VITE_DEV_SERVER_URL: 'undefined',
        MAIN_WINDOW_VITE_NAME: JSON.stringify('main_window')
      },
      build: {
        outDir: '.vite/build',
        emptyOutDir: false,
        lib: { entry: `src/${entry}.ts`, formats: ['cjs'], fileName: () => `${entry}.js` },
        rollupOptions: { external: ['electron', 'sharp', '@neslinesli93/qpdf-wasm', ...builtinModules, ...builtinModules.map(name => `node:${name}`)] }
      }
    });
  }
  await build({ configFile: 'vite.renderer.config.ts', base: './', build: { outDir: '.vite/renderer/main_window' } });
  const result = spawnSync(require('electron'), [path.join(root, 'tests', process.argv[2] || 'regression.electron.cjs')], {
    stdio: 'inherit', env: { ...process.env, NODE_ENV: 'test' }
  });
  process.exitCode = result.status ?? 1;
}
main().catch(error => { console.error(error); process.exitCode = 1; });
