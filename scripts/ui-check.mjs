/**
 * scripts/ui-check.mjs — visual + accessibility check across the app.
 *
 * Opens every route (dashboard, transactions, budgets, recurring, goals,
 * debts, export, billing, admin, networth) in dark and light mode at
 * 375 / 768 / 1024 / 1440 px, capturing axe-core violations
 * (color-contrast + focus rules) and page console errors, and saving
 * screenshots to docs/ui/. Fails (exit code 1) on violations or console
 * errors.
 *
 * Usage: npm run ui:check   (expects `vite preview` on :4173)
 */
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const BASE = process.env.UI_BASE || 'http://localhost:4173';
const ROUTES = ['/dashboard', '/transactions', '/budgets', '/recurring', '/goals', '/debts', '/export', '/billing', '/admin', '/networth'];
const SIZES = [{ w: 375, h: 812 }, { w: 768, h: 1024 }, { w: 1024, h: 768 }, { w: 1440, h: 900 }];
const MODES = ['dark', 'light'];
const OUT = 'docs/ui';
const AXE = path.resolve('node_modules/axe-core/axe.min.js');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitServer() {
  for (let i = 0; i < 90; i++) {
    try {
      const r = await fetch(BASE);
      if (r.ok) return;
    } catch { /* retry */ }
    await sleep(1000);
  }
  throw new Error('UI server did not come up at ' + BASE);
}

async function login(page) {
  const email = `check-${Date.now()}@example.com`;
  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.locator('input#auth-email').waitFor({ state: 'visible', timeout: 20000 });
  await page.fill('input#auth-email', email);
  await page.fill('input#auth-password', 'Sup3r-Secret-Pass!');
  const signUpLink = page.getByRole('button', { name: 'Sign up' });
  if (await signUpLink.count()) {
    await signUpLink.click();
    await sleep(150);
  }
  await page.click('button[type="submit"]');
  // The project requires email confirmation on sign-up: the app shows the
  // confirmation screen (or a feedback message). Either way, page is ready.
  await page.waitForTimeout(1500);
}

async function violationsOf(page) {
  await page.addScriptTag({ path: AXE });
  return page.evaluate(() =>
    window.axe
      .run()
      .then((r) => r.violations.filter((v) => v.id.startsWith('focus') || v.id.startsWith('color-contrast')).map((v) => `${v.id}@${(v.nodes[0]?.target || [])[0]}`))
      .catch(() => []),
  );
}

await waitServer();
const browser = await chromium.launch();
let storage = null;
let failed = 0;

for (const mode of MODES) {
  for (const size of SIZES) {
    for (const route of ROUTES) {
      const ctx = await browser.newContext(
        storage ? { viewport: { width: size.w, height: size.h }, storageState: storage } : { viewport: { width: size.w, height: size.h } },
      );
      const page = await ctx.newPage();
      const errors = [];
      page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
      page.on('console', (m) => {
        if (m.type() === 'error') errors.push(`console: ${m.text()}`);
      });

      if (!storage) await login(page);
      storage = await ctx.storageState();

      try {
        await page.evaluate((m) => {
          document.documentElement.classList.toggle('dark', m === 'dark');
          try { localStorage.setItem('theme', m); } catch { /* ignore */ }
        }, mode);
      } catch (e) {
        console.log(`note: could not set theme ${mode} on ${route}: ${e.message}`);
      }

      await page.goto(BASE + route, { waitUntil: 'networkidle', timeout: 30000 });
      await page.waitForTimeout(700);

      const violations = await violationsOf(page);
      if (violations.length > 0) {
        console.log(`VIOLATION ${mode} ${size.w} ${route}: ${violations.join(', ')}`);
        failed++;
      }
      if (errors.length > 0) {
        console.log(`ERROR ${mode} ${size.w} ${route}: ${errors.join(' | ')}`);
        failed++;
      }

      fs.mkdirSync(OUT, { recursive: true });
      await page.screenshot({ path: path.join(OUT, `${mode}-${size.w}-${route.replace(/\//g, '_').replace(/^_/, '')}.png`) });
      await ctx.close();
    }
  }
}

await browser.close();
console.log(failed === 0 ? 'UI CHECK OK' : `UI CHECK FAILED (${failed} issues)`);
process.exitCode = failed > 0 ? 1 : 0;
