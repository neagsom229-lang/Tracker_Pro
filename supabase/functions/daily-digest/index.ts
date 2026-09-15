// supabase/functions/daily-digest/index.ts
//
// Deploy with: supabase functions deploy daily-digest --no-verify-jwt
// Schedule it with the pg_cron block in 005_schedule_digest.sql.
//
// WHY --no-verify-jwt HERE (AND WHY THAT ISN'T A HOLE)
// ----------------------------------------------------
// pg_cron calls this over HTTP with no user session, so there's no JWT
// to verify. The gate is a shared secret instead: the caller must send
// `x-digest-secret` matching the DIGEST_SECRET env var. Without that
// check, --no-verify-jwt would make this a public endpoint anyone could
// hammer to generate notification spam.
//
// WHAT IT DOES
// ------------
// Walks every user who has something worth alerting on and writes rows
// into `notifications`. Three checks, all read-only against user data:
//   1. Budgets exceeded this month (ratio > 1)
//   2. Recurring rules due within the next 3 days
//   3. Savings goals that have been reached
//
// IDEMPOTENCE
// -----------
// A daily job that re-announces "Food budget exceeded" every morning for
// the rest of the month is a notification system users mute. Every row
// carries a `dedupe_key` scoped to the logical event plus its natural
// period, and a partial unique index on (user_id, dedupe_key) makes a
// repeat insert a no-op. That also means the job is safe to re-run by
// hand, retry on failure, or accidentally schedule twice.

import { serve } from 'https://deno.land/std@0.203.0/http/server.ts';
import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-digest-secret',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

type Notification = {
  user_id: string;
  title: string;
  message: string;
  type: 'budget' | 'recurring' | 'goal' | 'debt' | 'system';
  dedupe_key: string;
};

const TRANSFER_CATEGORIES = ['savings', 'debt'];

const CATEGORY_LABELS: Record<string, string> = {
  salary: 'Salary', freelance: 'Freelance', investment: 'Investment',
  food: 'Food', rent: 'Rent', transport: 'Transport', entertainment: 'Entertainment',
  shopping: 'Shopping', utilities: 'Utilities', health: 'Health',
  savings: 'Savings', debt: 'Debt Payment', other: 'Other',
};

const money = (n: number) => `$${Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// ---------------------------------------------------------------------
// 1. Budgets exceeded this month.
//
// Deliberately scoped to the current month and keyed by month, so a user
// who blows their food budget on the 3rd is told once, not 28 times.
// ---------------------------------------------------------------------
async function checkBudgets(admin: SupabaseClient, monthStart: string, monthKey: string): Promise<Notification[]> {
  const { data: budgets, error } = await admin.from('budgets').select('user_id, category, monthly_limit');
  if (error) throw new Error(`budgets: ${error.message}`);
  if (!budgets?.length) return [];

  const userIds = [...new Set(budgets.map((b) => b.user_id))];

  const { data: spend, error: spendError } = await admin
    .from('transactions')
    .select('user_id, category, amount')
    .in('user_id', userIds)
    .gte('date', monthStart)
    .lt('amount', 0);
  if (spendError) throw new Error(`transactions: ${spendError.message}`);

  // Sum in memory rather than one aggregate query per budget. At launch
  // scale this is a few thousand rows; if it ever isn't, this is the
  // spot to move to a Postgres view.
  const totals = new Map<string, number>();
  for (const row of spend ?? []) {
    if (TRANSFER_CATEGORIES.includes(row.category)) continue;
    const key = `${row.user_id}:${row.category}`;
    totals.set(key, (totals.get(key) ?? 0) + Math.abs(Number(row.amount)));
  }

  const out: Notification[] = [];
  for (const budget of budgets) {
    const spent = totals.get(`${budget.user_id}:${budget.category}`) ?? 0;
    const limit = Number(budget.monthly_limit);
    if (limit <= 0 || spent <= limit) continue;

    const label = CATEGORY_LABELS[budget.category] ?? budget.category;
    out.push({
      user_id: budget.user_id,
      title: `${label} budget exceeded`,
      message: `You've spent ${money(spent)} of your ${money(limit)} ${label.toLowerCase()} budget this month.`,
      type: 'budget',
      dedupe_key: `budget:${budget.category}:${monthKey}`,
    });
  }
  return out;
}

