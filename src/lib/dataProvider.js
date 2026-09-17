import { supabase } from './supabaseClient';

/**
 * dataProvider.js (Supabase edition)
 * -----------------------------------
 * Same shape as the LocalStorage version this replaces — every function
 * is async and returns plain JS data — so the store layer barely changed.
 * The difference is these functions now hit Postgres via Supabase, and
 * Row Level Security on the server guarantees a user can only ever
 * receive/affect their own rows (see supabase/migrations/001_init_schema.sql).
 *
 * Every function throws a normal Error on failure. The store is
 * responsible for catching these and turning them into toast messages —
 * this file stays "dumb" on purpose so it's easy to unit test or swap.
 */

function assertNoError(error, context) {
  if (error) {
    console.error(`[dataProvider] ${context}:`, error.message);
    throw new Error(error.message || `Something went wrong while ${context}.`);
  }
}

// Maps a DB row (snake_case) to the shape the rest of the app already
// uses (camelCase) so components didn't need to change.
const mapTransaction = (row) => ({
  id: row.id,
  description: row.description,
  amount: Number(row.amount),
  category: row.category,
  date: row.date,
  createdAt: row.created_at,
});

// Every `.select()` call below names exact columns instead of '*'.
// For the single-row insert/update calls this saves little (the
// response is one row either way), but it's the same pattern
// everywhere for consistency, and it's not just style: for
// `getTransactions` specifically — the one query that can return
// hundreds or thousands of rows as a user's history grows — trimming
// unused columns (there's currently only `user_id`, which RLS already
// scopes for us and the client never needs back) directly cuts the
// response payload and Postgres's work building it.
const TRANSACTION_COLUMNS = 'id, description, amount, category, date, created_at';

const PAGE_SIZE = 1000; // matches PostgREST's default max-rows cap

