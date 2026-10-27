import { readFile, writeFile, mkdir, rename, unlink, lstat, realpath, readdir } from 'node:fs/promises';
import { join, basename, dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import { createPatch } from 'diff';
import { digest, patchServer, parseConfig } from './config.mjs';
import { redactObject, redactText } from './privacy.mjs';

export class ConflictError extends Error { constructor(message) { super(message); this.statusCode = 409; } }
async function writeAtomic(path, data, mode = 0o600) {
  const temp = join(dirname(path), '.' + basename(path) + '.agentdoctor-' + randomUUID() + '.tmp');
  try { await writeFile(temp, data, { flag: 'wx', mode }); await rename(temp, path); }
  finally { await unlink(temp).catch(() => {}); }
}
export class RepairStore {
  constructor(directory) {
    this.directory = directory;
    this.plans = new Map();
    this.locks = new Set();
  }
  async makePlan(config, entry, replacement, description) {
    if (this.plans.size > 100) this.plans.clear();
    const after = patchServer(config, entry, replacement);
    const beforeDisplay = JSON.stringify(redactObject(entry.config, config.secrets), null, 2);
    const afterDisplay = JSON.stringify(redactObject({ ...entry.config, ...replacement }, config.secrets), null, 2);
    const plan = {
      id: randomUUID(), config, entry, replacement, after, description,
      expiresAt: Date.now() + 5 * 60 * 1000,
    };
    this.plans.set(plan.id, plan);
    return {
      id: plan.id, expiresAt: plan.expiresAt, description, file: config.path, server: entry.name,
      before: beforeDisplay, after: afterDisplay,
      diff: createPatch(basename(config.path) + ' / ' + entry.name, beforeDisplay, afterDisplay, '当前配置', '修复后', { context: 3 }),
    };
  }
  async assertCurrent(plan) {
    const { config } = plan;
    const info = await lstat(config.path);
    if (!info.isFile() || info.isSymbolicLink() || (await realpath(config.path)) !== config.canonicalPath) {
      throw new ConflictError('配置路径发生变化，请重新扫描。');
    }
    const current = await readFile(config.path);
    if (digest(current) !== config.hash) throw new ConflictError('预览后配置已被其他程序修改，请重新扫描；没有覆盖文件。');
    return current;
  }
  async apply(id) {
    const plan = this.plans.get(id);
    if (!plan || plan.expiresAt < Date.now()) throw new ConflictError('修复预览已过期，请重新生成。');
    const lock = plan.config.canonicalPath;
    if (this.locks.has(lock)) throw new ConflictError('该配置正在修改，请稍后重试。');
    this.locks.add(lock);
    try {
      const original = await this.assertCurrent(plan);
      await mkdir(this.directory, { recursive: true, mode: 0o700 });
      const backupId = randomUUID();
      const backupPath = join(this.directory, backupId + '.original');
      const manifestPath = join(this.directory, backupId + '.json');
      const manifest = {
        id: backupId, file: plan.config.path, canonicalPath: plan.config.canonicalPath,
        server: plan.entry.name, description: plan.description, createdAt: new Date().toISOString(),
        beforeHash: digest(original), afterHash: digest(Buffer.from(plan.after)), status: 'prepared', mode: plan.config.mode,
      };
      await writeFile(backupPath, original, { flag: 'wx', mode: 0o600 });
      if (digest(await readFile(backupPath)) !== manifest.beforeHash) throw new Error('备份校验失败，未修改配置。');
      await writeFile(manifestPath, JSON.stringify(manifest, null, 2), { flag: 'wx', mode: 0o600 });
      await this.assertCurrent(plan);
      await writeAtomic(plan.config.path, plan.after, plan.config.mode);
      this.plans.delete(id);
      manifest.status = 'applied';
      await writeAtomic(manifestPath, JSON.stringify(manifest, null, 2));
      return { id: backupId, status: 'applied', file: plan.config.path, message: '已备份原文件并应用修复。' };
    } finally { this.locks.delete(lock); }
  }
  async list() {
    let names;
    try { names = await readdir(this.directory); } catch { return []; }
    const result = [];
    for (const name of names.filter(n => /^[a-f0-9-]+\.json$/.test(n)).slice(-100)) {
      try {
        const entry = JSON.parse(await readFile(join(this.directory, name), 'utf8'));
        if (entry.status === 'prepared') {
          const currentHash = digest(await readFile(entry.file));
          entry.status = currentHash === entry.afterHash ? 'applied' : currentHash === entry.beforeHash ? 'not_applied' : 'conflict';
        }
        result.push({ id: entry.id, file: entry.file, server: entry.server, description: entry.description, createdAt: entry.createdAt, status: entry.status, restoredAt: entry.restoredAt });
      } catch {}
    }
    return result.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
  async restore(id) {
    if (!/^[a-f0-9-]{36}$/.test(id)) throw new Error('备份编号无效。');
    const manifestPath = join(this.directory, id + '.json');
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
    if (!['applied', 'prepared'].includes(manifest.status)) throw new ConflictError('该备份当前不能恢复。');
    const lock = manifest.canonicalPath;
    if (this.locks.has(lock)) throw new ConflictError('文件正在修改，请稍后重试。');
    this.locks.add(lock);
    try {
      const info = await lstat(manifest.file);
      if (!info.isFile() || info.isSymbolicLink() || (await realpath(manifest.file)) !== manifest.canonicalPath) throw new ConflictError('配置路径已变化，未执行恢复。');
      const current = await readFile(manifest.file);
      if (digest(current) !== manifest.afterHash) throw new ConflictError('修复后文件又有新的修改，已阻止覆盖；原始备份仍然保留。');
      const original = await readFile(join(this.directory, id + '.original'));
      if (digest(original) !== manifest.beforeHash) throw new ConflictError('原始备份校验失败，未执行恢复。');
      await writeAtomic(manifest.file, original, manifest.mode);
      manifest.status = 'restored';
      manifest.restoredAt = new Date().toISOString();
      await writeAtomic(manifestPath, JSON.stringify(manifest, null, 2));
      return { id, status: 'restored', message: '已恢复修复前的原始文件。' };
    } finally { this.locks.delete(lock); }
  }
}
