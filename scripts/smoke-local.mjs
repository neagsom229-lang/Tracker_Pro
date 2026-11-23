// scripts/smoke-local.mjs — headless smoke test of the LOCAL backend:
//   sign up → add a transaction through the real UI form → dashboard renders →
//   reload → the transaction is still there → toggling Pro (dev toggle) opens
//   the Net Worth form and the phase-1 assets write shows a toast
//   (never an ErrorBoundary / console error) → the smoke user is deleted.
// Asserts: zero console errors, zero requests to supabase.co.
import { chromium } from 'playwright';
import { Pool } from 'pg';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const BASE = process.env.SMOKE_URL || 'http://localhost:5173';
const email = `smoke-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;
const password = 'smoke-pass-1234';

// Credentials only from .env (local DB for the cleanup query).
function parseDotenv(text) {
  const out = {};
  for (const line of text.split('\n')) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)=(.*)\s*$/);
    if (m) out[m[1]] = m[2];
  }
  return out;
}
const env = parseDotenv(readFileSync('.env', 'utf8'));
const dbName = process.env.SMOKE_PGDATABASE ?? process.env.PGDATABASE ?? env.PGDATABASE;
if (!dbName?.endsWith('_test') && process.env.ALLOW_DEV_DB !== '1') {
  console.error(`[smoke:local] refusing to use database "${dbName}" — set ALLOW_DEV_DB=1 to allow a dev database.`);
  process.exit(1);
}
const pool = new Pool({
  host: env.PGHOST,
  port: Number(env.PGPORT),
  database: dbName,
  user: env.PGUSER,
  password: env.PGPASSWORD,
});

const browser = await chromium.launch();
const page = await browser.newPage();

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
} finally {
  try {
    // Delete the smoke user afterwards (FKs cascade to profiles/transactions/budgets).
    const { rows } = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
    if (rows[0]) await pool.query('DELETE FROM users WHERE id = $1', [rows[0].id]);
  } finally {
    await pool.end();
    await browser.close();
  }
}