export const dataProvider = {
  // ---------------- Transactions ----------------
  async getTransactions(userId) {
    // A single unranged .select() is silently capped at PostgREST's
    // default max-rows (1000) — for a user with 1000+ transactions
    // (very plausible once bank sync is auto-importing), the query
    // would quietly return only a partial result. Since the query is
    // ordered newest-first, that partial result is missing the OLDEST
    // transactions — which means selectTotals() computes a total
    // balance that's simply wrong, with no error, no warning, nothing
    // to indicate data is missing. This loop fetches in pages of
    // PAGE_SIZE until a page comes back with fewer rows than requested
    // (the signal that we've reached the end), so the full history is
    // always returned regardless of how large it's grown.
    const all = [];
    let from = 0;
    while (true) {
      const { data, error } = await supabase
        .from('transactions')
        .select(TRANSACTION_COLUMNS)
        .eq('user_id', userId)
        .order('date', { ascending: false })
        .range(from, from + PAGE_SIZE - 1);
      assertNoError(error, 'loading transactions');
      all.push(...data);
      if (data.length < PAGE_SIZE) break;
      from += PAGE_SIZE;
    }
    return all.map(mapTransaction);
  },

  async addTransaction(userId, payload) {
    const { data, error } = await supabase
      .from('transactions')
      .insert({
        user_id: userId,
        description: payload.description,
        amount: payload.amount,
        category: payload.category,
        date: payload.date,
      })
      .select(TRANSACTION_COLUMNS)
      .single();
    assertNoError(error, 'adding the transaction');
    return mapTransaction(data);
  },

  async updateTransaction(id, changes) {
    const { data, error } = await supabase
      .from('transactions')
      .update({
        ...(changes.description !== undefined && { description: changes.description }),
        ...(changes.amount !== undefined && { amount: changes.amount }),
        ...(changes.category !== undefined && { category: changes.category }),
        ...(changes.date !== undefined && { date: changes.date }),
      })
      .eq('id', id)
      .select(TRANSACTION_COLUMNS)
      .single();
    assertNoError(error, 'updating the transaction');
    return mapTransaction(data);
  },

  async deleteTransaction(id) {
    const { error } = await supabase.from('transactions').delete().eq('id', id);
    assertNoError(error, 'deleting the transaction');
    return id;
  },

  // ---------------- Budgets ----------------
  async getBudgets(userId) {
    const { data, error } = await supabase.from('budgets').select('category, monthly_limit').eq('user_id', userId);
    assertNoError(error, 'loading budgets');
    return Object.fromEntries(data.map((b) => [b.category, Number(b.monthly_limit)]));
  },

  async setBudget(userId, category, limit) {
    const { error } = await supabase
      .from('budgets')
      .upsert({ user_id: userId, category, monthly_limit: limit }, { onConflict: 'user_id,category' });
    assertNoError(error, 'saving the budget');
  },

  async removeBudget(userId, category) {
    const { error } = await supabase.from('budgets').delete().eq('user_id', userId).eq('category', category);
    assertNoError(error, 'removing the budget');
  },

  // ---------------- Recurring rules ----------------
  async getRecurring(userId) {
    const { data, error } = await supabase
      .from('recurring_rules')
      .select('id, description, amount, category, frequency, next_run_date')
      .eq('user_id', userId)
      .order('created_at', { ascending: true });
    assertNoError(error, 'loading recurring rules');
    return data.map((r) => ({
      id: r.id,
      description: r.description,
      amount: Number(r.amount),
      category: r.category,
      frequency: r.frequency,
      nextRunDate: r.next_run_date,
    }));
  },

  async addRecurring(userId, payload) {
    const { data, error } = await supabase
      .from('recurring_rules')
      .insert({
        user_id: userId,
        description: payload.description,
        amount: payload.amount,
        category: payload.category,
        frequency: payload.frequency,
        next_run_date: payload.nextRunDate,
      })
      .select('id, description, amount, category, frequency, next_run_date')
      .single();
    assertNoError(error, 'adding the recurring rule');
    return {
      id: data.id,
      description: data.description,
      amount: Number(data.amount),
      category: data.category,
      frequency: data.frequency,
      nextRunDate: data.next_run_date,
    };
  },

  async updateRecurringNextRun(id, nextRunDate) {
    const { error } = await supabase.from('recurring_rules').update({ next_run_date: nextRunDate }).eq('id', id);
    assertNoError(error, 'updating the recurring rule');
  },

  async removeRecurring(id) {
    const { error } = await supabase.from('recurring_rules').delete().eq('id', id);
    assertNoError(error, 'removing the recurring rule');
  },

  // ---------------- Profile / settings ----------------
  // Billing fields (is_pro, stripe_customer_id, etc.) used to live here
  // but were moved to dedicated `subscriptions` / `stripe_customers`
  // tables in migration 002 — see useProStatus() for how Pro status is
  // read now. This function only returns account-level settings.
  async getProfile(userId) {
    const { data, error } = await supabase.from('profiles').select('id, email, display_name, currency, is_admin').eq('id', userId).single();
    assertNoError(error, 'loading your profile');
    return {
      id: data.id,
      email: data.email,
      displayName: data.display_name,
      currency: data.currency,
      isAdmin: data.is_admin,
    };
  },

  async setCurrency(userId, currency) {
    const { error } = await supabase.from('profiles').update({ currency }).eq('id', userId);
    assertNoError(error, 'saving your currency preference');
  },

  // ---------------- Bank connections ----------------
  // Deliberately does NOT select access_token_secret_id — the app never
  // needs it (only the sync-bank-transactions Edge Function, running as
  // service role, does), so there's no reason for it to ever leave the
  // database in a response to the browser.
  async getBankConnections(userId) {
    const { data, error } = await supabase
      .from('bank_connections')
      .select('id, institution_name, status, last_synced_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });
    assertNoError(error, 'loading connected banks');
    return data.map((c) => ({
      id: c.id,
      institutionName: c.institution_name,
      status: c.status,
      lastSyncedAt: c.last_synced_at,
    }));
  },

  // ---------------- Notifications ----------------
  async getNotifications(userId) {
    const { data, error } = await supabase
      .from('notifications')
      .select('id, title, message, type, read, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(50); // a bell dropdown never needs to show more than this
    assertNoError(error, 'loading notifications');
    return data.map((n) => ({
      id: n.id,
      title: n.title,
      message: n.message,
      type: n.type,
      read: n.read,
      createdAt: n.created_at,
    }));
  },

  async markNotificationRead(id) {
    const { error } = await supabase.from('notifications').update({ read: true }).eq('id', id);
    assertNoError(error, 'updating that notification');
  },

  async markAllNotificationsRead(userId) {
    const { error } = await supabase.from('notifications').update({ read: true }).eq('user_id', userId).eq('read', false);
    assertNoError(error, 'updating your notifications');
  },
};