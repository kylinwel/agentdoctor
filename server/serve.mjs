import http from 'node:http';
import { readFile, stat, mkdir } from 'node:fs/promises';
import { join, resolve, extname, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { Doctor } from './doctor.mjs';
import { ensureDemo } from './demo.mjs';
import { probeServer } from './probe.mjs';
import { redactText } from './privacy.mjs';

export const projectRoot = fileURLToPath(new URL('../', import.meta.url));
const id = z.string().uuid();
const scanSchema = z.object({ workspace: z.string().min(1).max(2048).optional(), includeUser: z.boolean().optional(), demo: z.boolean().optional() }).strict();
const reportSchema = z.object({ reportId: id, findingId: id }).strict();
const applySchema = z.object({ reportId: id, planId: id, approved: z.literal(true) }).strict();
const probeSchema = z.object({ reportId: id, serverId: z.string().min(1).max(64), approved: z.literal(true) }).strict();
const mimeTypes = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2' };

export async function createApp({ port = Number(process.env.PORT || 4318), stateDir = join(projectRoot, '.agentdoctor'), defaultWorkspace = process.env.AGENTDOCTOR_WORKSPACE || projectRoot } = {}) {
  const demoWorkspace = await ensureDemo(projectRoot);
  const doctor = new Doctor({ stateDir, defaultWorkspace, demoWorkspace });
  const token = randomBytes(32).toString('hex');
  let activeProbe = false;
  const server = http.createServer(async (req, res) => {
    const send = (status, data, type = 'application/json; charset=utf-8') => {
      res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
      res.end(type.startsWith('application/json') ? JSON.stringify(data) : data);
    };
    try {
      const actualPort = server.address()?.port;
      const allowedHosts = new Set(['127.0.0.1:' + actualPort, 'localhost:' + actualPort]);
      if (process.env.NODE_ENV === 'development') { allowedHosts.add('127.0.0.1:5173'); allowedHosts.add('localhost:5173'); }
      if (!allowedHosts.has(req.headers.host)) return send(403, { error: '不允许的主机地址。' });
      const origin = req.headers.origin;
      if (origin && ![...allowedHosts].some(host => origin === 'http://' + host)) return send(403, { error: '已阻止跨站请求。' });
      if (req.headers['sec-fetch-site'] === 'cross-site') return send(403, { error: '已阻止跨站请求。' });
      const url = new URL(req.url, 'http://127.0.0.1');
      if (url.pathname.startsWith('/api/')) {
        if (req.method === 'GET' && url.pathname === '/api/session') return send(200, { ...(await doctor.session()), token });
        const supplied = req.headers['x-agentdoctor-token'] || url.searchParams.get('session');
        if (typeof supplied !== 'string' || supplied.length !== token.length || !timingSafeEqual(Buffer.from(supplied), Buffer.from(token))) return send(401, { error: '会话已失效，请刷新页面。' });
        if (req.method === 'GET' && url.pathname === '/api/history') return send(200, { history: await doctor.history(), backups: await doctor.repairs.list() });
        if (req.method === 'GET' && url.pathname === '/api/report') {
          const reportId = id.parse(url.searchParams.get('id'));
          const format = url.searchParams.get('format') === 'md' ? 'md' : 'json';
          res.setHeader('Content-Disposition', 'attachment; filename="agentdoctor-report.' + format + '"');
          return send(200, doctor.exportReport(reportId, format), format === 'md' ? 'text/markdown; charset=utf-8' : 'text/plain; charset=utf-8');
        }
        if (req.method !== 'POST') return send(404, { error: '接口不存在。' });
        if (!req.headers['content-type']?.startsWith('application/json')) return send(415, { error: '请求必须使用 JSON。' });
        let raw = '';
        for await (const chunk of req) {
          raw += chunk;
          if (Buffer.byteLength(raw) > 16384) return send(413, { error: '请求过大。' });
        }
        let body;
        try { body = JSON.parse(raw || '{}'); } catch { return send(400, { error: 'JSON 请求无效。' }); }
        if (url.pathname === '/api/scan') return send(200, await doctor.scan(scanSchema.parse(body)));
        if (url.pathname === '/api/repair/preview') {
          const data = reportSchema.parse(body);
          return send(200, await doctor.preview(data.reportId, data.findingId));
        }
        if (url.pathname === '/api/repair/apply') {
          const data = applySchema.parse(body);
          return send(200, await doctor.apply(data.planId, data.reportId));
        }
        if (url.pathname === '/api/backup/restore') {
          const data = z.object({ id, approved: z.literal(true) }).strict().parse(body);
          return send(200, await doctor.restore(data.id));
        }
        if (url.pathname === '/api/probe') {
          const data = probeSchema.parse(body);
          if (activeProbe) return send(409, { error: '已有探测正在进行。' });
          activeProbe = true;
          try { return send(200, await probeServer(doctor, data.reportId, data.serverId)); } finally { activeProbe = false; }
        }
        return send(404, { error: '接口不存在。' });
      }
      if (!['GET', 'HEAD'].includes(req.method)) return send(405, { error: '不支持此操作。' });
      let path = resolve(projectRoot, 'dist', '.' + decodeURIComponent(url.pathname));
      const dist = resolve(projectRoot, 'dist');
      if (path !== dist && !path.startsWith(dist + sep)) return send(403, 'Forbidden', 'text/plain');
      try { if (!(await stat(path)).isFile()) path = join(dist, 'index.html'); } catch { path = join(dist, 'index.html'); }
      let content;
      try { content = await readFile(path); } catch { return send(503, '前端尚未构建，请先运行 npm run build。', 'text/plain; charset=utf-8'); }
      res.writeHead(200, {
        'Content-Type': mimeTypes[extname(path)] || 'application/octet-stream',
        'X-Content-Type-Options': 'nosniff',
        'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'self'",
      });
      res.end(req.method === 'HEAD' ? undefined : content);
    } catch (error) {
      const message = error instanceof z.ZodError ? '请求参数不符合接口要求。' : redactText(error.message || '操作失败。', [], true);
      const status = error.statusCode || (error instanceof z.ZodError ? 400 : 400);
      send(status, { error: message });
    }
  });
  await new Promise((accept, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', accept); });
  return { server, doctor, url: 'http://127.0.0.1:' + server.address().port };
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const { url } = await createApp();
  console.log('AgentDoctor is ready: ' + url);
  console.log('Static scans do not start configured MCP servers. Backups and reports stay local.');
}
