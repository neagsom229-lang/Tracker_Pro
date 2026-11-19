/**
 * scripts/theme-check.mjs — verifies theme persistence + prefers-color-scheme.
 *
 * 1. localStorage 'theme' = 'light' applies to the page and survives reloads.
 * 2. A fresh context with prefers-color-scheme: light picks light on first visit.
 * 3. A fresh context with prefers-color-scheme: dark picks dark on first visit.
 *
 * Usage: npm run theme:check   (expects `vite preview` on :4173)
 */
import { chromium } from 'playwright';

const BASE = 'http://localhost:4173';
const browser = await chromium.launch();

let failures = 0;
const expect = (cond, label) => {
  console.log(`${cond ? 'ok  ' : 'FAIL'} ${label}`);
  if (!cond) failures++;
};

// Bypass the app's service worker: it caches the built shell and would
// otherwise serve the previous build.
const bypassSW = async (page) => {
  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.evaluate(async () => {
    const regs = (await navigator.serviceWorker?.getRegistrations?.()) ?? [];
    await Promise.all(regs.map((r) => r.unregister().catch(() => {})));
    const keys = (await caches?.keys?.()) ?? [];
    await Promise.all(keys.map((k) => caches.delete(k).catch(() => {})));
  });
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(800);
};

// 1. Persisted light preference + reload keeps it
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  await ctx.addInitScript(() => localStorage.setItem('theme', 'light'));
  const page = await ctx.newPage();
  await bypassSW(page);
  expect(await page.evaluate(() => document.documentElement.classList.contains('light')), 'persisted localStorage theme=light applies');
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(500);
  expect(await page.evaluate(() => document.documentElement.classList.contains('light')), 'theme persists across reload');
  await ctx.close();
}

// 2. prefers-color-scheme: light on first visit
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, colorScheme: 'light' });
  const page = await ctx.newPage();
  await bypassSW(page);
  expect(await page.evaluate(() => document.documentElement.classList.contains('light')), 'prefers-color-scheme: light picked on first visit');
  expect((await page.evaluate(() => localStorage.getItem('theme'))) === 'light', 'first-visit theme is stored');
  await ctx.close();
}

// 3. prefers-color-scheme: dark on first visit
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, colorScheme: 'dark' });
  const page = await ctx.newPage();
  await bypassSW(page);
  expect(await page.evaluate(() => document.documentElement.classList.contains('dark')), 'prefers-color-scheme: dark picked when no stored theme');
  await ctx.close();
}

await browser.close();
process.exitCode = failures > 0 ? 1 : 0;
