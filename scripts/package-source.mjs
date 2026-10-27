import { mkdir, stat } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
const release = join(root, 'release');
await mkdir(release, { recursive: true });
const output = join(release, 'AgentDoctor-0.1.0-source.zip');
const files = ['package.json','package-lock.json','tsconfig.json','vite.config.ts','index.html','.gitignore','.gitattributes','LICENSE','README.md','README.zh-CN.md','CONTRIBUTING.md','THIRD_PARTY_NOTICES.md','Start-AgentDoctor.cmd','src','server','desktop','scripts','tests','public','docs','.github','vendor/mcp-doctor/LICENSE','vendor/mcp-doctor/README.md','examples/fixture-server.mjs'];
try { if ((await stat(join(root, 'dist/index.html'))).isFile()) files.push('dist'); } catch {}
execFileSync('tar', ['-a', '-c', '-f', output, ...files], { cwd: root, stdio: 'inherit' });
console.log('Source archive: ' + output);
