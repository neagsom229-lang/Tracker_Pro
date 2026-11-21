import { chromium } from 'playwright';

const BASE = 'http://localhost:5173';
const email = `smoke-${Date.now()}@example.com`;
const password = 'smoke-pass-1234';

const browser = await chromium.launch();
const page = await browser.newPage();
const consoleErrors = [];
page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
page.on('pageerror', (e) => consoleErrors.push('pageerror: ' + String(e)));

try {
  await page.goto(BASE + '/', { waitUntil: 'load', timeout: 30000 });
  await page.waitForTimeout(600);
  await page.click('button:has-text("Sign up")');
  await page.waitForTimeout(300);
  await page.fill('input[id="auth-email"]', email);
  await page.fill('input[id="auth-password"]', password);
  await page.click('button[type="submit"]');
  try { await page.waitForFunction(() => document.body.innerText.includes('Total Balance'), { timeout: 15000 }); } catch (e) { console.log('no dashboard:', e.message); }
  console.log('hasTotalBalance:', (await page.locator('body').innerText()).includes('Total Balance'));

  // Add via the real UI form
  await page.click('button:has-text("Add Transaction")');
  await page.waitForTimeout(400);
  const formExists = await page.locator('form[aria-label="Add transaction form"]').count();
  console.log('modal form count:', formExists);
  await page.fill('#tx-desc', 'Smoke Transaction');
  await page.fill('#tx-amount', '42.5');
  await page.click('form[aria-label="Add transaction form"] button[type="submit"]');
  await page.waitForTimeout(2500);
  const body1 = await page.locator('body').innerText();
  console.log('hasSmokeTx (after submit):', body1.includes('Smoke Transaction'));
  console.log('body(0..500):', JSON.stringify(body1.slice(0, 500)));
  await page.reload({ waitUntil: 'load', timeout: 30000 });
  await page.waitForTimeout(1200);
  const body2 = await page.locator('body').innerText();
  console.log('hasSmokeTx (after reload):', body2.includes('Smoke Transaction'));
  console.log('body2(0..300):', JSON.stringify(body2.slice(0, 300)));
  console.log('consoleErrors:', JSON.stringify(consoleErrors.slice(0, 10)));
} finally {
  await browser.close();
}