// ---------------------------------------------------------------------
// 2. Recurring transactions due in the next 3 days.
//
// Keyed by the run date, so a rule due Friday generates one notification
// the first time it enters the window, not one per day for three days.
// ---------------------------------------------------------------------
async function checkRecurring(admin: SupabaseClient, today: string, horizon: string): Promise<Notification[]> {
  const { data, error } = await admin
    .from('recurring_rules')
    .select('user_id, description, amount, next_run_date')
    .gte('next_run_date', today)
    .lte('next_run_date', horizon);
  if (error) throw new Error(`recurring_rules: ${error.message}`);

  return (data ?? []).map((rule) => {
    const amount = Number(rule.amount);
    const isIncome = amount > 0;
    const days = Math.round(
      (new Date(`${rule.next_run_date}T00:00:00Z`).getTime() - new Date(`${today}T00:00:00Z`).getTime()) / 86_400_000
    );
    const when = days === 0 ? 'today' : days === 1 ? 'tomorrow' : `in ${days} days`;

    return {
      user_id: rule.user_id,
      title: isIncome ? `${rule.description} arrives ${when}` : `${rule.description} due ${when}`,
      message: `${isIncome ? 'Expected' : 'Scheduled'} ${money(amount)} on ${rule.next_run_date}.`,
      type: 'recurring' as const,
      dedupe_key: `recurring:${rule.description}:${rule.next_run_date}`,
    };
  });
}

// ---------------------------------------------------------------------
// 3. Savings goals reached.
//
// Keyed by goal id alone, with no date component: hitting a goal is a
// one-time event and should be announced exactly once, ever.
// ---------------------------------------------------------------------
async function checkGoals(admin: SupabaseClient): Promise<Notification[]> {
  const { data, error } = await admin.from('goals').select('id, user_id, name, target_amount, current_amount');
  if (error) throw new Error(`goals: ${error.message}`);

  return (data ?? [])
    .filter((g) => Number(g.current_amount) >= Number(g.target_amount))
    .map((g) => ({
      user_id: g.user_id,
      title: `"${g.name}" is fully funded`,
      message: `You've saved ${money(Number(g.current_amount))} toward your ${money(Number(g.target_amount))} target. Nice work.`,
      type: 'goal' as const,
      dedupe_key: `goal-reached:${g.id}`,
    }));
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const expectedSecret = Deno.env.get('DIGEST_SECRET');
  if (!expectedSecret) {
    console.error('DIGEST_SECRET is not set — refusing to run');
    return json({ error: 'Not configured' }, 500);
  }
  if (req.headers.get('x-digest-secret') !== expectedSecret) {
    return json({ error: 'Forbidden' }, 403);
  }

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const monthKey = today.slice(0, 7);
  const monthStart = `${monthKey}-01`;
  const horizon = new Date(now.getTime() + 3 * 86_400_000).toISOString().slice(0, 10);

  try {
    // Run the three checks concurrently — they read different tables and
    // none depends on another's output.
    const [budgetAlerts, recurringAlerts, goalAlerts] = await Promise.all([
      checkBudgets(admin, monthStart, monthKey),
      checkRecurring(admin, today, horizon),
      checkGoals(admin),
    ]);

    const rows = [...budgetAlerts, ...recurringAlerts, ...goalAlerts];
    if (rows.length === 0) return json({ inserted: 0, checked: today });

    // ignoreDuplicates leans on the partial unique index from migration
    // 004: rows that already exist are skipped silently instead of
    // failing the whole batch.
    const { data, error } = await admin
      .from('notifications')
      .upsert(rows, { onConflict: 'user_id,dedupe_key', ignoreDuplicates: true })
      .select('id');

    if (error) throw new Error(`insert: ${error.message}`);

    return json({ inserted: data?.length ?? 0, candidates: rows.length, checked: today });
  } catch (err) {
    console.error('daily-digest failed', err);
    return json({ error: err instanceof Error ? err.message : 'Digest failed' }, 500);
  }
});