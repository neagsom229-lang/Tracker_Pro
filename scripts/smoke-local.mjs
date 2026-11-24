// scripts/smoke-local.mjs — self-contained headless smoke test of the LOCAL
// backend. It starts the API (tracker_db_test) and Vite (local mode) on free
// ports, drives the real UI:
//   sign up → add a transaction through the real UI form → dashboard renders →
//   reload → the transaction is still there → toggling Pro (dev toggle) opens
//   the Net Worth form and the phase-1 assets write shows a toast
//   (never an ErrorBoundary / console error) → the smoke user is deleted →
//   both servers are stopped.
// Asserts: zero console errors, zero requests to supabase.co.
import { chromium } from 'playwright';
import { Pool } from 'pg';
import { existsSync, readFileSync } from 'node:fs';
import { spawn, execFileSync } from 'node:child_process';
import { createServer } from 'node:net';
import { join } from 'node:path';
import assert from 'node:assert/strict';

function loadDotenv() {
  const env = {};
  if (!existsSync('.env')) return env; // CI supplies the variables directly
  for (const line of readFileSync('.env', 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)=(.*)\s*$/);
    if (m) env[m[1]] = m[2];
  }
  return env;
}

const fileEnv = loadDotenv();
const env = { ...fileEnv, ...process.env };
const dbName = env.TEST_PGDATABASE ?? 'tracker_db_test';
const email = `smoke-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;
const password = 'smoke-pass-1234';

if (!dbName.endsWith('_test')) {
  console.error(`[smoke:local] refusing to use database "${dbName}" — it must end with "_test"`);
  process.exit(1);
}
for (const key of ['PGHOST', 'PGPORT', 'PGUSER', 'PGPASSWORD']) {
  if (!env[key]) {
    console.error(`[smoke:local] missing required environment variable ${key}`);
    process.exit(1);
  }
}
if (!env.JWT_SECRET || env.JWT_SECRET.length < 32) {
  console.error('[smoke:local] JWT_SECRET must be set in the environment and be at least 32 characters long');
  process.exit(1);
}

const children = [];
let browser;
let page;
let pool;

function freePort() {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.unref();
    srv.on('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}

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

function stopChildren() {
  for (const child of children) killTree(child);
}

async function waitForOk(url, timeoutMs = 60000) {
  const deadline = Date.now() + timeoutMs;
  let lastError = 'no response';
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
      lastError = `HTTP ${res.status}`;
    } catch (err) {
      lastError = err.message;
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`timed out waiting for ${url} (${lastError})`);
}

let apiPort = await freePort();
let vitePort = await freePort();
while (vitePort === apiPort) vitePort = await freePort();

try {
  const api = spawn(process.execPath, ['server/index.js'], {
    env: {
      ...env,
      PGDATABASE: dbName,
      PORT: String(apiPort),
      NODE_ENV: 'development',
      ENABLE_DEV_PRO_TOGGLE: 'true',
    },
    stdio: 'inherit',
  });
  children.push(api);
  await waitForOk(`http://127.0.0.1:${apiPort}/api/health`);

  const vite = spawn(
    process.execPath,
    [join('node_modules', 'vite', 'bin', 'vite.js'), '--host', '127.0.0.1', '--port', String(vitePort), '--strictPort'],
    {
      env: {
        ...env,
        VITE_DATA_BACKEND: 'local',
        VITE_API_PROXY_TARGET: `http://127.0.0.1:${apiPort}`,
      },
      stdio: 'inherit',
    }
  );
  children.push(vite);
  await waitForOk(`http://127.0.0.1:${vitePort}/`);
  const BASE = `http://127.0.0.1:${vitePort}`;

  pool = new Pool({
    host: env.PGHOST,
    port: Number(env.PGPORT),
    database: dbName,
    user: env.PGUSER,
    password: env.PGPASSWORD,
  });

  browser = await chromium.launch();
  page = await browser.newPage();

  const consoleErrors = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', (err) => consoleErrors.push(String(err)));

  const supabaseRequests = [];
  page.on('request', (req) => {
    if (req.url().includes('supabase.co')) supabaseRequests.push(req.url());
  });

  try {
    // ---- sign up ----
    await page.goto(BASE + '/', { waitUntil: 'load' });
    await page.waitForTimeout(600);
    await page.click('button:has-text("Sign up")');
    await page.fill('input[id="auth-email"]', email);
    await page.fill('input[id="auth-password"]', password);
    await page.click('button[type="submit"]');

    // ---- dashboard renders ----
    await page.waitForFunction(() => document.body.innerText.includes('Total Balance'), { timeout: 15000 });
    await page.waitForTimeout(500);
    const afterSignUp = {
      url: page.url(),
      hasTotalBalance: await page.locator('body').innerText().then((t) => t.includes('Total Balance')),
    };

    // ---- add a transaction through the real UI form (TopBar → Add Transaction → modal) ----
    await page.click('button:has-text("Add Transaction")');
    await page.fill('#tx-desc', 'Smoke Transaction');
    await page.fill('#tx-amount', '42.5');
    await page.click('form[aria-label="Add transaction form"] button[type="submit"]');
    await page.waitForFunction(() => document.body.innerText.includes('Smoke Transaction'), { timeout: 10000 });

    // ---- reload → still there ----
    await page.reload({ waitUntil: 'load' });
    await page.waitForTimeout(600);
    await page.waitForFunction(() => document.body.innerText.includes('Smoke Transaction'), { timeout: 15000 });
    const smokeTxVisibleAfterReload = true;

    // ---- assets are phase 1: Net Worth form write → toast (not ErrorBoundary / console error) ----
    const toggleStatus = await page.evaluate(async () => {
      const res = await fetch('/api/profile/is_pro', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: true }),
        credentials: 'include',
      });
      return res.status;
    });
    assert.equal(toggleStatus, 200, 'dev Pro toggle must return 200');
    await page.goto(BASE + '/networth', { waitUntil: 'load' });
    await page.waitForTimeout(600);
    await page.click('button:has-text("Manage")');
    await page.fill('input[placeholder="e.g. Savings account"]', 'Smoke Asset');
    await page.fill('input[placeholder="Value"]', '10');
    await page.click('form button[type="submit"]');
    const TOAST_TEXT = 'Assets are not available in local mode yet (phase 2).';
    await page.waitForFunction((text) => document.body.innerText.includes(text), TOAST_TEXT, { timeout: 10000 });
    const toastText = await page.locator('[role="status"]').innerText();
    assert.match(toastText, /Assets are not available in local mode yet \(phase 2\)\./);
    const bodyText = await page.locator('body').innerText();
    assert.ok(!bodyText.includes('Something went wrong'), 'ErrorBoundary rendered instead of a toast');
    const networthStillRenders = bodyText.includes('Net Worth');

    assert.equal(consoleErrors.length, 0, `console errors: ${consoleErrors.join(' | ')}`);
    assert.equal(supabaseRequests.length, 0, `supabase requests: ${supabaseRequests.join(' | ')}`);

    console.log(
      JSON.stringify(
        {
          email,
          database: dbName,
          apiPort,
          vitePort,
          afterSignUp,
          smokeTxVisibleAfterReload,
          networthStillRenders,
          toastText,
          consoleErrors,
          zeroConsoleErrors: consoleErrors.length === 0,
          supabaseRequests,
          zeroSupabaseRequests: supabaseRequests.length === 0,
        },
        null,
        2
      )
    );
  } catch (err) {
    console.error('[smoke:local] FAILED:', err.message);
    console.error('url:', page.url());
    console.error('consoleErrors:', JSON.stringify(consoleErrors));
    console.error('body:', (await page.locator('body').innerText().catch(() => '')).slice(0, 1500));
    throw err;
  }
} finally {
  try {
    if (pool) {
      // Delete the smoke user (FKs cascade to profiles/transactions/budgets).
      const { rows } = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
      if (rows[0]) await pool.query('DELETE FROM users WHERE id = $1', [rows[0].id]);
    }
  } finally {
    if (pool) await pool.end();
    if (browser) await browser.close();
    stopChildren();
  }
}
