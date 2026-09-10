// Local QA48 harness only; not an application endpoint or an AI write tool.
const fs = require('node:fs');
const path = require('node:path');
const net = require('node:net');
const { spawn } = require('node:child_process');
const mysql = require('mysql2/promise');
const root = path.resolve(__dirname, '../..');
const apiUrl = 'http://localhost:3001/api';
const webUrl = 'http://localhost:5174';
const database = 'hospital_it_asset_qa48';
const user = 'suth_qa48';
const action = process.argv[2];

function secret(name) {
  const value = process.env[name];
  if (!value || !/^[a-f0-9]{64}$/.test(value)) throw new Error(`Missing or invalid QA secret: ${name}`);
  return value;
}

function portFree(port) {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', () => reject(new Error(`QA port ${port} is occupied; refusing to adopt or stop an unknown service`)));
    server.listen(port, () => server.close(resolve));
  });
}

async function provision() {
  await portFree(3001); await portFree(5174);
  // The only privileged connection: explicitly approved bootstrap credentials,
  // never business records, never original DB, never schema/seed/reset.
  const original = require('dotenv').parse(fs.readFileSync(path.join(root, 'apps/api/.env')));
  if (!['localhost', '127.0.0.1', '::1'].includes(original.DB_HOST || 'localhost')) throw new Error('Bootstrap must be local');
  const db = await mysql.createConnection({ host: original.DB_HOST || 'localhost', port: Number(original.DB_PORT || 3306), user: original.DB_USER, password: original.DB_PASSWORD, database });
  try {
    const [[target]] = await db.query('SELECT DATABASE() AS name');
    if (target.name !== database) throw new Error('Wrong bootstrap database');
    const [accounts] = await db.query('SELECT username FROM users');
    const expected = ['qa48-admin', 'qa48-staff', 'qa48-viewer'];
    if (accounts.length !== 3 || accounts.some(row => !expected.includes(row.username))) throw new Error('QA account sentinel mismatch');
    const [runtime] = await db.execute('SELECT User FROM mysql.user WHERE User=? AND Host=?', [user, 'localhost']);
    if (runtime.length !== 1) throw new Error('QA runtime account missing; no account created automatically');
    await db.query("ALTER USER 'suth_qa48'@'localhost' IDENTIFIED BY ?", [secret('DB_PASSWORD')]);
    const hash = await require('bcrypt').hash(secret('QA48_PASSWORD'), 10);
    await db.execute('UPDATE users SET password=? WHERE username IN (?,?,?)', [hash, ...expected]);
    console.log('QA48 credentials rotated; no schema, grants or business data changed.');
  } finally { await db.end(); }
}

async function validateRuntime() {
  const db = await mysql.createConnection({ host: 'localhost', user, password: secret('DB_PASSWORD'), database });
  try {
    const [[target]] = await db.query('SELECT DATABASE() AS name, CURRENT_USER() AS account');
    if (target.name !== database || target.account !== `${user}@localhost`) throw new Error('Wrong QA runtime identity');
    // Metadata only. Business-data checks use HTTP after login.
  } finally { await db.end(); }
}

async function identity() {
  await validateRuntime();
  const health = await fetch(`${apiUrl}/health`, { signal: AbortSignal.timeout(3000), redirect: 'error' });
  if (!health.ok) throw new Error('QA health failed');
  const res = await fetch(`${apiUrl}/auth/login`, { method: 'POST', redirect: 'error', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'qa48-admin', password: secret('QA48_PASSWORD') }) });
  if (!res.ok) throw new Error('QA login failed');
  const cookie = res.headers.get('set-cookie')?.split(';')[0];
  if (!cookie) throw new Error('QA session missing');
  const token = cookie.slice(cookie.indexOf('=') + 1);
  require('jsonwebtoken').verify(token, secret('JWT_SECRET'));
  const devices = await fetch(`${apiUrl}/devices`, { headers: { Cookie: cookie }, redirect: 'error' });
  if (!devices.ok) throw new Error('QA devices unavailable');
  const rows = await devices.json();
  if (rows.length !== 25 || rows.some(row => !/^QA48-\d{3}$/.test(row.serial_number))) throw new Error('QA device sentinel mismatch');
  console.log('QA48 runtime identity, health, real login and 25 synthetic devices verified.');
}

