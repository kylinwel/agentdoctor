import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { digest, readConfig } from '../server/config.mjs';
import { RepairStore } from '../server/repairs.mjs';

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'agentdoctor-repair-test-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const path = join(root, 'mcp.json');
  const original = '// preserved\n' + JSON.stringify({ mcpServers: { sample: { command: 'old-node', args: ['server.js'], env: { SECRET: 'private-value' } } }, theme: 'dark' }, null, 2);
  await writeFile(path, original);
  const config = await readConfig({ id: digest(path), path, client: 'Fixture' }, root);
  const store = new RepairStore(join(root, 'backups'));
  const plan = await store.makePlan(config, config.entries[0], { command: 'new-node' }, 'Use current node');
  return { root, path, original, config, store, plan };
}
test('preview is redacted, then apply and restore preserve original bytes', async t => {
  const f = await fixture(t);
  assert.ok(!JSON.stringify(f.plan).includes('private-value'));
  assert.equal(await readFile(f.path, 'utf8'), f.original);
  const applied = await f.store.apply(f.plan.id);
  assert.equal(applied.status, 'applied');
  assert.equal(JSON.parse((await readFile(f.path, 'utf8')).replace(/^\/\/.*\n/, '')).mcpServers.sample.command, 'new-node');
  assert.equal((await f.store.list())[0].status, 'applied');
  await f.store.restore(applied.id);
  assert.equal(await readFile(f.path, 'utf8'), f.original);
  assert.equal((await f.store.list())[0].status, 'restored');
  await assert.rejects(f.store.restore(applied.id), /不能恢复/);
});
test('concurrent user changes make a preview stale and are never overwritten', async t => {
  const f = await fixture(t);
  const changed = f.original + '\n// user edit';
  await writeFile(f.path, changed);
  await assert.rejects(f.store.apply(f.plan.id), /其他程序修改/);
  assert.equal(await readFile(f.path, 'utf8'), changed);
  assert.equal((await f.store.list()).length, 0);
});
test('restore refuses to discard edits made after a repair', async t => {
  const f = await fixture(t);
  const applied = await f.store.apply(f.plan.id);
  const changed = (await readFile(f.path, 'utf8')) + '\n// valuable follow-up edit';
  await writeFile(f.path, changed);
  await assert.rejects(f.store.restore(applied.id), /新的修改/);
  assert.equal(await readFile(f.path, 'utf8'), changed);
});
test('modified original backup is rejected before restore', async t => {
  const f = await fixture(t);
  const applied = await f.store.apply(f.plan.id);
  await writeFile(join(f.root, 'backups', applied.id + '.original'), 'tampered');
  const before = await readFile(f.path, 'utf8');
  await assert.rejects(f.store.restore(applied.id), /备份校验失败/);
  assert.equal(await readFile(f.path, 'utf8'), before);
});
test('expired previews and reused preview IDs cannot apply', async t => {
  const f = await fixture(t);
  f.store.plans.get(f.plan.id).expiresAt = Date.now() - 1;
  await assert.rejects(f.store.apply(f.plan.id), /过期/);
  f.store.plans.get(f.plan.id).expiresAt = Date.now() + 60000;
  await f.store.apply(f.plan.id);
  await assert.rejects(f.store.apply(f.plan.id), /过期/);
});
