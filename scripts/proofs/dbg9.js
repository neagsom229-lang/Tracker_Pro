// scripts/proofs/dbg9.js — user-isolation probe (dev tracker_db):
// user B (alice) must not be able to read/PUT/DELETE user A (bob)'s rows.
import './dev-db-guard.mjs';
import fs from 'node:fs';
import pool from '../../server/db.js';

function readCookie(path) {
  for (const line of fs.readFileSync(path, 'utf8').split('\n')) {
    const t = line.split('\t');
    if (t.length === 7 && t[5] === 'tracker_session') return t[6];
  }
  throw new Error('cookie not found in ' + path);
}

const TEMP = process.env.TEMP ?? 'C:\\Users\\chhea\\AppData\\Local\\Temp';
const cookieAlice = readCookie(`${TEMP}\\jarA.txt`);
const cookieBob = readCookie(`${TEMP}\\jarB.txt`);
const BOB_TX = '824ecf63-6172-4cb6-9bcd-fe4a82a914de'; // bob's transaction (created in 3B)

const hA = { Cookie: `tracker_session=${cookieAlice}` };
const hB = { Cookie: `tracker_session=${cookieBob}` };

const putBobTxAsAlice = await fetch(`http://localhost:4000/api/transactions/${BOB_TX}`, {
  method: 'PUT',
  headers: { 'Content-Type': 'application/json', ...hA },
  body: JSON.stringify({ amount: 99 }),
}).then(async (r) => ({ status: r.status, body: await r.text() }));

const delBobTxAsAlice = await fetch(`http://localhost:4000/api/transactions/${BOB_TX}`, {
  method: 'DELETE',
  headers: hA,
}).then(async (r) => ({ status: r.status, body: await r.text() }));

const listAsAlice = await fetch('http://localhost:4000/api/transactions', { headers: hA }).then(async (r) => ({ status: r.status, body: await r.text() }));
const listAsBob = await fetch('http://localhost:4000/api/transactions', { headers: hB }).then(async (r) => ({ status: r.status, body: await r.text() }));

// bob creates a budget (his own)
const createBobsBudget = await fetch('http://localhost:4000/api/budgets', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', ...hB },
  body: JSON.stringify({ category: 'salary', monthly_limit: 1000 }),
}).then(async (r) => ({ status: r.status, body: await r.text() }));

// alice deletes bob's budget
const delBobsBudgetAsAlice = await fetch('http://localhost:4000/api/budgets/salary', {
  method: 'DELETE',
  headers: hA,
}).then(async (r) => ({ status: r.status, body: await r.text() }));

const { rows: budgets } = await pool.query('select category, user_id from budgets order by category');
await pool.end();

console.log(JSON.stringify({ putBobTxAsAlice, delBobTxAsAlice, listAsAlice, listAsBob, createBobsBudget, delBobsBudgetAsAlice, budgetsInDB: budgets }, null, 2));
