import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { Doctor } from '../server/doctor.mjs';
import { engineInfo } from '../server/engine.mjs';
import { createApp } from '../server/serve.mjs';
import { probeServer } from '../server/probe.mjs';

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'agentdoctor-integration-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const script = fileURLToPath(new URL('../examples/fixture-server.mjs', import.meta.url));
  const stale = process.platform === 'win32' ? 'C:\\AgentDoctor-DoesNotExist\\node.exe' : '/AgentDoctor-DoesNotExist/node';
  await writeFile(join(root, '.mcp.json'), JSON.stringify({ mcpServers: {
    healthy: { command: process.execPath, args: [script], env: { CUSTOM_TOKEN: 'do-not-export-12345' } },
    broken: { command: stale, args: [script] },
    remote: { type: 'http', url: 'https://example.invalid/mcp?access_token=do-not-export-12345' },
  } }, null, 2));
  const doctor = new Doctor({ stateDir: join(root, '.state'), defaultWorkspace: root, demoWorkspace: root });
  return { root, doctor };
}
test('disabled flags retain client-specific meaning without executing ambiguous entries', async t => {
  const { doctor, root } = await fixture(t);
  const { mkdir } = await import('node:fs/promises');
  const stale = process.platform === 'win32' ? 'C:\\AgentDoctor-DoesNotExist\\node.exe' : '/AgentDoctor-DoesNotExist/node';
  await writeFile(join(root, '.mcp.json'), JSON.stringify({ mcpServers: { 'json-disabled': { command: stale, args: ['server.js'], enabled: false } } }));
  await mkdir(join(root, '.codex'));
  await writeFile(join(root, '.codex/config.toml'), '[mcp_servers.codex-disabled]\ncommand = ' + JSON.stringify(stale) + '\nenabled = false\n');
  const report = await doctor.scan({ workspace: root, includeUser: false });
  assert.ok(report.findings.some(f => f.code === 'unsupported_disabled_flag' && f.server === 'json-disabled'));
  assert.ok(!report.findings.some(f => f.severity === 'error' && f.server === 'codex-disabled'));
  assert.equal(report.servers.find(s => s.name === 'codex-disabled').enabled, false);
  assert.equal(report.servers.find(s => s.name === 'json-disabled').probeAllowed, false);
});
test('Windows npx repair uses the installed Node launcher and preserves literal arguments', { skip: process.platform !== 'win32' }, async t => {
  const { doctor, root } = await fixture(t);
  const args = ['-y', '@modelcontextprotocol/server-memory', 'literal & value', 'semi;colon'];
  await writeFile(join(root, '.mcp.json'), '// preserve comment\n' + JSON.stringify({ mcpServers: { launcher: { command: 'npx', args } } }, null, 2));
  const report = await doctor.scan({ workspace: root, includeUser: false });
  const finding = report.findings.find(f => f.code === 'windows_npx_launcher');
  assert.equal(finding.repairable, true);
  const plan = await doctor.preview(report.id, finding.id);
  const result = await doctor.apply(plan.id, report.id);
  const { document } = (await import('../server/config.mjs')).parseConfig(await readFile(join(root, '.mcp.json'), 'utf8'));
  assert.match(document.mcpServers.launcher.command, /node\.exe$/i);
  assert.match(document.mcpServers.launcher.args[0], /npx-cli\.js$/i);
  assert.deepEqual(document.mcpServers.launcher.args.slice(1), args);
  assert.ok(!result.report.findings.some(f => f.code === 'windows_npx_launcher'));
});

