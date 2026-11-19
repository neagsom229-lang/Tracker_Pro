/**
 * scripts/keyboard-check.mjs — keyboard-only run on the auth screen.
 *
 * The app requires email confirmation on sign-up in this environment,
 * so there is no signed-in page to tab through here — this checks
 * keyboard accessibility of the auth UI: tab order, visible focus ring.
 *
 * Usage: npm run keyboard:check   (expects `vite preview` on :4173)
 */
import { chromium } from 'playwright';

const BASE = 'http://localhost:4173';
const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));

await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 30000 });
await page.locator('input#auth-email').waitFor({ state: 'visible', timeout: 15000 });

let failures = 0;
const expect = (cond, label) => {
  console.log(`${cond ? 'ok  ' : 'FAIL'} ${label}`);
  if (!cond) failures++;
};

// Tab through the auth form; focus must land on focusable elements.
const seen = [];
for (let i = 0; i < 6; i++) {
  await page.keyboard.press('Tab');
  seen.push(
    await page.evaluate(() => {
      const el = document.activeElement;
      return el ? `${el.tagName}${el.id ? '#' + el.id : ''}` : 'none';
    }),
  );
}
console.log('Tab targets:', seen.join(' -> '));
expect(seen.every((s) => s !== 'none' && s !== 'BODY'), 'Tab moves focus to focusable elements');

const focusRingOk = await page.evaluate(() => {
  const el = document.activeElement;
  if (!el || el === document.body) return false;
  const cs = getComputedStyle(el);
  return cs.outlineWidth !== '0px' && cs.outlineStyle !== 'none' && cs.outlineColor !== 'rgba(0, 0, 0, 0)';
});
expect(focusRingOk, 'focused element shows a visible focus ring');

expect(errors.length === 0, `no console errors (found: ${errors.join(' | ') || 'none'})`);
await browser.close();
process.exitCode = failures > 0 ? 1 : 0;
