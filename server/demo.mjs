import { mkdir, writeFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
export async function ensureDemo(root) {
  const workspace = join(root, 'examples/demo-workspace-v2');
  await mkdir(join(workspace, '.codex'), { recursive: true });
  const configPath = join(workspace, '.mcp.json');
  try { await stat(configPath); } catch {
    const node = process.env.AGENTDOCTOR_NODE || (process.versions.electron ? 'node' : process.execPath);
    const fake = process.platform === 'win32' ? 'C:\\AgentDoctor-Missing\\node.exe' : '/agentdoctor-missing/node';
    const script = fileURLToPath(new URL('../examples/fixture-server.mjs', import.meta.url));
    const config = { mcpServers: {
      'local-demo': { command: node, args: [script] },
      'stale-node-path': { command: fake, args: [script] },
      'missing-workdir': { command: node, args: [script], cwd: join(workspace, 'folder-not-created') },
      'missing-command': { command: '' },
      'remote-reference': { type: 'http', url: 'https://example.invalid/mcp' },
      ...(process.platform === 'win32' ? { 'windows-package-launcher': { command: 'npx', args: ['-y', '@modelcontextprotocol/server-memory'] } } : {}),
    }};
    await writeFile(configPath, '// AgentDoctor example. No real credentials or external services.\n' + JSON.stringify(config, null, 2) + '\n');
  }
  const codexPath = join(workspace, '.codex/config.toml');
  try { await stat(codexPath); } catch {
    const fake = process.platform === 'win32' ? 'C:\\AgentDoctor-Missing\\node.exe' : '/agentdoctor-missing/node';
    await writeFile(codexPath, '# Codex supports enabled = false. This fixture stays disabled.\n[mcp_servers.paused-server]\ncommand = ' + JSON.stringify(fake) + '\nenabled = false\n');
  }
  return workspace;
}
