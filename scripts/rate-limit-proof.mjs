// scripts/rate-limit-proof.mjs — proves the rate limiter (dev stack, :4000):
//   - 40 consecutive GET /api/auth/me → all 200, no 429s (the strict limiter
//     only covers login/register; the general limiter is 300/15min).
//   - 16 bad POST /api/auth/login → 429 on the 16th (strict login limiter is
//     15/15min; 401s consume the window since skipSuccessfulRequests only
//     skips 2xx).
const BASE = 'http://localhost:4000';

let allOk = true;
let meCount = 0;
let me429 = 0;
for (let i = 0; i < 40; i++) {
  const res = await fetch(`${BASE}/api/auth/me`);
  meCount += 1;
  if (res.status !== 200) {
    allOk = false;
    me429 += 1;
  }
}
console.log(`40 × GET /api/auth/me → statuses: 200×${meCount}, 429×${me429} (expect 200×40, 429×0)`);

const loginStatuses = [];
for (let i = 0; i < 16; i++) {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: `bad-${Date.now()}-${i}@example.com`, password: 'wrong' }),
  });
  loginStatuses.push(res.status);
}
const counts = {};
for (const s of loginStatuses) counts[s] = (counts[s] || 0) + 1;
console.log('16 × POST /api/auth/login (bad creds) →', JSON.stringify(counts), '(expect the 16th → 429)');
console.log('proof:', allOk && loginStatuses[15] === 429 ? 'PASS' : 'FAIL');
