import { readConfig } from './config.mjs';
import { redactText } from './privacy.mjs';
import { isAbsolute, resolve } from 'node:path';
import { stat } from 'node:fs/promises';
import { findCommands } from './environment.mjs';
export async function probeServer(doctor, reportId, serverId) {
  const record = doctor.getRecord(reportId);
  const target = record.servers.get(serverId);
  if (!target || !doctor.canProbe(target.entry)) throw new Error('仅支持本地 Node / Python 脚本的显式探测；包下载器、shell 和远程连接不在本版本探测范围。');
  const current = await readConfig(target.config, record.workspace);
  if (current.hash !== target.config.hash) throw new Error('配置已变化，请先重新扫描。');
  const cfg = target.entry.config;
  const executable = isAbsolute(cfg.command) ? cfg.command : (await findCommands(cfg.command))[0];
  if (!executable || /\.(?:cmd|bat)$/i.test(executable)) throw new Error('找不到可直接运行的本地程序。');
  const cwd = cfg.cwd || record.workspace;
  const script = resolve(cwd, cfg.args[0]);
  if (!(await stat(script)).isFile()) throw new Error('服务脚本不存在，未启动进程。');
  const { Client } = await import('@modelcontextprotocol/sdk/client/index.js');
  const { StdioClientTransport } = await import('@modelcontextprotocol/sdk/client/stdio.js');
  const client = new Client({ name: 'agentdoctor-probe', version: '0.1.0' }, { capabilities: {} });
  const transport = new StdioClientTransport({ command: executable, args: [script, ...cfg.args.slice(1)], cwd, env: cfg.env ?? {}, stderr: 'pipe' });
  let stderr = '', timer;
  transport.stderr?.on('data', chunk => { stderr = (stderr + chunk.toString()).slice(-3000); });
  const started = Date.now();
  try {
    const work = async () => {
      await client.connect(transport);
      let tools = [];
      if (client.getServerCapabilities()?.tools) tools = (await client.listTools()).tools.map(t => t.name).slice(0, 100);
      return { status: 'ok', durationMs: Date.now() - started, protocol: 'MCP initialize', server: client.getServerVersion()?.name || target.entry.name, tools, message: '握手成功；只读取工具名称，没有调用工具。' };
    };
    return await Promise.race([work(), new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('10 秒内未完成握手，已停止探测。')), 10000); })]);
  } catch (error) {
    return { status: 'error', durationMs: Date.now() - started, message: redactText(error.message, record.secrets), stderr: redactText(stderr, record.secrets), tools: [] };
  } finally {
    clearTimeout(timer);
    await client.close().catch(() => {});
    await transport.close().catch(() => {});
  }
}
