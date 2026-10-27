import { readFile, writeFile, mkdir, mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import extract from 'extract-zip';
const root = fileURLToPath(new URL('../', import.meta.url));
const electronRoot = join(root, 'node_modules/electron');
const metadata = JSON.parse(await readFile(join(electronRoot, 'package.json'), 'utf8'));
const asset = 'electron-v' + metadata.version + '-' + process.platform + '-' + process.arch + '.zip';
const checksums = JSON.parse(await readFile(join(electronRoot, 'checksums.json'), 'utf8'));
const expected = checksums[asset];
if (!expected) throw new Error('Official Electron package has no checksum for this platform.');
const url = 'https://github.com/electron/electron/releases/download/v' + metadata.version + '/' + asset;
console.log('Downloading official Electron ' + metadata.version + ' (' + process.platform + '-' + process.arch + ')');
const response = await fetch(url, { signal: AbortSignal.timeout(180000) });
if (!response.ok) throw new Error('Download failed: ' + response.status);
const data = Buffer.from(await response.arrayBuffer());
const actual = createHash('sha256').update(data).digest('hex');
if (actual !== expected) throw new Error('Official Electron checksum verification failed.');
const temp = await mkdtemp(join(tmpdir(), 'agentdoctor-desktop-'));
try {
  const zip = join(temp, asset);
  await writeFile(zip, data);
  await extract(zip, { dir: join(electronRoot, 'dist') });
  await writeFile(join(electronRoot, 'path.txt'), process.platform === 'win32' ? 'electron.exe' : process.platform === 'darwin' ? 'Electron.app/Contents/MacOS/Electron' : 'electron');
  console.log('Electron ready; verified SHA-256 ' + actual);
} finally { await rm(temp, { recursive: true, force: true }); }
