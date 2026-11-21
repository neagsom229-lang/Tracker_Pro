// server/dbg10.js — date-shape + profile-whitelist verification (dev tracker_db).
import pool from './db.js';

const out = {};

const { rows: txs } = await pool.query('select id, description, amount, category, date, created_at from transactions order by id');
out.transactions = txs.map((r) => ({
  id: r.id,
  description: r.description,
  amount: r.amount,
  typeofAmount: typeof r.amount,
  category: r.category,
  date: r.date,
  typeofDate: typeof r.date,
  createdAt: r.created_at,
  typeofCreatedAt: typeof r.created_at,
}));

const { rows: raw } = await pool.query("select '2026-01-15'::date as d");
out.rawDateSelect = raw;

// Profile whitelist: is_pro/is_admin live on `users`; the PUT route only
// writes `profiles.display_name` / `profiles.currency`. Show both tables
// after the bypass attempt.
const { rows: aliceUser } = await pool.query(
  "select u.is_pro, u.is_admin, p.display_name, p.currency from users u left join profiles p on p.id = u.id where u.id = '864cd4a0-e391-4cd2-a0bd-a3b9b7f27aac'"
);
out.aliceAfterBypassPUT = aliceUser;

const { rows: profiles } = await pool.query('select id, display_name, currency from profiles');
out.profiles = profiles;

await pool.end();
console.log(JSON.stringify(out, null, 2));
