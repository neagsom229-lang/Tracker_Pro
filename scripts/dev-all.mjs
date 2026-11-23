// scripts/dev-all.mjs — one command for the local dev stack:
//   API  : node --watch --env-file=.env server/index.js  (dev tracker_db)
//   Vite : VITE_DATA_BACKEND=local, proxying /api to the API
// Refuses to start against a *_test database or in production.
import { spawn, execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

function readDotenv() {
  const env = {};
  for (const line of readFileSync('.env', 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)=(.*)\s*$/);
    if (m) env[m[1]] = m[2];
  }
  return env;
}

const fileEnv = readDotenv();
const db = process.env.PGDATABASE ?? fileEnv.PGDATABASE;
const nodeEnv = process.env.NODE_ENV ?? fileEnv.NODE_ENV;

if (nodeEnv === 'production') {
  console.error('[dev:all] refusing to run with NODE_ENV=production');
  process.exit(1);
}
if (!db || db.endsWith('_test')) {
  console.error(`[dev:all] refusing database "${db ?? '(unset)'}" — dev:all targets the dev database (tracker_db)`);
  process.exit(1);
}

const children = [];
let shuttingDown = false;

function killTree(child) {
  if (!child || child.exitCode !== null) return;
  if (process.platform === 'win32') {
    try {
      execFileSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
    } catch {
      /* already gone */
    }
  } else {
    try {
      child.kill('SIGTERM');
    } catch {
      /* already gone */
    }
  }
}

function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of children) killTree(child);
  process.exit(code);
}

function start(name, command, args, env) {
  const child = spawn(command, args, { stdio: 'inherit', env });
  children.push(child);
  child.on('exit', (code) => {
    if (!shuttingDown) {
      console.error(`[dev:all] ${name} exited with code ${code}`);
      shutdown(code ?? 1);
    }
  });
  return child;
}

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));

console.log(`[dev:all] API on :${process.env.PORT ?? 4000} (db=${db}), Vite local mode on :5173`);
start('api', process.execPath, ['--watch', '--env-file=.env', join('server', 'index.js')], process.env);
start('vite', process.execPath, [join('node_modules', 'vite', 'bin', 'vite.js')], {
  ...process.env,
  VITE_DATA_BACKEND: 'local',
});
