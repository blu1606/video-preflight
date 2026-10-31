import { spawn } from 'node:child_process';
import net from 'node:net';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const children = [];
let stopping = false;

function start(command, args) {
  const child = spawn(command, args, { cwd: root, stdio: 'inherit', detached: process.platform !== 'win32' });
  children.push(child);
  child.on('error', (error) => { process.stderr.write(`${error.message}\n`); stop(1); });
  child.on('exit', (code) => { if (!stopping) stop(code || 1); });
  return child;
}

function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children) {
    try {
      if (process.platform === 'win32') child.kill('SIGTERM');
      else process.kill(-child.pid, 'SIGTERM');
    } catch { /* Child already exited. */ }
  }
  setTimeout(() => process.exit(code), 400).unref();
  process.exitCode = code;
}

const available = (port) => new Promise((resolve, reject) => {
  const server = net.createServer();
  server.once('error', () => reject(new Error(`Cổng ${port} đang được dùng. Hãy dừng đúng lab cũ trước khi chạy.`)));
  server.listen(port, '127.0.0.1', () => server.close(resolve));
});

async function ready(url) {
  for (let attempt = 0; attempt < 100 && !stopping; attempt++) {
    try { if ((await fetch(url, { signal: AbortSignal.timeout(1000) })).ok) return; } catch { /* Wait for startup. */ }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`Dịch vụ chưa sẵn sàng: ${url}`);
}

try {
  await Promise.all([3101, 8100, 5180].map(available));
  const init = spawn('uv', ['run', 'python', 'db/build_seed.py'], { cwd: root, stdio: 'inherit' });
  await new Promise((resolve, reject) => {
    init.on('error', reject);
    init.on('exit', (code) => code === 0 ? resolve() : reject(new Error('Không khởi tạo được DB')));
  });
  start(process.execPath, ['scripts/db-server.cjs']);
  await ready('http://127.0.0.1:3101/meta');
  start('uv', ['run', 'uvicorn', 'api:app', '--host', '127.0.0.1', '--port', '8100']);
  await ready('http://127.0.0.1:8100/health');
  start(process.execPath, ['node_modules/vite/bin/vite.js', '--config', 'web/vite.config.js']);
  await ready('http://127.0.0.1:5180');
  process.stdout.write('\nPreflight sẵn sàng: http://127.0.0.1:5180\nAPI: http://127.0.0.1:8100/docs · DB: http://127.0.0.1:3101\nBackend không auto-reload; Ctrl+C và chạy lại pnpm lab sau khi sửa Python.\n');
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  stop(1);
}
process.on('SIGINT', () => stop(0));
process.on('SIGTERM', () => stop(0));
