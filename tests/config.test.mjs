import test from 'node:test';
import assert from 'node:assert/strict';
import { parseConfig, getEntries, patchServer } from '../server/config.mjs';
import { collectSecrets, redactObject, redactText } from '../server/privacy.mjs';

test('JSONC supports BOM, comments, trailing commas and Unicode', () => {
  const { document } = parseConfig('\uFEFF{// comment\n "mcpServers":{"中文":{"command":"node",}},}');
  assert.equal(document.mcpServers['中文'].command, 'node');
});
test('invalid input reports a location without echoing secret source text', () => {
  const secret = 'private-parser-value';
  assert.throws(() => parseConfig('{"password":"' + secret + '", broken}'), error => !error.message.includes(secret) && error.message.includes('语法'));
});
test('TOML reads supported MCP tables and rejects duplicates', () => {
  const { document, format } = parseConfig('[mcp_servers.fixture]\ncommand="node"\nargs=["server.js"]\n', 'config.toml');
  assert.equal(format, 'toml');
  assert.equal(document.mcp_servers.fixture.command, 'node');
  assert.throws(() => parseConfig('[mcp_servers.a]\ncommand="a"\ncommand="b"', 'config.toml'));
});
test('Claude user scope includes only the selected workspace', () => {
  const doc = { mcpServers: { global: { command: 'node' } }, projects: { 'D:/one': { mcpServers: { one: { command: 'node' } } }, 'D:/two': { mcpServers: { two: { command: 'node' } } } } };
  assert.deepEqual(getEntries(doc, 'D:/one').map(e => e.name), ['global', 'one']);
});
test('JSONC repair retains comments, BOM, secrets and unrelated settings', () => {
  const text = '\uFEFF{\r\n  // keep this comment\r\n  "theme":"dark",\r\n  "mcpServers":{"a":{"command":"old","env":{"TOKEN":"private"},"args":["x"]}}\r\n}\r\n';
  const parsed = parseConfig(text);
  const entry = getEntries(parsed.document, 'D:/one')[0];
  const after = patchServer({ ...parsed, text, path: 'mcp.json' }, entry, { command: 'new' });
  assert.ok(after.startsWith('\uFEFF'));
  assert.ok(after.includes('// keep this comment'));
  assert.ok(after.includes('"TOKEN":"private"'));
  assert.equal(parseConfig(after).document.theme, 'dark');
  assert.equal(parseConfig(after).document.mcpServers.a.command, 'new');
});
test('TOML repairs are explicitly refused instead of rewriting comments', () => {
  assert.throws(() => patchServer({ format: 'toml' }, {}, {}), /只读/);
});
test('report redaction hides env values, key values, token arguments and URL credentials', () => {
  const value = { env: { CUSTOM: 'odd-secret-value' }, apiKey: 'another-private-value', args: ['--token', 'argument-private-value'] };
  const secrets = [...collectSecrets(value)];
  const clean = JSON.stringify(redactObject({ value, evidence: 'odd-secret-value another-private-value argument-private-value Bearer abcdefghi https://user:pass@host/api?access_token=abcdef' }, secrets));
  for (const secret of [...secrets, 'abcdefghi', 'user:pass', 'access_token=abcdef']) assert.ok(!clean.includes(secret));
});
test('export privacy removes Windows account names and email addresses', () => {
  const text = redactText('C:\\Users\\Someone\\Projects\\mcp.json person@example.com', [], true);
  assert.ok(!text.includes('Someone'));
  assert.ok(!text.includes('person@example.com'));
});
