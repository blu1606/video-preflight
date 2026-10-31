import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

test('json-server snapshots the prior DB before each mutation', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'preflight-db-test-'));
  const database = path.join(directory, 'db.json');
  const backups = path.join(directory, 'backups');
  await writeFile(database, await readFile('db/template.json'));
  const server = spawn(process.execPath, ['scripts/db-server.cjs'], {
    env: { ...process.env, PREFLIGHT_DB_FILE: database, PREFLIGHT_BACKUP_DIR: backups, PREFLIGHT_DB_PORT: '0' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  try {
    const base = await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('DB startup timed out')), 8000);
      server.once('error', reject);
      server.stdout.on('data', (chunk) => {
        const url = chunk.toString().match(/http:\/\/127\.0\.0\.1:\d+/)?.[0];
        if (url) { clearTimeout(timeout); resolve(url); }
      });
      server.once('exit', (code) => { clearTimeout(timeout); reject(new Error(`DB exited ${code}`)); });
    });
    const created = await fetch(`${base}/shops`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: 'test-only', name: 'Test fixture' }) });
    assert.equal(created.status, 201);
    let snapshots = await readdir(backups);
    assert.equal(snapshots.length, 1);
    assert.equal(JSON.parse(await readFile(path.join(backups, snapshots[0]), 'utf8')).shops.length, 0);
    await fetch(`${base}/shops/test-only`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'Updated fixture' }) });
    snapshots = await readdir(backups);
    assert.equal(snapshots.length, 2);
    const states = await Promise.all(snapshots.map(async (file) => JSON.parse(await readFile(path.join(backups, file), 'utf8'))));
    assert.ok(states.some((state) => state.shops[0]?.name === 'Test fixture'));
    assert.equal((await (await fetch(`${base}/shops/test-only`)).json()).name, 'Updated fixture');
  } finally {
    server.kill('SIGTERM');
    await new Promise((resolve) => server.once('exit', resolve));
    await rm(directory, { recursive: true, force: true });
  }
});
