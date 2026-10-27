import { stat, access } from 'node:fs/promises';
import { constants } from 'node:fs';
import { join, delimiter, extname, basename, dirname } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const execFileAsync = promisify(execFile);
export const runtimeSpecs = [
  { id: 'node', name: 'Node.js', command: 'node', required: true, description: '运行大多数 JavaScript MCP 服务' },
  { id: 'npm', name: 'npm / npx', command: 'npm', required: true, description: '管理 Node.js 依赖与包启动器' },
  { id: 'git', name: 'Git', command: 'git', required: false, description: '代码仓库与版本控制' },
  { id: 'python', name: 'Python', command: 'python', required: false, description: '运行 Python MCP 服务' },
  { id: 'uv', name: 'uv / uvx', command: 'uv', required: false, description: 'Python 工具与隔离环境' },
  { id: 'bun', name: 'Bun', command: 'bun', required: false, description: '可选的 JavaScript 运行时' },
  { id: 'claude', name: 'Claude Code', command: 'claude', required: false, description: 'AI 编程客户端' },
  { id: 'codex', name: 'Codex CLI', command: 'codex', required: false, description: 'AI 编程客户端' },
  { id: 'gemini', name: 'Gemini CLI', command: 'gemini', required: false, description: 'AI 编程客户端' },
];
export async function findCommands(command, env = process.env, platform = process.platform) {
  const searchPath = Object.entries(env).find(([key]) => key.toLowerCase() === 'path')?.[1] ?? '';
  const extensions = platform === 'win32' ? (env.PATHEXT || '.COM;.EXE;.BAT;.CMD').split(';') : [''];
  const names = extname(command) ? [command] : extensions.map(e => command + e);
  const matches = [];
  for (let directory of searchPath.split(platform === 'win32' ? ';' : delimiter)) {
    directory = directory.trim().replace(/^"|"$/g, '');
    if (!directory) continue;
    for (const name of names) {
      const candidate = join(directory, name);
      try {
        if (!(await stat(candidate)).isFile()) continue;
        if (platform !== 'win32') await access(candidate, constants.X_OK);
        if (!matches.some(p => platform === 'win32' ? p.toLowerCase() === candidate.toLowerCase() : p === candidate)) matches.push(candidate);
      } catch {}
    }
  }
  return matches;
}
export async function inspectEnvironment() {
  return Promise.all(runtimeSpecs.map(async spec => {
    const paths = await findCommands(spec.command);
    const alias = paths[0]?.toLowerCase().includes('windowsapps');
    let version = null;
    // Only fixed runtime --version commands are executed; client CLIs are never started by a scan.
    if (paths[0] && !alias && ['node', 'python', 'git', 'uv', 'bun'].includes(spec.id) && !/\.(?:cmd|bat)$/i.test(paths[0])) {
      try {
        const { stdout } = await execFileAsync(paths[0], ['--version'], { timeout: 3500, maxBuffer: 4096, windowsHide: true, shell: false });
        version = stdout.trim().split(/\r?\n/)[0].slice(0, 100);
      } catch {}
    }
    let status = paths.length ? 'ok' : spec.required ? 'error' : 'optional';
    let detail = paths.length ? '当前进程可以找到该命令' : spec.required ? '当前 PATH 未找到命令' : '未安装或未加入 PATH，按需安装即可';
    if (alias) { status = 'warning'; detail = '检测到 Windows 应用执行别名，请确认已安装实际运行时'; }
    const major = spec.id === 'node' && version ? Number(version.match(/v?(\d+)/)?.[1]) : 0;
    if (major && major < 22) { status = 'warning'; detail = '建议使用 Node.js 22 LTS 或更新版本；具体要求取决于 MCP 服务'; }
    if (paths.length > 1 && spec.id !== 'npm') detail += '；发现 ' + paths.length + ' 个路径，请留意版本优先级';
    return { ...spec, status, paths, version, detail };
  }));
}
export async function findNpxLauncher(environment) {
  const npm = environment.find(r => r.id === 'npm')?.paths?.[0];
  const node = environment.find(r => r.id === 'node')?.paths?.find(p => /node(?:\.exe)?$/i.test(p));
  if (!npm || !node) return null;
  for (const script of [join(dirname(npm), 'node_modules/npm/bin/npx-cli.js'), join(dirname(npm), '../lib/node_modules/npm/bin/npx-cli.js')]) {
    try { if ((await stat(script)).isFile()) return { node, script }; } catch {}
  }
  return null;
}
