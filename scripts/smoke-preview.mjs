// scripts/smoke-preview.mjs — smoke test against the PRODUCTION dist bundle.
// Serves dist/ via `vite preview` (no local backend; supabase build) and checks:
//   - / loads and renders app shell (no fatal crash)
//   - deep link /dashboard loads (SPA rewrite)
//   - /manifest.json, /icons/icon.svg, /service-worker.js return 200 with expected content types
//   - no uncaught page errors
import { chromium } from 'playwright';
import { existsSync } from 'node:fs';
import { spawn, execFileSync } from 'node:child_process';
import { createServer } from 'node:net';
import { join } from 'node:path';
import assert from 'node:assert/strict';

if (!existsSync(join('dist', 'index.html'))) {
  console.error('[smoke:preview] dist/index.html missing — run npm run build first');
  process.exit(1);
}

function freePort() {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.unref();
    srv.on('error', reject);
    srv.listen(0, '127.0.0.1', () => { const { port } = srv.address(); srv.close(() => resolve(port)); });
  });
}
function killTree(child) {
  if (!child || child.exitCode !== null) return;
  if (process.platform === 'win32') {
    try { execFileSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' }); } catch { /* already gone */ }
  } else {
    try { child.kill('SIGTERM'); } catch { /* already gone */ }
  }
}

async function waitForOk(url, timeoutMs = 60000) {
  const deadline = Date.now() + timeoutMs;
  let lastError = 'no response';
  while (Date.now() < deadline) {
    try { const res = await fetch(url); if (res.ok) return; lastError = `HTTP ${res.status}`; }
    catch (err) { lastError = err.message; }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`timed out waiting for ${url} (${lastError})`);
}

const port = await freePort();
const BASE = `http://127.0.0.1:${port}`;
let preview;
let browser;
try {
  preview = spawn(process.execPath, [join('node_modules', 'vite', 'bin', 'vite.js'), 'preview', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], { stdio: 'inherit' });
  await waitForOk(BASE + '/');

  const checks = {};
  for (const [name, path, typePart] of [
    ['manifest', '/manifest.json', 'json'],
    ['icon', '/icons/icon.svg', 'svg'],
    ['service-worker', '/service-worker.js', 'javascript'],
  ]) {
    const res = await fetch(BASE + path);
    const ct = (res.headers.get('content-type') || '').toLowerCase();
    checks[name] = { status: res.status, contentType: ct };
    assert.equal(res.status, 200, `${path} should return 200`);
    assert.ok(ct.includes(typePart), `${path} content-type should include ${typePart}, got ${ct}`);
  }

  browser = await chromium.launch();
  const page = await browser.newPage();
  const pageErrors = [];
  const consoleErrors = [];
  page.on('pageerror', (err) => pageErrors.push(String(err)));
  page.on('console', (msg) => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });

  await page.goto(BASE + '/', { waitUntil: 'load', timeout: 30000 });
  await page.waitForFunction(() => {
    const t = document.body.innerText || '';
    return /sign in|create account|welcome back|obsidian|email|password/i.test(t);
  }, { timeout: 15000 });
  const homeText = await page.locator('body').innerText();
  assert.ok(homeText.length > 20, 'home page should render visible content');

  await page.goto(BASE + '/dashboard', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(1500);
  const dashboardUrl = page.url();
  const dashboardText = await page.locator('body').innerText();
  assert.ok(dashboardUrl.includes('/dashboard') || dashboardUrl.endsWith('/') || dashboardUrl.includes('/login'), 'deep link should load without server 404');
  assert.ok(dashboardText.length > 20, 'dashboard/deep link should render visible content');

  const allErrors = [...pageErrors, ...consoleErrors];
  console.log(JSON.stringify({ ok: true, base: BASE, checks, dashboardUrl, pageErrors, consoleErrors, zeroConsoleErrors: allErrors.length === 0 }, null, 2));
  assert.equal(allErrors.length, 0, `console/page errors: ${allErrors.join(' | ')}`);
} finally {
  if (browser) await browser.close();
  killTree(preview);
}
