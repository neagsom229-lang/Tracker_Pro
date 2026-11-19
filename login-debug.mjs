import { chromium } from 'playwright';

const browser = await chromium.launch();
const email = `dbg-${Date.now()}@gmail.com`;
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
page.on('console', (m) => console.log('[console]', m.type(), m.text().slice(0, 300)));
page.on('pageerror', (e) => console.log('[pageerror]', String(e).slice(0, 300)));
page.on('requestfailed', (r) => console.log('[requestfailed]', r.url(), r.failure()?.errorText));
page.on('response', async (r) => {
  const u = r.url();
  if (u.includes('auth/v1') || u.includes('signup') || u.includes('token') || u.includes('/userinfo')) {
    try { console.log('[resp]', r.status(), u, (await r.text()).slice(0, 300)); } catch {}
  }
});

await page.goto('http://localhost:4173', { waitUntil: 'domcontentloaded' });
console.log('auth email input visible:', await page.locator('input#auth-email').count());
await page.fill('input#auth-email', email);
await page.fill('input#auth-password', 'password123!');
console.log('submit buttons:', await page.locator('button[type="submit"]').count());
const signUpLink = page.getByRole('button', { name: 'Sign up' });
console.log('signup link count:', await signUpLink.count());
if (await signUpLink.count()) {
  await signUpLink.click();
  await page.waitForTimeout(300);
  await page.fill('input#auth-password', 'password123!'); // switchMode('signup') clears it
}
await page.click('button[type="submit"]');
await page.waitForTimeout(8000);
console.log('main visible:', await page.locator('main').count());
console.log('auth form still there:', await page.locator('input#auth-email').count());
console.log('body text:', (await page.evaluate(() => document.body.innerText)).slice(0, 300));
await page.screenshot({ path: 'D:/Temp/login-debug.png' });
await browser.close();
