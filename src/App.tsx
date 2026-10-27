import { useEffect, useRef, useState } from 'react';
import { Activity, ArrowDownToLine, ArrowRight, ArrowUpRight, Check, CheckCircle2, ChevronDown, ChevronRight, Circle, Code2, Cpu, FileCheck2, FileCode2, Folder, GitBranch, HeartPulse, History as HistoryIcon, Info, Layers3, Loader2, LockKeyhole, Monitor, Play, RefreshCw, RotateCcw, Search, ShieldCheck, Terminal, TriangleAlert, Wrench, X, XCircle } from 'lucide-react';
import type { Backup, Finding, History, Plan, ProbeResult, Report, Runtime, Server, Session } from './types';

type Page = 'overview' | 'configs' | 'environment' | 'history' | 'about';
const pages = [
  { id: 'overview' as Page, label: '环境体检', icon: HeartPulse },
  { id: 'configs' as Page, label: 'MCP 配置', icon: Layers3 },
  { id: 'environment' as Page, label: '运行环境', icon: Terminal },
  { id: 'history' as Page, label: '历史与备份', icon: HistoryIcon },
];
const labels = { error: '需要修复', warning: '建议检查', info: '信息提示' };
const pageTitles: Record<Page, string> = { overview: '环境体检', configs: 'MCP 配置', environment: '运行环境', history: '历史与备份', about: '关于 AgentDoctor' };
function formatTime(time: string) { return new Intl.DateTimeFormat('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(time)); }
function shortPath(path: string) { return path.replace(/^.*[\\/]([^\\/]+[\\/][^\\/]+)$/, '…/$1').replaceAll('\\', '/'); }
function clientLetter(name: string) { return name === 'Codex' ? 'O' : name.startsWith('Claude') ? '✳' : name === 'Cursor' ? '↗' : name === 'VS Code' ? '〈〉' : name[0]; }

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [page, setPage] = useState<Page>('overview');
  const [workspace, setWorkspace] = useState('');
  const [includeUser, setIncludeUser] = useState(true);
  const [workspaceOpen, setWorkspaceOpen] = useState(false);
  const [report, setReport] = useState<Report | null>(null);
  const [history, setHistory] = useState<History[]>([]);
  const [backups, setBackups] = useState<Backup[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const [search, setSearch] = useState('');
  const [severity, setSeverity] = useState('all');
  const [repairOnly, setRepairOnly] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [restore, setRestore] = useState<Backup | null>(null);
  const [probe, setProbe] = useState<Server | null>(null);
  const [probeResults, setProbeResults] = useState<Record<string, ProbeResult>>({});
  const [configFilter, setConfigFilter] = useState<string | null>(null);
  const token = useRef('');

  async function api<T>(path: string, body?: object): Promise<T> {
    const response = await fetch('/api/' + path, {
      method: body ? 'POST' : 'GET',
      headers: { 'Content-Type': 'application/json', 'X-AgentDoctor-Token': token.current },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || '请求未完成，请重试。');
    return data as T;
  }
  useEffect(() => {
    api<Session>('session').then(data => {
      token.current = data.token; setSession(data); setWorkspace(data.defaultWorkspace);
      setHistory(data.history); setBackups(data.backups);
    }).catch(e => setError(e.message));
  }, []);
  useEffect(() => { if (toast) { const timer = setTimeout(() => setToast(''), 4500); return () => clearTimeout(timer); } }, [toast]);
  useEffect(() => {
    if (!plan && !restore && !probe && !workspaceOpen) return;
    const close = (event: KeyboardEvent) => { if (event.key === 'Escape' && !busy) { setPlan(null); setRestore(null); setProbe(null); setWorkspaceOpen(false); } };
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, [plan, restore, probe, workspaceOpen, busy]);

  async function refreshHistory() {
    const data = await api<{ history: History[]; backups: Backup[] }>('history');
    setHistory(data.history); setBackups(data.backups);
  }
  async function scan(demo = false) {
    // Keep the active demo scope unless the workspace dialog explicitly changes it.
    demo = demo || (Boolean(report?.demo) && !workspaceOpen);
    setBusy('scan'); setError(''); setWorkspaceOpen(false);
    try {
      const data = await api<Report>('scan', { workspace, includeUser, demo });
      setReport(data); setPage('overview'); setConfigFilter(null); setProbeResults({}); setExpanded(null);
      setToast((demo ? '示例工作区' : '本地环境') + '体检完成');
      await refreshHistory();
    } catch (e) { setError((e as Error).message); } finally { setBusy(null); }
  }
  async function preview(finding: Finding) {
    if (!report) return;
    setBusy('preview-' + finding.id); setError('');
    try { setPlan(await api<Plan>('repair/preview', { reportId: report.id, findingId: finding.id })); }
    catch (e) { setError((e as Error).message); } finally { setBusy(null); }
  }
  async function apply() {
    if (!report || !plan) return;
    setBusy('apply'); setError('');
    try {
      const data = await api<{ report: Report | null; recheckError: string | null; backups: Backup[]; result: { message: string } }>('repair/apply', { reportId: report.id, planId: plan.id, approved: true });
      setReport(data.report); setBackups(data.backups); setPlan(null); setExpanded(null); setProbeResults({}); setToast(data.recheckError || data.result.message + ' 已自动复检。'); await refreshHistory();
    } catch (e) { setPlan(null); setError((e as Error).message); } finally { setBusy(null); }
  }
  async function restoreBackup() {
    if (!restore) return;
    setBusy('restore'); setError('');
    try {
      const data = await api<{ backups: Backup[]; result: { message: string } }>('backup/restore', { id: restore.id, approved: true });
      setBackups(data.backups); setRestore(null); setToast(data.result.message); setReport(null); setProbeResults({});
    } catch (e) { setRestore(null); setError((e as Error).message); } finally { setBusy(null); }
  }
  async function runProbe() {
    if (!probe || !report) return;
    const selected = probe;
    setProbe(null); setBusy('probe-' + selected.id); setError('');
    try {
      const result = await api<ProbeResult>('probe', { reportId: report.id, serverId: selected.id, approved: true });
      setProbeResults(old => ({ ...old, [selected.id]: result }));
      setToast(result.message);
    } catch (e) { setError((e as Error).message); } finally { setBusy(null); }
  }
  async function exportReport(format: 'json' | 'md') {
    if (!report) return;
    setBusy('export'); setError('');
    try {
      const response = await fetch('/api/report?id=' + report.id + '&format=' + format, { headers: { 'X-AgentDoctor-Token': token.current } });
      if (!response.ok) throw new Error('导出失败，请重新扫描。');
      const blob = await response.blob();
      const url = URL.createObjectURL(blob), anchor = document.createElement('a');
      anchor.href = url; anchor.download = 'agentdoctor-' + report.startedAt.slice(0, 10) + '.' + format; anchor.click(); URL.revokeObjectURL(url);
      setToast('已导出脱敏诊断报告');
    } catch (e) { setError((e as Error).message); } finally { setBusy(null); }
  }
  const findings = (report?.findings ?? []).filter(f =>
    (severity === 'all' || severity === f.severity) && (!repairOnly || f.repairable) &&
    (!configFilter || f.fileId === configFilter) &&
    [f.title, f.server, f.client, f.code, f.file].join(' ').toLowerCase().includes(search.toLowerCase()),
  );
  const errors = report?.summary.errors ?? 0, warnings = report?.summary.warnings ?? 0;
  const activeEngine = report?.engine || session?.engine;
  const navigation = (target: Page) => { setPage(target); setConfigFilter(null); setSearch(''); setSeverity('all'); setRepairOnly(false); };
  const exportButton = <button className="button secondary export-button" disabled={!report || !!busy} onClick={() => exportReport('md')}><ArrowDownToLine size={15} />导出报告</button>;

  function FindingList() {
    return <section className="panel findings-panel">
      <div className="panel-heading"><div className="section-title"><h2>诊断结果</h2><span className="count-badge">{report?.findings.length ?? '—'}</span></div>
        {report && <button className={'text-button ' + (repairOnly ? 'selected' : '')} onClick={() => setRepairOnly(!repairOnly)}><Wrench size={13} />只看可修复项{repairOnly && <Check size={13} />}</button>}
      </div>
      <div className="results-toolbar"><div className="search-box"><Search size={15} /><input aria-label="搜索诊断结果" placeholder="搜索问题、服务或规则…" value={search} onChange={e => setSearch(e.target.value)} />{search && <button aria-label="清除搜索" onClick={() => setSearch('')}><X size={13} /></button>}</div>
        <div className="filter-select"><select aria-label="筛选严重程度" value={severity} onChange={e => setSeverity(e.target.value)}><option value="all">全部级别</option><option value="error">需要修复</option><option value="warning">建议检查</option><option value="info">信息提示</option></select><ChevronDown size={13} /></div>
      </div>
      {configFilter && <div className="filter-pill">正在查看所选配置的结果<button onClick={() => setConfigFilter(null)}><X size={12} /></button></div>}
      {!report ? <EmptyState scanning={busy === 'scan'} onDemo={() => scan(true)} /> : findings.length === 0 ? <div className="empty-state compact"><CheckCircle2 size={30} /><h3>{report.findings.length ? '没有符合筛选条件的结果' : '本次静态检查未发现问题'}</h3><p>{report.findings.length ? '试试调整搜索词或筛选条件。' : '这不代表服务已完成握手或功能验证。'}</p></div> :
        <div className="finding-table"><div className="table-labels"><span>问题与服务</span><span>来源</span><span>级别</span><span>操作</span></div>
          {findings.map(f => <div className={'finding-entry ' + (expanded === f.id ? 'is-open' : '')} key={f.id}>
            <div className="finding-row">
              <button className="finding-main" onClick={() => setExpanded(expanded === f.id ? null : f.id)} aria-expanded={expanded === f.id}>
                <span className={'issue-icon ' + f.severity}>{f.severity === 'error' ? <XCircle size={17} /> : f.severity === 'warning' ? <TriangleAlert size={17} /> : <Info size={17} />}</span>
                <span className="finding-text"><strong>{f.title}</strong><span>{f.server}<span className="dot-separator">·</span><code>{f.code}</code></span></span>
              </button>
              <span className="client-name"><span className={'client-logo ' + f.client.toLowerCase().split(' ')[0]}>{clientLetter(f.client)}</span>{f.client}</span>
              <span className={'severity-label ' + f.severity}><i />{labels[f.severity]}</span>
              <span className="finding-action">{f.repairable ? <button className="mini-button" disabled={!!busy} onClick={() => preview(f)}>{busy === 'preview-' + f.id ? <Loader2 className="spin" size={13} /> : <Wrench size={13} />}预览修复</button> : <button className="detail-button" onClick={() => setExpanded(expanded === f.id ? null : f.id)}>{expanded === f.id ? '收起' : '查看建议'}<ChevronRight size={13} /></button>}</span>
            </div>
            {expanded === f.id && <div className="finding-detail"><div><span className="detail-label">处理建议</span><p>{f.suggestion}</p></div>{f.file && <div><span className="detail-label">配置位置</span><code className="file-path">{f.file}</code></div>}<div className="evidence"><span className="detail-label">检查依据 · {f.source}</span><p>{f.evidence}</p></div></div>}
          </div>)}
        </div>}
      <div className="panel-footer"><span><ShieldCheck size={13} />默认只读，修复前会展示改动</span>{report ? <span>{findings.length} 条结果 · {(report.durationMs / 1000).toFixed(1)} 秒</span> : <span>等待首次体检</span>}</div>
    </section>;
  }

  return <div className="app-shell">
    <aside className="sidebar">
      <a className="brand" aria-label="AgentDoctor 首页" href="#" onClick={e => { e.preventDefault(); navigation('overview'); }}><span className="brand-mark">ad<span>_</span></span><span>AgentDoctor<span className="brand-caption">开发工具诊断</span></span></a>
      <div className="sidebar-section-label">工作区</div>
      <nav>{pages.map(item => <button key={item.id} aria-label={item.label} title={item.label} className={'nav-item ' + (page === item.id ? 'active' : '')} onClick={() => navigation(item.id)}><item.icon size={18} /><span>{item.label}</span>{item.id === 'configs' && report && <span className="nav-count">{report.summary.files}</span>}{item.id === 'overview' && errors > 0 && <span className="nav-alert">{errors}</span>}</button>)}</nav>
      <div className="sidebar-bottom"><div className="sidebar-engine"><div className="engine-icon"><Cpu size={16} /></div><div><strong>MCP Doctor</strong><span>{activeEngine?.version || 'v0.1.17'} · {activeEngine?.ready ? '引擎就绪' : '引擎待就绪'}</span></div><span className={'status-dot ' + (activeEngine?.ready ? 'green' : 'amber')} /></div><button aria-label="关于与开源致谢" title="关于与开源致谢" className={'nav-item ' + (page === 'about' ? 'active' : '')} onClick={() => navigation('about')}><Info size={17} /><span>关于与开源致谢</span></button><div className="version"><span>AgentDoctor</span><code>0.1.0</code></div></div>
    </aside>
    <div className="main-shell">
      <header className="topbar"><div className="breadcrumbs"><span>工作台</span><ChevronRight size={13} /><strong>{pageTitles[page]}</strong></div><div className="topbar-right"><span className="local-status"><span className="status-dot green" />本地运行</span><span className="topbar-divider" /><span className="os-label"><Monitor size={14} />{session?.platform === 'win32' ? 'Windows' : session?.platform || '本机'}</span></div></header>
      <main>
        <div className="page-heading"><div><h1>{pageTitles[page]}</h1><p>{page === 'overview' ? '检查 MCP 配置、运行依赖和启动路径。' : page === 'configs' ? '配置文件与服务连接状态。' : page === 'environment' ? '当前进程可访问的程序、版本和路径。' : page === 'history' ? '查看体检记录，恢复已修改的配置。' : '版本信息与开源依赖。'}</p></div><div className="heading-actions">{exportButton}<button className="button primary" disabled={!session || !!busy} onClick={() => scan()}>{busy === 'scan' ? <Loader2 className="spin" size={16} /> : <RefreshCw size={15} />}{busy === 'scan' ? '正在体检…' : report ? '重新体检' : '开始体检'}</button></div></div>
        {error && <div className="notice error-notice" role="alert"><TriangleAlert size={17} /><span>{error}</span><button aria-label="关闭错误提示" onClick={() => setError('')}><X size={15} /></button></div>}
        <div className="workspace-bar"><div className="workspace-icon"><Folder size={17} /></div><div className="workspace-name"><span>当前工作区{report?.demo && <b className="demo-badge">示例扫描</b>}</span><code title={report?.workspace || workspace}>{report?.workspace || workspace || '正在连接本地服务…'}</code></div><button className="workspace-change" disabled={!!busy} onClick={() => setWorkspaceOpen(true)}>切换目录<ChevronDown size={13} /></button><span className="workspace-divider" /><span className="scope-text"><LockKeyhole size={13} />{report ? report.includeUser ? '工作区 + 用户配置' : '仅工作区配置' : includeUser ? '工作区 + 用户配置' : '仅工作区配置'}</span></div>
        {page === 'overview' && <>
          <section className={'scan-status ' + (report ? errors ? 'has-errors' : 'complete' : '')} aria-live="polite">
            <span className="scan-status-icon">{busy === 'scan' ? <Loader2 className="spin" size={17} /> : report ? errors ? <TriangleAlert size={17} /> : <CheckCircle2 size={17} /> : <Circle size={17} />}</span>
            <div><strong>{busy === 'scan' ? '正在检查…' : report ? errors ? errors + ' 项错误需要处理' : '静态检查完成，未发现错误' : '尚未体检'}</strong><span>{busy === 'scan' ? '读取本地配置与运行环境' : report ? '已检查 ' + report.summary.files + ' 份配置 · ' + report.summary.servers + ' 个服务 · 耗时 ' + (report.durationMs / 1000).toFixed(1) + ' 秒' : '开始体检以查看当前工作区的问题。'}</span></div>
            {report ? <time dateTime={report.startedAt}>{formatTime(report.startedAt)}</time> : <button className="text-button" disabled={!!busy || !session} onClick={() => scan(true)}>查看示例<ArrowRight size={13} /></button>}
          </section>
          <section className="stats-grid">
            <StatCard label="错误" value={report ? errors : '—'} icon={<XCircle size={15} />} variant="red" active={severity === 'error'} disabled={!report} onClick={() => { setSeverity(severity === 'error' ? 'all' : 'error'); setRepairOnly(false); }} />
            <StatCard label="警告" value={report ? warnings : '—'} icon={<TriangleAlert size={15} />} variant="amber" active={severity === 'warning'} disabled={!report} onClick={() => { setSeverity(severity === 'warning' ? 'all' : 'warning'); setRepairOnly(false); }} />
            <StatCard label="MCP 服务" value={report ? report.summary.servers : '—'} icon={<Layers3 size={15} />} variant="neutral" disabled={!report} onClick={() => navigation('configs')} />
            <StatCard label="可修复" value={report ? report.summary.repairable : '—'} icon={<Wrench size={15} />} variant="neutral" active={repairOnly} disabled={!report} onClick={() => { setRepairOnly(!repairOnly); setSeverity('all'); }} />
          </section>
          <div className="overview-columns"><div className="results-column">{FindingList()}</div><aside className="right-column">
            <section className="panel runtime-panel"><div className="panel-heading"><h2>运行环境</h2><button aria-label="查看全部运行环境" className="icon-button" onClick={() => navigation('environment')}><ArrowUpRight size={16} /></button></div><div className="runtime-list">{['node', 'npm', 'git', 'python', 'uv'].map(id => <RuntimeRow key={id} id={id} runtime={report?.environment.find(r => r.id === id)} />)}</div><button className="panel-link" onClick={() => navigation('environment')}>查看所有运行依赖<ArrowRight size={13} /></button></section>
            <div className="coverage-note"><Info size={14} /><p>体检仅检查配置。要验证服务是否能启动，请在 MCP 配置中执行连接探测。</p></div>
          </aside></div>
        </>}
        {page === 'configs' && <><section className="panel"><div className="panel-heading"><div className="section-title"><h2>发现的配置</h2><span className="count-badge">{report?.configs.length ?? '—'}</span></div><span className="muted small">JSON · JSONC · TOML</span></div>{!report ? <EmptyState scanning={busy === 'scan'} onDemo={() => scan(true)} /> : !report.configs.length ? <div className="empty-state compact"><FileCode2 size={30} /><h3>未发现常见位置的 MCP 配置</h3><p>切换到项目目录，或勾选用户配置后重新体检。</p></div> : <div className="config-list">{report.configs.map(config => <button key={config.id} className="config-row" onClick={() => { setPage('overview'); setConfigFilter(config.id); }}><span className="config-file-icon"><FileCode2 size={19} /></span><span className="config-row-copy"><strong>{config.client}<span className="format-badge">{config.format.toUpperCase()}</span></strong><code>{config.path}</code></span><span className="muted small">{config.serverCount} 个服务</span><span className={'pill ' + (config.status === 'error' ? 'red' : 'green')}>{config.status === 'error' ? '解析失败' : '已解析'}</span><ChevronRight size={15} /></button>)}</div>}</section>
          <section className="panel service-panel"><div className="panel-heading"><h2>服务与连接验证</h2><span className="muted small">按需启动 · 10 秒超时</span></div>{!report?.servers.length ? <div className="empty-state compact"><Layers3 size={28} /><p>完成体检后查看已配置的服务。</p></div> : <div className="service-grid">{report.servers.map(server => { const result = probeResults[server.id]; return <div className="service-card" key={server.id}><div className="service-card-heading"><span className={'client-logo ' + server.client.toLowerCase().split(' ')[0]}>{clientLetter(server.client)}</span><strong>{server.name}</strong><span className="format-badge">{server.transport}</span></div><code className="service-command" title={server.command}>{server.command}</code><div className="service-bottom"><span className={'pill ' + (result ? result.status === 'ok' ? 'green' : 'red' : 'neutral')}>{result ? result.status === 'ok' ? '握手成功' : '探测未通过' : !server.enabled ? '已停用' : '尚未握手'}</span><button className="text-button" disabled={!server.probeAllowed || !!busy} onClick={() => setProbe(server)}>{busy === 'probe-' + server.id ? <Loader2 className="spin" size={13} /> : <Play size={12} />}连接探测</button></div>{result ? <p className="probe-result">{result.message} · {result.durationMs} ms</p> : !server.probeAllowed && <p className="probe-result">本版支持本地 Node / Python 脚本；远程、shell 与包下载器请在客户端验证。</p>}</div>; })}</div>}</section></>}
        {page === 'environment' && <section className="panel"><div className="panel-heading"><h2>当前进程的运行环境</h2><span className="muted small">{session?.os}</span></div>{!report ? <EmptyState scanning={busy === 'scan'} onDemo={() => scan(true)} /> : <div className="environment-grid">{report.environment.map(runtime => <div className="environment-card" key={runtime.id}><div className="environment-card-top"><span className={'runtime-symbol ' + runtime.id}>{runtime.id === 'node' ? 'JS' : runtime.id === 'python' ? 'Py' : runtime.id === 'git' ? <GitBranch size={18} /> : <Terminal size={18} />}</span><div><h3>{runtime.name}</h3><p>{runtime.description}</p></div><span className={'pill ' + (runtime.status === 'ok' ? 'green' : runtime.status === 'error' ? 'red' : runtime.status === 'warning' ? 'amber' : 'neutral')}>{runtime.status === 'ok' ? '已找到' : runtime.status === 'optional' ? '可选 · 未找到' : runtime.status === 'warning' ? '需核对' : '未找到'}</span></div><div className="runtime-version"><span>版本</span><code>{runtime.version || (runtime.paths.length ? '未执行版本探测' : '—')}</code></div><div className="environment-paths">{runtime.paths.length ? runtime.paths.map(path => <code key={path}>{path}</code>) : <span>当前 PATH 中没有可用路径</span>}</div><p className="environment-detail"><Info size={13} />{runtime.detail}</p></div>)}</div>}<div className="panel-footer"><span><Info size={13} />桌面客户端继承的 PATH 可能与这里不同</span><span>可选工具缺失不计入错误</span></div></section>}
        {page === 'history' && <><section className="panel"><div className="panel-heading"><div className="section-title"><h2>配置备份</h2><span className="count-badge">{backups.length}</span></div><span className="muted small">原文件完整保存 · 恢复前检查 Hash</span></div>{!backups.length ? <div className="empty-state compact"><RotateCcw size={30} /><h3>还没有修改过配置</h3><p>通过修复预览应用改动后，原始备份会出现在这里。</p></div> : <div className="backup-list">{backups.map(backup => <div className="backup-row" key={backup.id}><span className="config-file-icon"><FileCheck2 size={18} /></span><div className="backup-copy"><strong>{backup.server}<span className={'pill ' + (backup.status === 'restored' ? 'neutral' : 'green')}>{backup.status === 'restored' ? '已恢复' : backup.status === 'applied' ? '可恢复' : backup.status}</span></strong><code>{backup.file}</code><span>{formatTime(backup.createdAt)} · {backup.description}</span></div><button className="mini-button" disabled={!!busy || backup.status !== 'applied'} onClick={() => setRestore(backup)}><RotateCcw size={13} />恢复原文件</button></div>)}</div>}</section><section className="panel history-panel"><div className="panel-heading"><h2>最近体检</h2><button className="icon-button" aria-label="刷新历史记录" onClick={() => refreshHistory().catch(e => setError(e.message))}><RefreshCw size={14} /></button></div>{!history.length ? <div className="empty-state compact"><HistoryIcon size={28} /><p>首次体检后，这里会留下检查记录。</p></div> : <div className="history-list">{history.map(item => <div className="history-row" key={item.id}><span className="history-dot"><Activity size={15} /></span><div><strong>{item.demo ? '示例工作区体检' : '本地环境体检'}<span className="muted small">{formatTime(item.startedAt)}</span></strong><code title={item.workspace}>{shortPath(item.workspace)}</code></div><span className="pill red">{item.summary.errors} 错误</span><span className="pill amber">{item.summary.warnings} 警告</span><span className="muted small">{item.summary.files} 份配置</span></div>)}</div>}</section></>}
        {page === 'about' && <><section className="panel about-hero"><span className="brand-mark large">ad<span>_</span></span><div><h2>AgentDoctor <span>v0.1.0</span></h2><p>AI 开发工具的本地诊断工作台</p><div className="health-tags"><span>MIT 许可</span><span>无遥测上传</span><span>Windows 优先</span></div></div></section><section className="panel"><div className="panel-heading"><h2>开源依赖</h2></div><div className="credits-list">{session?.credits.map(credit => <a href={credit.url} target="_blank" rel="noreferrer" key={credit.name}><span className="config-file-icon"><Code2 size={18} /></span><div><strong>{credit.name}<span className="format-badge">{credit.license}</span></strong><p>{credit.role}</p></div><code>{credit.version}</code><ArrowUpRight size={16} /></a>)}</div></section><div className="scope-card"><Info size={18} /><div><strong>支持范围</strong><p>JSON / JSONC 支持保留注释的局部修复；TOML 当前提供只读诊断。连接探测仅支持本地 Node / Python 脚本，不启动 shell、下载器或远程服务。扫描结果代表当前环境与静态证据，不是完整功能认证。</p></div></div></>}
        <footer className="main-footer"><span><LockKeyhole size={12} />配置与报告保存在本机</span><span>MCP Doctor {activeEngine?.version || 'v0.1.17'}</span></footer>
      </main>
    </div>
    {toast && <div className="toast" role="status"><CheckCircle2 size={17} />{toast}</div>}
    {workspaceOpen && <Modal title="选择体检范围" onClose={() => setWorkspaceOpen(false)}><p className="modal-description">填写项目目录的绝对路径。默认同时发现当前用户的常见 MCP 配置。</p><label className="field-label" htmlFor="workspace">项目目录</label><input autoFocus className="path-input" id="workspace" value={workspace} onChange={e => setWorkspace(e.target.value)} placeholder="D:\Projects\my-project" /><label className="checkbox-label"><input type="checkbox" checked={includeUser} onChange={e => setIncludeUser(e.target.checked)} /><span>同时检查当前用户配置<small>Cursor、Claude、Codex、VS Code 等常见位置</small></span></label><div className="modal-footer"><button className="button secondary" onClick={() => setWorkspaceOpen(false)}>取消</button><button className="button primary" disabled={!workspace.trim()} onClick={() => scan()}>开始只读体检<ArrowRight size={15} /></button></div></Modal>}
    {plan && <Modal title="确认这一次修复" onClose={() => !busy && setPlan(null)} wide><div className="repair-context"><span className="pill green"><Wrench size={12} />{plan.description}</span><code>{plan.file}</code></div><div className="diff-head"><span>配置改动预览 · {plan.server}</span><span>密钥已隐藏</span></div><pre className="diff-preview">{plan.diff.split('\n').map((line, index) => <span key={index} className={line.startsWith('+') ? 'diff-add' : line.startsWith('-') ? 'diff-remove' : line.startsWith('@@') ? 'diff-range' : ''}>{line || ' '}{'\n'}</span>)}</pre><div className="repair-guarantee"><ShieldCheck size={17} /><p>应用前保存原始文件并校验备份，完成后自动复检。<br /><span>如果配置已被其他程序修改，会阻止覆盖并要求重新扫描。</span></p></div><div className="modal-footer"><button className="button secondary" disabled={!!busy} onClick={() => setPlan(null)}>暂不修改</button><button className="button primary" disabled={!!busy} onClick={apply}>{busy === 'apply' ? <Loader2 className="spin" size={15} /> : <ShieldCheck size={15} />}备份并应用修复</button></div></Modal>}
    {restore && <Modal title="恢复原始配置" onClose={() => !busy && setRestore(null)}><div className="restore-icon"><RotateCcw size={23} /></div><p className="modal-description">将恢复 <strong>{restore.server}</strong> 所在文件在这次修复前的完整内容，包括原有注释与格式。</p><code className="modal-file">{restore.file}</code><p className="notice subtle"><ShieldCheck size={16} />修复后若有新的编辑，将阻止恢复，避免覆盖你的后续修改。</p><div className="modal-footer"><button className="button secondary" disabled={!!busy} onClick={() => setRestore(null)}>取消</button><button className="button primary" disabled={!!busy} onClick={restoreBackup}>{busy === 'restore' ? <Loader2 className="spin" size={15} /> : <RotateCcw size={15} />}检查并恢复</button></div></Modal>}
    {probe && <Modal title="启动一次本地连接探测" onClose={() => setProbe(null)}><p className="modal-description">将启动 <strong>{probe.name}</strong> 对应的本地进程，执行 MCP 初始化和工具清单查询。</p><pre className="modal-file">{[probe.command, ...probe.args].map(arg => JSON.stringify(arg)).join(' ')}</pre><p className="probe-result">工作目录：{probe.cwd}</p><p className="notice subtle"><Info size={16} />不会调用工具，但服务启动本身可能有副作用。10 秒超时后关闭连接。</p><div className="modal-footer"><button className="button secondary" onClick={() => setProbe(null)}>取消</button><button className="button primary" onClick={runProbe}><Play size={14} />启动并探测</button></div></Modal>}
  </div>;
}

function StatCard({ label, value, icon, variant, active, disabled, onClick }: { label: string; value: number | string; icon: React.ReactNode; variant: string; active?: boolean; disabled?: boolean; onClick: () => void }) {
  return <button className={'stat-card ' + variant + (active ? ' selected' : '')} disabled={disabled} onClick={onClick} aria-pressed={active}><span className="stat-icon">{icon}</span><span>{label}</span><strong className="stat-value">{value}</strong></button>;
}
function RuntimeRow({ id, runtime }: { id: string; runtime?: Runtime }) {
  const names: Record<string, string> = { node: 'Node.js', npm: 'npm / npx', git: 'Git', python: 'Python', uv: 'uv / uvx' };
  return <div className="runtime-row"><span className={'runtime-symbol ' + id}>{id === 'node' ? 'JS' : id === 'python' ? 'Py' : id === 'git' ? <GitBranch size={16} /> : id === 'npm' ? 'npm' : 'uv'}</span><div><strong>{names[id]}</strong><span>{runtime?.version?.replace(/^node\s+|^Python\s+|^git version\s+/i, '') || (runtime ? runtime.paths.length ? '命令可用' : '按需安装' : '等待检查')}</span></div>{runtime ? runtime.status === 'ok' ? <CheckCircle2 className="runtime-ok" size={16} /> : runtime.status === 'error' ? <XCircle className="runtime-error" size={16} /> : runtime.status === 'warning' ? <TriangleAlert className="runtime-warning" size={16} /> : <span className="optional-label">可选</span> : <Circle className="runtime-pending" size={14} />}</div>;
}
function EmptyState({ scanning, onDemo }: { scanning: boolean; onDemo: () => void }) {
  return <div className="empty-state"><div className="empty-icon">{scanning ? <Loader2 className="spin" size={24} /> : <FileCheck2 size={24} strokeWidth={1.5} />}</div><h3>{scanning ? '正在读取本地配置…' : '暂无诊断结果'}</h3><p>{scanning ? '检查完成后将在这里显示结果。' : '开始体检，检查配置与运行环境。'}</p>{!scanning && <button className="text-button" onClick={onDemo}>查看示例工作区<ArrowRight size={13} /></button>}</div>;
}
function Modal({ title, children, onClose, wide }: { title: string; children: React.ReactNode; onClose: () => void; wide?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement;
    const focusable = () => Array.from(ref.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input, [tabindex="0"]') || []);
    focusable()[0]?.focus();
    const trap = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return;
      const items = focusable(), first = items[0], last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    document.addEventListener('keydown', trap);
    return () => { document.removeEventListener('keydown', trap); previous?.focus(); };
  }, []);
  return <div className="modal-overlay" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}><div ref={ref} className={'modal ' + (wide ? 'wide' : '')} role="dialog" aria-modal="true" aria-label={title}><div className="modal-heading"><h2>{title}</h2><button className="icon-button" onClick={onClose} aria-label="关闭弹窗"><X size={18} /></button></div>{children}</div></div>;
}
