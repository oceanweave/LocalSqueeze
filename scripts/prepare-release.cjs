const fs = require('node:fs');
const path = require('node:path');
const { version } = require('../package.json');

const [platform, arch] = process.argv.slice(2);
if (!['darwin', 'win32'].includes(platform) || !['arm64', 'x64'].includes(arch)) {
  throw new Error('Usage: node scripts/prepare-release.cjs <darwin|win32> <arm64|x64>');
}

function findFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const filename = path.join(directory, entry.name);
    return entry.isDirectory() ? findFiles(filename) : [filename];
  });
}

const files = findFiles(path.join(__dirname, '../out/make'));
const output = path.join(__dirname, '../release');
fs.mkdirSync(output, { recursive: true });
const installer = platform === 'darwin' ? '.dmg' : '.exe';
const extensions = new Set();
for (const filename of files) {
  const extension = path.extname(filename).toLowerCase();
  if (!['.dmg', '.exe', '.msi', '.zip'].includes(extension)) continue;
  if (extensions.has(extension)) throw new Error(`Multiple ${extension} assets found`);
  extensions.add(extension);
  const os = platform === 'darwin' ? 'macos' : 'windows';
  const destination = path.join(output, `LocalSqueeze-${version}-${os}-${arch}${extension}`);
  fs.copyFileSync(filename, destination);
  console.log(path.basename(destination));
}
if (!extensions.has(installer) || !extensions.has('.zip')) {
  throw new Error(`Expected ${installer} installer and .zip archive for ${platform}-${arch}`);
}
