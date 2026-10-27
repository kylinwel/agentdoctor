import { mkdir, writeFile, readFile, readdir, mkdtemp, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import extract from 'extract-zip';
const root = fileURLToPath(new URL('../', import.meta.url));
const version = 'v0.1.17';
const assets = { 'win32-x64': 'windows-x86_64.zip', 'linux-x64': 'linux-x86_64.tar.gz', 'darwin-arm64': 'macos-arm64.tar.gz', 'darwin-x64': 'macos-x86_64.tar.gz' };
const suffix = assets[process.platform + '-' + process.arch];
if (!suffix) throw new Error('Unsupported upstream engine platform.');
const asset = 'mcp-doctor-' + version + '-' + suffix;
const base = 'https://github.com/Tinkora/mcp_doctor/releases/download/' + version + '/';
async function download(name) { const r = await fetch(base + name, { signal: AbortSignal.timeout(60000) }); if (!r.ok) throw new Error('Download failed: ' + r.status); return Buffer.from(await r.arrayBuffer()); }
const [archive, sums] = await Promise.all([download(asset), download('SHA256SUMS')]);
const expected = sums.toString().split(/\r?\n/).find(l => l.trim().endsWith(asset))?.trim().split(/\s+/)[0];
const sha256 = createHash('sha256').update(archive).digest('hex');
if (!expected || expected !== sha256) throw new Error('Upstream archive SHA-256 verification failed.');
const temp = await mkdtemp(join(tmpdir(), 'agentdoctor-engine-'));
const archivePath = join(temp, asset);
const output = resolve(root, 'vendor/mcp-doctor/bin');
await mkdir(output, { recursive: true });
try {
  await writeFile(archivePath, archive);
  if (process.platform === 'win32') {
    await extract(archivePath, { dir: output });
  } else execFileSync('tar', ['-xzf', archivePath, '-C', output], { stdio: 'inherit' });
  async function findBinary(dir) { for (const item of await readdir(dir, { withFileTypes: true })) { const p = join(dir, item.name); if (item.isDirectory()) { const found = await findBinary(p); if (found) return found; } else if (item.name === (process.platform === 'win32' ? 'mcp-doctor.exe' : 'mcp-doctor')) return p; } }
  const binary = await findBinary(output);
  if (!binary) throw new Error('Archive does not contain the expected executable.');
  const binarySha256 = createHash('sha256').update(await readFile(binary)).digest('hex');
  await writeFile(join(output, 'verified.json'), JSON.stringify({ repository: 'Tinkora/mcp_doctor', version, asset, archiveSha256: sha256, binarySha256, verifiedAt: new Date().toISOString() }, null, 2));
  console.log('Installed MCP Doctor ' + version + '; verified SHA-256 ' + sha256);
} finally { await rm(temp, { recursive: true, force: true }); }