function child(args, cwd, env, log) {
  const fd = fs.openSync(log, 'a');
  const proc = spawn(process.execPath, args, { cwd, env, windowsHide: true, stdio: ['ignore', fd, fd] });
  fs.closeSync(fd);
  return proc;
}

async function start() {
  await portFree(3001); await portFree(5174); await validateRuntime();
  const out = path.join(root, 'output/qa48', `session-${Date.now()}`);
  fs.mkdirSync(out, { recursive: true });
  const api = child(['index.js'], path.join(root, 'apps/api'), { ...process.env, DB_HOST: 'localhost', DB_PORT: '3306', DB_NAME: database, DB_USER: user, DB_PASSWORD: secret('DB_PASSWORD'), JWT_SECRET: secret('JWT_SECRET'), PORT: '3001', CORS_ORIGIN: webUrl, NODE_ENV: 'development' }, path.join(out, 'api.log'));
  const web = child([path.join(root, 'node_modules/vite/bin/vite.js'), '--port', '5174', '--strictPort'], path.join(root, 'apps/web'), { ...process.env, VITE_API_BASE_URL: apiUrl }, path.join(out, 'web.log'));
  const stop = () => { api.kill(); web.kill(); };
  process.once('SIGINT', () => { stop(); process.exit(0); });
  process.once('SIGTERM', () => { stop(); process.exit(0); });
  for (const proc of [api, web]) {
    proc.once('error', () => { stop(); process.exitCode = 1; });
    proc.once('exit', () => { stop(); });
  }
  fs.writeFileSync(path.join(out, 'processes.json'), JSON.stringify({ root, api: api.pid, web: web.pid, launcher: process.pid }));
  try {
    for (let attempt = 0; attempt < 40; attempt++) {
      try {
        if ((await fetch(`${apiUrl}/health`, { signal: AbortSignal.timeout(1000) })).ok && (await fetch(webUrl, { signal: AbortSignal.timeout(1000) })).ok) {
          await identity();
          console.log(`QA ready: ${webUrl}/assets. Keep this session open; Ctrl+C stops only its children.`);
          return;
        }
      } catch {}
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    throw new Error('QA startup timeout');
  } catch (error) { stop(); throw error; }
}

async function tests() {
  await identity();
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const out = path.join(root, 'output/qa48', `${action}-${stamp}`);
  fs.mkdirSync(out, { recursive: true });
  const specs = action === 'verify' ? ['asset-qa48.spec.js'] : ['wcag.spec.js', 'asset-drawer.spec.js', 'asset-evidence.spec.js', 'report-workflow.spec.js', 'shell.spec.js', 'page-structure.spec.js', '--grep-invert', '4.1.3'];
  const env = { ...process.env, SUTH_WEB_URL: webUrl, SUTH_API_URL: apiUrl, SUTH_E2E_ALLOW_WRITES: '0', SUTH_QA48_ALLOW_WRITES: action === 'verify' ? '1' : '0' };
  delete env.SUTH_E2E_TOKEN;
  const proc = child([path.join(root, 'node_modules/@playwright/test/cli.js'), 'test', ...specs, '--output', path.join(out, 'artifacts')], path.join(root, 'apps/web'), env, path.join(out, 'tests.log'));
  const code = await new Promise((resolve, reject) => { proc.once('error', reject); proc.once('exit', resolve); });
  console.log(`${action}: exit ${code}; evidence ${out}`);
  if (code !== 0) throw new Error('QA tests failed');
}

async function main() {
  if (action === 'provision') return provision();
  if (action === 'start') return start();
  if (['verify', 'regression'].includes(action)) return tests();
  throw new Error('Unknown QA48 action');
}
main().catch(() => { console.error(`QA48 ${action} failed; credentials are not logged. Check target, vault and separate test/service output.`); process.exitCode = 1; });
