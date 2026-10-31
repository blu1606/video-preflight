const jsonServer = require('json-server');
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');

const database = path.resolve(process.env.PREFLIGHT_DB_FILE || 'db/db.json');
const backups = path.resolve(process.env.PREFLIGHT_BACKUP_DIR || 'db/backups');
const server = jsonServer.create();
server.use(jsonServer.defaults({ logger: false, static: path.resolve('.runtime/db-public') }));
server.use(jsonServer.bodyParser);
server.use((req, res, next) => {
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
    try {
      fs.mkdirSync(backups, { recursive: true });
      fs.copyFileSync(database, path.join(backups, `${Date.now()}-${randomUUID()}.json`), fs.constants.COPYFILE_EXCL);
    } catch {
      return res.status(503).json({ detail: 'Không sao lưu được DB; thay đổi đã bị chặn.' });
    }
  }
  next();
});
server.use(jsonServer.router(database));
const listener = server.listen(Number(process.env.PREFLIGHT_DB_PORT ?? 3101), '127.0.0.1', () => process.stdout.write(`[db] http://127.0.0.1:${listener.address().port} · backup trước mỗi thay đổi\n`));
