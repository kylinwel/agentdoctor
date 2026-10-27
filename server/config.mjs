import { readFile, stat, realpath, lstat } from 'node:fs/promises';
import { resolve, join, extname, normalize } from 'node:path';
import { homedir } from 'node:os';
import { createHash } from 'node:crypto';
import * as jsonc from 'jsonc-parser';
import TOML from '@iarna/toml';
import { collectSecrets } from './privacy.mjs';
export const digest = value => createHash('sha256').update(value).digest('hex');
const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const keyPath = path => process.platform === 'win32' ? normalize(path).toLowerCase() : normalize(path);
export async function discoverConfigs(workspace, includeUser = true) {
  const candidates = [
    ['Claude Code', join(workspace, '.mcp.json')],
    ['Cursor', join(workspace, '.cursor/mcp.json')],
    ['VS Code', join(workspace, '.vscode/mcp.json')],
    ['Codex', join(workspace, '.codex/config.toml')],
    ['Claude Code', join(workspace, '.claude/mcp.json')],
  ];
  if (includeUser) {
    const home = homedir();
    candidates.push(
      ['Claude Code', join(home, '.claude.json')],
      ['Cursor', join(home, '.cursor/mcp.json')],
      ['Codex', join(home, '.codex/config.toml')],
      ['Copilot CLI', join(home, '.copilot/mcp-config.json')],
      ['Cline', join(home, '.cline/data/settings/cline_mcp_settings.json')],
    );
    if (process.env.APPDATA) candidates.push(
      ['Claude Desktop', join(process.env.APPDATA, 'Claude/claude_desktop_config.json')],
      ['VS Code', join(process.env.APPDATA, 'Code/User/mcp.json')],
    );
  }
  const seen = new Set(), result = [];
  for (const [client, path] of candidates) {
    const key = keyPath(path);
    if (seen.has(key)) continue;
    seen.add(key);
    try { if ((await stat(path)).isFile()) result.push({ client, path: resolve(path), id: digest(key).slice(0, 20) }); } catch {}
  }
  return result;
}
export function parseConfig(text, filename = 'mcp.json') {
  if (extname(filename).toLowerCase() === '.toml') {
    try { return { document: TOML.parse(text.replace(/^\uFEFF/, '')), format: 'toml' }; }
    catch { throw new Error('TOML 语法无效，请在编辑器中检查重复表名、引号和括号。'); }
  }
  const errors = [];
  const document = jsonc.parse(text.replace(/^\uFEFF/, ''), errors, { allowTrailingComma: true, disallowComments: false });
  if (errors.length || !isObject(document)) {
    const offset = errors[0]?.offset ?? 0;
    const line = text.slice(0, offset).split('\n').length;
    throw new Error('JSON / JSONC 语法无效，约在第 ' + line + ' 行。');
  }
  return { document, format: 'jsonc' };
}
export function getEntries(document, workspace) {
  const entries = [];
  const append = (map, basePath) => {
    if (!isObject(map)) return;
    for (const [name, config] of Object.entries(map)) {
      if (isObject(config)) entries.push({ name, config, keyPath: [...basePath, name] });
    }
  };
  append(document.mcpServers, ['mcpServers']);
  append(document.servers, ['servers']);
  append(document.mcp_servers, ['mcp_servers']);
  if (isObject(document.projects)) for (const [project, config] of Object.entries(document.projects)) {
    if (keyPath(resolve(project)) === keyPath(resolve(workspace)) && isObject(config)) append(config.mcpServers, ['projects', project, 'mcpServers']);
  }
  return entries;
}
export async function readConfig(file, workspace) {
  const info = await lstat(file.path);
  if (!info.isFile() || info.isSymbolicLink()) throw new Error('仅检查普通配置文件；符号链接不支持修复。');
  if (info.size > 2 * 1024 * 1024) throw new Error('配置超过 2 MB，已跳过。');
  const buffer = await readFile(file.path);
  const text = buffer.toString('utf8');
  const parsed = parseConfig(text, file.path);
  const entries = getEntries(parsed.document, workspace).map((entry, index) => ({ ...entry, id: digest(file.id + ':' + JSON.stringify(entry.keyPath)).slice(0, 24), fileId: file.id, index }));
  return { ...file, ...parsed, entries, text, hash: digest(buffer), canonicalPath: await realpath(file.path), mode: info.mode, secrets: [...collectSecrets(parsed.document)] };
}
export function patchServer(configFile, entry, replacement) {
  if (configFile.format !== 'jsonc') throw new Error('第一版仅对 JSON / JSONC 提供自动修复；TOML 保持只读。');
  const bom = configFile.text.startsWith('\uFEFF') ? '\uFEFF' : '';
  let source = bom ? configFile.text.slice(1) : configFile.text;
  const formattingOptions = { insertSpaces: !/\n\t/.test(source), tabSize: 2, eol: source.includes('\r\n') ? '\r\n' : '\n' };
  for (const [field, value] of Object.entries(replacement)) {
    source = jsonc.applyEdits(source, jsonc.modify(source, [...entry.keyPath, field], value, { formattingOptions }));
  }
  parseConfig(source, configFile.path);
  return bom + source;
}
