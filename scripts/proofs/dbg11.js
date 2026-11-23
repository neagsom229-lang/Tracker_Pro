// scripts/proofs/dbg11.js — auth rate-limit probe: 20 rapid register attempts.
import './dev-db-guard.mjs';

const statuses = [];
for (let i = 0; i < 20; i++) {
  const res = await fetch('http://localhost:4000/api/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: `hammer${i}@example.com`, password: 'hammer-pass-12345', displayName: 'Hammer' }),
  });
  statuses.push({ i, status: res.status });
}
console.log(JSON.stringify({ statuses }, null, 2));