test('pinned upstream engine is installed and its executable checksum matches', async () => {
  const engine = await engineInfo();
  assert.equal(engine.ready, true, 'Run npm run setup:engine before integration tests');
  assert.equal(engine.version, 'v0.1.17');
});
test('real upstream scan finds broken paths and records redacted evidence', async t => {
  const { doctor, root } = await fixture(t);
  const report = await doctor.scan({ workspace: root, includeUser: false });
  assert.equal(report.engine.ready, true);
  assert.equal(report.summary.servers, 3);
  assert.ok(report.findings.some(f => f.code === 'command_not_found' && f.server === 'broken'));
  assert.ok(report.findings.some(f => f.code === 'unsupported_transport'));
  const exported = doctor.exportReport(report.id);
  assert.ok(!exported.includes('do-not-export-12345'));
  assert.ok(doctor.exportReport(report.id, 'md').includes('静态'));
});
test('diagnostic scan never starts configured server scripts', async t => {
  const { doctor, root } = await fixture(t);
  const marker = join(root, 'unexpected-process-marker');
  const script = join(root, 'must-not-run.mjs');
  await writeFile(script, "import{writeFileSync}from'node:fs';writeFileSync(" + JSON.stringify(marker) + ",'bad');");
  await writeFile(join(root, '.mcp.json'), JSON.stringify({ mcpServers: { spy: { command: process.execPath, args: [script] } } }));
  await doctor.scan({ workspace: root, includeUser: false });
  await assert.rejects(stat(marker), { code: 'ENOENT' });
});
test('real repair closes the broken-path finding and rollback is available', async t => {
  const { doctor, root } = await fixture(t);
  const report = await doctor.scan({ workspace: root, includeUser: false });
  const finding = report.findings.find(f => f.code === 'command_not_found' && f.server === 'broken');
  assert.equal(finding.repairable, true);
  const plan = await doctor.preview(report.id, finding.id);
  const result = await doctor.apply(plan.id, report.id);
  assert.ok(!result.report.findings.some(f => f.code === 'command_not_found' && f.server === 'broken'));
  assert.equal(result.backups[0].status, 'applied');
  await doctor.restore(result.result.id);
  const restored = await doctor.scan({ workspace: root, includeUser: false });
  assert.ok(restored.findings.some(f => f.code === 'command_not_found' && f.server === 'broken'));
});
test('explicit local probe completes MCP handshake without tool calls', async t => {
  const { doctor, root } = await fixture(t);
  const report = await doctor.scan({ workspace: root, includeUser: false });
  const server = report.servers.find(s => s.name === 'healthy');
  assert.equal(server.probeAllowed, true);
  const result = await probeServer(doctor, report.id, server.id);
  assert.equal(result.status, 'ok', result.message);
  assert.equal(result.server, 'agentdoctor-local-fixture');
  assert.deepEqual(result.tools, []);
});
test('shell commands, package downloads, placeholders and remote transports cannot probe', async t => {
  const { doctor } = await fixture(t);
  for (const config of [
    { command: 'cmd', args: ['/c', 'anything'] },
    { command: 'npx', args: ['package'] },
    { command: 'node', args: ['C:/npm/npx-cli.js', 'package'] },
    { command: 'node', args: ['-e', 'code'] },
    { command: 'node', args: ['server.mjs'], env: { TOKEN: '$' + '{PRIVATE}' } },
    { url: 'https://example.invalid' },
  ]) assert.equal(doctor.canProbe({ config }), false);
});
test('malformed semantic server fields are reported instead of silently skipped', async t => {
  const { doctor, root } = await fixture(t);
  await writeFile(join(root, '.mcp.json'), JSON.stringify({ mcpServers: { bad: { command: 'node', args: 'not-an-array' } } }));
  const report = await doctor.scan({ workspace: root, includeUser: false });
  assert.ok(report.findings.some(f => f.code === 'config_parse_error'));
});
test('an applied repair remains successful when automatic recheck fails', async t => {
  const { doctor, root } = await fixture(t);
  const report = await doctor.scan({ workspace: root, includeUser: false });
  const finding = report.findings.find(f => f.code === 'command_not_found' && f.server === 'broken');
  const plan = await doctor.preview(report.id, finding.id);
  doctor.scan = async () => { throw new Error('simulated scan I/O failure'); };
  const result = await doctor.apply(plan.id, report.id);
  assert.equal(result.result.status, 'applied');
  assert.equal(result.report, null);
  assert.ok(result.recheckError.includes('修复已保存'));
  assert.equal(result.backups[0].status, 'applied');
  await doctor.restore(result.result.id);
});

test('loopback API requires session tokens, JSON and explicit action approval', async t => {
  const root = await mkdtemp(join(tmpdir(), 'agentdoctor-api-'));
  const app = await createApp({ port: 0, stateDir: join(root, '.state'), defaultWorkspace: root });
  t.after(async () => { await new Promise(resolve => app.server.close(resolve)); await rm(root, { recursive: true, force: true }); });
  const session = await (await fetch(app.url + '/api/session')).json();
  assert.ok(session.token);
  let response = await fetch(app.url + '/api/scan', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
  assert.equal(response.status, 401);
  response = await fetch(app.url + '/api/scan', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-AgentDoctor-Token': session.token, Origin: 'https://untrusted.example' }, body: '{}' });
  assert.equal(response.status, 403);
  response = await fetch(app.url + '/api/scan', { method: 'POST', headers: { 'Content-Type': 'text/plain', 'X-AgentDoctor-Token': session.token }, body: '{}' });
  assert.equal(response.status, 415);
  response = await fetch(app.url + '/api/repair/apply', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-AgentDoctor-Token': session.token }, body: JSON.stringify({ reportId: crypto.randomUUID(), planId: crypto.randomUUID(), approved: false }) });
  assert.equal(response.status, 400);
  response = await fetch(app.url + '/api/scan', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-AgentDoctor-Token': session.token }, body: JSON.stringify({ workspace: root, includeUser: false }) });
  assert.equal(response.status, 200);
  const report = await response.json();
  assert.equal(report.summary.files, 0);
});
