#!/usr/bin/env node
import pg from 'pg';

const conn = process.env.SUPABASE_DB_URL || process.env.DATABASE_URL || 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
const pool = new pg.Pool({ connectionString: conn });

async function q(sql, params = []) { return (await pool.query(sql, params)).rows; }
async function exec(sql, params = []) { await pool.query(sql, params); }

async function as(sqlUser, fn) {
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    await c.query(`SET LOCAL ROLE ${sqlUser}`);
    const res = await fn(c);
    await c.query('ROLLBACK');
    return res;
  } catch (e) {
    await c.query('ROLLBACK').catch(() => {});
    throw e;
  } finally { c.release(); }
}

async function main() {
  // Seed two users
  const [u1, u2] = ['00000000-0000-0000-0000-00000000aa01', '00000000-0000-0000-0000-00000000aa02'];
  await exec(`INSERT INTO auth.users (id, email) VALUES ($1,'a@test.local'),($2,'b@test.local') ON CONFLICT (id) DO NOTHING`, [u1, u2]);
  await exec(`INSERT INTO public.profiles (id) VALUES ($1),($2) ON CONFLICT (id) DO NOTHING`, [u1, u2]);

  // RLS isolation / no self-admin: user1 cannot set is_admin
  await as('authenticated', async (c) => {
    await c.query(`SELECT set_config('request.jwt.claim.sub',$1,true), set_config('request.jwt.claim.role','authenticated',true)`, [u1]);
    await c.query(`UPDATE public.profiles SET is_admin=true WHERE id=$1`, [u1]);
  });
  const p1 = await q(`SELECT is_admin FROM public.profiles WHERE id=$1`, [u1]);
  if (p1[0].is_admin !== false) throw new Error('self-admin guard failed');

  // Seed a pending manual payment as postgres (trusted SQL editor)
  await exec(`DELETE FROM public.manual_payments WHERE user_id IN ($1,$2)`, [u1, u2]);
  const ins = await q(`INSERT INTO public.manual_payments (user_id, amount, currency, status) VALUES ($1,4.99,'USD','pending') RETURNING id`, [u1]);
  const pid = ins[0].id;

  // no self-approve
  await as('authenticated', async (c) => {
    await c.query(`SELECT set_config('request.jwt.claim.sub',$1,true), set_config('request.jwt.claim.role','authenticated',true)`, [u1]);
    await c.query(`UPDATE public.manual_payments SET status='approved' WHERE id=$1`, [pid]);
  });
  let row = (await q(`SELECT status, amount FROM public.manual_payments WHERE id=$1`, [pid]))[0];
  if (row.status !== 'pending') throw new Error(`self-approve failed: ${row.status}`);

  // no amount tamper
  await as('authenticated', async (c) => {
    await c.query(`SELECT set_config('request.jwt.claim.sub',$1,true), set_config('request.jwt.claim.role','authenticated',true)`, [u1]);
    await c.query(`UPDATE public.manual_payments SET amount=0.01, currency='KHR' WHERE id=$1`, [pid]);
  });
  row = (await q(`SELECT status, amount, currency FROM public.manual_payments WHERE id=$1`, [pid]))[0];
  if (Number(row.amount) !== 4.99 || row.currency !== 'USD') throw new Error('amount/currency tamper failed');

  // service_role / trusted admin can approve
  await exec(`UPDATE public.manual_payments SET status='approved', reviewed_at=now() WHERE id=$1`, [pid]);
  row = (await q(`SELECT status FROM public.manual_payments WHERE id=$1`, [pid]))[0];
  if (row.status !== 'approved') throw new Error('trusted/service approve failed');

  console.log('supabase migration assertions OK');
  await pool.end();
}

main().catch(async (e) => { console.error(e); await pool.end(); process.exit(1); });
