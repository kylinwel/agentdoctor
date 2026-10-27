import { mkdir, readFile, writeFile, readdir, stat, realpath } from 'node:fs/promises';
import { join, resolve, basename, isAbsolute } from 'node:path';
import { randomUUID } from 'node:crypto';
import { platform, release } from 'node:os';
import { discoverConfigs, readConfig } from './config.mjs';
import { inspectEnvironment, findNpxLauncher } from './environment.mjs';
import { inspectWithEngine, engineInfo } from './engine.mjs';
import { findingCatalog, sourceCredits } from './catalog.mjs';
import { redactObject } from './privacy.mjs';
import { RepairStore, ConflictError } from './repairs.mjs';

export class Doctor {
  constructor({ stateDir, defaultWorkspace, demoWorkspace }) {
    this.stateDir = stateDir;
    this.defaultWorkspace = defaultWorkspace;
    this.demoWorkspace = demoWorkspace;
    this.repairs = new RepairStore(join(stateDir, 'backups'));
    this.reports = new Map();
    this.scanning = false;
    this.currentReport = null;
  }
  async session() {
    const engine = await engineInfo();
    return {
      version: '0.1.0', defaultWorkspace: this.defaultWorkspace,
      platform: platform(), os: platform() + ' ' + release(),
      engine: { name: engine.name, version: engine.version, ready: engine.ready, source: engine.source },
      credits: sourceCredits, history: await this.history(), backups: await this.repairs.list(),
    };
  }
  async scan({ workspace = this.defaultWorkspace, includeUser = true, demo = false } = {}) {
    if (this.scanning) throw new ConflictError('正在体检中，请等待当前扫描结束。');
    this.scanning = true;
    try {
      if (demo) { workspace = this.demoWorkspace; includeUser = false; }
      if (typeof workspace !== 'string' || !isAbsolute(workspace)) throw new Error('请选择绝对路径的工作区目录。');
      workspace = await realpath(resolve(workspace));
      if (!(await stat(workspace)).isDirectory()) throw new Error('工作区不是有效目录。');
      const started = Date.now();
      const files = await discoverConfigs(workspace, includeUser);
      const [environment, upstream] = await Promise.all([inspectEnvironment(), inspectWithEngine(files, workspace)]);
      const launcher = await findNpxLauncher(environment);
      const configRecords = new Map(), serverRecords = new Map(), findings = [], secrets = new Set();
      const addFinding = (code, severity, file, entry, evidence = '') => {
        const [title, suggestion] = findingCatalog[code] || [code, '请根据客户端官方文档核对该配置。'];
        const finding = {
          id: randomUUID(), code, severity, title, suggestion,
          fileId: file?.id ?? null, serverId: entry?.id ?? null, server: entry?.name ?? '配置文件',
          client: file?.client ?? 'AgentDoctor', file: file?.path ?? '', evidence,
          source: code.startsWith('windows_') || code.startsWith('environment_') || code === 'unsupported_disabled_flag' ? 'AgentDoctor' : 'MCP Doctor',
          repairable: false, repairLabel: null,
        };
        findings.push(finding);
        return finding;
      };
      for (const file of files) {
        try {
          const config = await readConfig(file, workspace);
          for (const secret of config.secrets) secrets.add(secret);
          configRecords.set(file.id, config);
          for (const entry of config.entries) serverRecords.set(entry.id, { entry, config });
        } catch (error) {
          addFinding('config_parse_error', 'error', file, null, error.message);
          configRecords.set(file.id, { ...file, format: file.path.endsWith('.toml') ? 'toml' : 'jsonc', entries: [], parseError: error.message, secrets: [] });
        }
      }
      const pathKey = p => process.platform === 'win32' ? p.toLowerCase() : p;
      for (const upstreamFile of upstream.files ?? []) {
        const config = [...configRecords.values()].find(f => pathKey(f.path) === pathKey(upstreamFile.path));
        if (!config || config.parseError) continue;
        for (const sourceFinding of upstreamFile.findings ?? []) {
          const entry = config.entries.find(e => e.name === sourceFinding.server);
          const finding = addFinding(sourceFinding.code, sourceFinding.severity, config, entry, sourceFinding.message);
          if (entry && config.format === 'jsonc' && entry.config.enabled !== false && ['command_not_found', 'path_context'].includes(finding.code)) {
            const command = String(entry.config.command ?? '');
            const leaf = basename(command).replace(/\.exe$/i, '').toLowerCase();
            const runtime = environment.find(r => r.id === leaf && ['node', 'python', 'uv', 'bun', 'git'].includes(r.id));
            const replacement = runtime?.paths.find(p => !/WindowsApps/i.test(p) && !/\.(?:cmd|bat)$/i.test(p));
            if (replacement && replacement !== command) {
              finding.repairable = true;
              finding.repairLabel = '固定可用程序路径';
              finding.replacement = { command: replacement };
            }
          }
        }
      }
      for (const inputError of upstream.errors ?? []) {
        const config = [...configRecords.values()].find(f => pathKey(f.path) === pathKey(inputError.path));
        if (config && !config.parseError) addFinding('config_parse_error', 'error', config, null, inputError.message);
      }
      if (!upstream.engine.ready) addFinding('engine_unavailable', 'error', null, null, upstream.engine.message);
      for (const runtime of environment.filter(r => r.status === 'error')) {
        const f = addFinding('environment_missing', 'error', null, null, runtime.name + '：' + runtime.detail);
        f.title = runtime.name + ' 未找到';
      }
      for (const { entry, config } of serverRecords.values()) {
        const command = String(entry.config.command ?? '');
        if (entry.config.enabled === false && entry.keyPath[0] !== 'mcp_servers') {
          addFinding('unsupported_disabled_flag', 'warning', config, entry, 'enabled = false 是 Codex 的配置字段，其他 JSON 客户端不保证识别该标志；静态引擎仍可能检查其启动命令。');
        }
        if (process.platform === 'win32' && /^(?:npx|npx\.cmd)$/i.test(basename(command)) && entry.config.enabled !== false) {
          const finding = addFinding('windows_npx_launcher', 'warning', config, entry, 'Windows 无法直接 spawn .cmd；不同客户端对包启动器的处理不同。');
          if (launcher && config.format === 'jsonc' && (entry.config.args === undefined || Array.isArray(entry.config.args) && entry.config.args.every(a => typeof a === 'string'))) {
            finding.repairable = true;
            finding.repairLabel = '改用 Node 直接启动 npx';
            finding.replacement = { command: launcher.node, args: [launcher.script, ...(entry.config.args ?? [])] };
          }
        }
      }
      const reportId = randomUUID();
      const report = {
        id: reportId, workspace, includeUser, demo, startedAt: new Date(started).toISOString(),
        durationMs: Date.now() - started, platform: process.platform,
        engine: { name: upstream.engine.name, version: upstream.engine.version, ready: upstream.engine.ready, source: upstream.engine.source },
        environment,
        configs: [...configRecords.values()].map(f => ({ id: f.id, path: f.path, client: f.client, format: f.format, serverCount: f.entries.length, status: f.parseError ? 'error' : 'ok' })),
        servers: [...serverRecords.values()].map(({ entry, config }) => ({
          id: entry.id, fileId: config.id, name: entry.name, client: config.client,
          command: entry.config.command || entry.config.url ? String(entry.config.command || '[远程地址已隐藏]') : '未设置',
          args: Array.isArray(entry.config.args) ? entry.config.args.filter(a => typeof a === 'string') : [],
          cwd: entry.config.cwd || workspace,
          transport: entry.config.url || entry.config.type && entry.config.type !== 'stdio' ? 'remote' : 'stdio',
          enabled: !(entry.keyPath[0] === 'mcp_servers' && entry.config.enabled === false), probeAllowed: this.canProbe(entry),
          probeDescription: '启动所选本地进程，执行 initialize 和 tools/list；不调用任何工具。服务启动本身可能有副作用。',
        })),
        findings: findings.map(({ replacement, ...finding }) => finding),
        summary: {
          errors: findings.filter(f => f.severity === 'error').length,
          warnings: findings.filter(f => f.severity === 'warning').length,
          info: findings.filter(f => f.severity === 'info').length,
          repairable: findings.filter(f => f.repairable).length,
          files: files.length, servers: serverRecords.size,
          runtimes: environment.filter(r => r.status === 'ok').length,
        },
        coverage: { staticOnly: true, remoteRequests: false, message: '静态体检检查当前进程环境与配置，不代表客户端启动或业务功能已经验证。可选运行时缺失不计为故障。' },
      };
      const clean = redactObject(report, [...secrets]);
      this.reports.set(reportId, { public: clean, configs: configRecords, servers: serverRecords, findings, secrets: [...secrets], workspace, includeUser, demo });
      if (this.reports.size > 8) this.reports.delete(this.reports.keys().next().value);
      this.currentReport = clean;
      await mkdir(join(this.stateDir, 'reports'), { recursive: true, mode: 0o700 });
      await writeFile(join(this.stateDir, 'reports', reportId + '.json'), JSON.stringify(redactObject(clean, [...secrets], true), null, 2), { mode: 0o600 });
      return clean;
    } finally { this.scanning = false; }
  }
  canProbe(entry) {
    const c = entry.config;
    if (c.enabled === false || c.url || c.type && c.type !== 'stdio' || typeof c.command !== 'string') return false;
    if (!/^(?:node|python|python3)(?:\.exe)?$/i.test(basename(c.command))) return false;
    if (!Array.isArray(c.args) || !c.args.length || !c.args.every(a => typeof a === 'string')) return false;
    if (c.args.some(a => /npx-cli|npm-cli/i.test(a)) || /^-/.test(c.args[0]) || !/\.(?:mjs|cjs|js|py)$/i.test(c.args[0])) return false;
    if (JSON.stringify(c).includes('$' + '{')) return false;
    if (c.cwd && !isAbsolute(c.cwd)) return false;
    return true;
  }
  getRecord(reportId) {
    const record = this.reports.get(reportId);
    if (!record) throw new ConflictError('报告已过期，请重新扫描。');
    return record;
  }
  async preview(reportId, findingId) {
    const record = this.getRecord(reportId);
    const finding = record.findings.find(f => f.id === findingId);
    if (!finding?.repairable || !finding.replacement) throw new Error('该问题需要人工核对，暂不支持自动修复。');
    const { entry, config } = record.servers.get(finding.serverId);
    const current = await readConfig(config, record.workspace);
    if (current.hash !== config.hash) throw new ConflictError('扫描后配置有变化，请重新扫描。');
    return this.repairs.makePlan(current, entry, finding.replacement, finding.title + ' · ' + finding.repairLabel);
  }
  async apply(planId, reportId) {
    const record = this.getRecord(reportId);
    const result = await this.repairs.apply(planId);
    let report = null, recheckError = null;
    try { report = await this.scan({ workspace: record.workspace, includeUser: record.includeUser, demo: record.demo }); }
    catch { recheckError = '修复已保存且备份可恢复，但自动复检未完成，请手动重新体检。'; }
    return { result, report, recheckError, backups: await this.repairs.list() };
  }
  async restore(id) {
    const result = await this.repairs.restore(id);
    return { result, backups: await this.repairs.list() };
  }
  async history() {
    try {
      const names = (await readdir(join(this.stateDir, 'reports'))).filter(n => /^[a-f0-9-]+\.json$/.test(n));
      const reports = [];
      for (const name of names.slice(-60)) {
        try {
          const report = JSON.parse(await readFile(join(this.stateDir, 'reports', name), 'utf8'));
          reports.push({ id: report.id, startedAt: report.startedAt, workspace: report.workspace, demo: report.demo, summary: report.summary });
        } catch {}
      }
      return reports.sort((a, b) => b.startedAt.localeCompare(a.startedAt)).slice(0, 30);
    } catch { return []; }
  }
  exportReport(id, format = 'json') {
    const record = this.getRecord(id);
    const report = redactObject(record.public, record.secrets, true);
    if (format === 'json') return JSON.stringify(report, null, 2);
    return [
      '# AgentDoctor 诊断报告', '', '时间：' + report.startedAt, '工作区：' + report.workspace,
      '模式：' + (report.demo ? '示例工作区（真实静态扫描）' : '本地静态体检'),
      '', '## 结果', '错误：' + report.summary.errors + ' / 警告：' + report.summary.warnings + ' / 可修复：' + report.summary.repairable,
      '', ...report.findings.flatMap(f => ['### [' + f.severity + '] ' + f.title, '- 规则：' + f.code, '- 客户端：' + f.client, '- 文件：' + f.file, '- 建议：' + f.suggestion, '']),
      '## 检查边界', report.coverage.message, '', '引擎：MCP Doctor ' + report.engine.version,
    ].join('\n');
  }
}
