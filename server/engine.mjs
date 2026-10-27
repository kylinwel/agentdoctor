import { readdir, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { digest } from './config.mjs';
const execFileAsync = promisify(execFile);
export const engineDirectory = fileURLToPath(new URL('../vendor/mcp-doctor/bin/', import.meta.url));
async function findBinary(directory, depth = 0) {
  if (depth > 3) return null;
  for (const item of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, item.name);
    if (item.isFile() && item.name === (process.platform === 'win32' ? 'mcp-doctor.exe' : 'mcp-doctor')) return path;
    if (item.isDirectory()) { const found = await findBinary(path, depth + 1); if (found) return found; }
  }
  return null;
}
export async function engineInfo() {
  try {
    const manifest = JSON.parse(await readFile(join(engineDirectory, 'verified.json'), 'utf8'));
    const binary = await findBinary(engineDirectory);
    if (!binary || manifest.version !== 'v0.1.17') throw new Error('Unverified engine');
    if (!manifest.binarySha256 || digest(await readFile(binary)) !== manifest.binarySha256) throw new Error('Engine changed');
    return { ready: true, name: 'MCP Doctor', version: manifest.version, binary, archiveSha256: manifest.archiveSha256, source: 'https://github.com/Tinkora/mcp_doctor' };
  } catch {
    return { ready: false, name: 'MCP Doctor', version: 'v0.1.17', source: 'https://github.com/Tinkora/mcp_doctor', message: '引擎未安装或校验失败，请运行 npm run setup:engine。' };
  }
}
export async function inspectWithEngine(files, workspace) {
  const engine = await engineInfo();
  if (!engine.ready) return { engine, files: [], errors: [], summary: {} };
  const args = ['--format', 'json', ...(files.length ? files.map(f => f.path) : ['--no-discover'])];
  let output = '';
  try { output = (await execFileAsync(engine.binary, args, { cwd: workspace, timeout: 15000, maxBuffer: 4 * 1024 * 1024, windowsHide: true, shell: false })).stdout; }
  catch (error) {
    if (error.stdout && [1, 2].includes(error.code)) output = error.stdout;
    else throw new Error('静态引擎未完成扫描，请检查引擎状态或缩小工作区。');
  }
  try { return { ...JSON.parse(output), engine }; }
  catch { throw new Error('静态引擎返回了无法识别的报告。'); }
}
