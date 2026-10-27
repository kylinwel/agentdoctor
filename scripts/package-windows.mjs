import { cp, mkdir, writeFile, stat, rename } from 'node:fs/promises';
import { join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { engineInfo } from '../server/engine.mjs';
const root = fileURLToPath(new URL('../', import.meta.url));
if (process.platform !== 'win32' || process.arch !== 'x64') throw new Error('This portable packager requires Windows x64.');
if (!(await engineInfo()).ready) throw new Error('Install and verify the pinned MCP Doctor engine first.');
await stat(join(root, 'dist/index.html'));
await stat(join(root, 'node_modules/electron/dist/electron.exe'));
const release = resolve(root, 'release');
await mkdir(release, { recursive: true });
const output = resolve(release, 'AgentDoctor-0.1.0-win-x64-' + Date.now());
if (!output.startsWith(release + sep)) throw new Error('Invalid output directory.');
await cp(join(root, 'node_modules/electron/dist'), output, { recursive: true, errorOnExist: true, force: false });
await rename(join(output, 'electron.exe'), join(output, 'AgentDoctor.exe'));
const app = join(output, 'resources/app');
await mkdir(app, { recursive: true });
for (const file of ['package.json','package-lock.json','LICENSE','README.md','README.zh-CN.md','CONTRIBUTING.md','THIRD_PARTY_NOTICES.md','dist','server','desktop','docs','vendor','examples/fixture-server.mjs']) {
  await cp(join(root, file), join(app, file), { recursive: true });
}
const npm = process.env.npm_execpath;
if (!npm) throw new Error('Run this script through npm run package:windows.');
execFileSync(process.execPath, [npm, 'ci', '--omit=dev', '--ignore-scripts', '--no-audit', '--no-fund'], { cwd: app, stdio: 'inherit', windowsHide: true });
await writeFile(join(output, 'READ-ME-FIRST.txt'), 'AgentDoctor 0.1.0 — Windows x64 portable\r\n\r\nDouble-click AgentDoctor.exe. Keep the entire folder together.\r\nThis preview is unsigned. Source and third-party notices are in resources/app/.\r\nNo Node.js installation is required to open the desktop workbench.\r\nActual MCP servers may require their own runtimes.\r\n');
const zip = join(release, 'AgentDoctor-0.1.0-win-x64.zip');
execFileSync('tar', ['-a', '-c', '-f', zip, '-C', release, output.slice(release.length + 1)], { stdio: 'inherit' });
console.log('Portable app: ' + join(output, 'AgentDoctor.exe'));
console.log('Portable archive: ' + zip);
