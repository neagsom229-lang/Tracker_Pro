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

export const dataProvider = {
  // ---------------- Transactions ----------------
  async getTransactions(userId) {
    const { data, error } = await supabase
      .from('transactions')
      .select('*')
      .eq('user_id', userId)
      .order('date', { ascending: false });
    assertNoError(error, 'loading transactions');
    return data.map(mapTransaction);
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
      .select()
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
      .select()
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
    const { data, error } = await supabase.from('budgets').select('*').eq('user_id', userId);
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
      .select('*')
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
      .select()
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
    const { data, error } = await supabase.from('profiles').select('*').eq('id', userId).single();
    assertNoError(error, 'loading your profile');
    return {
      id: data.id,
      email: data.email,
      displayName: data.display_name,
      currency: data.currency,
    };
  },

  async setCurrency(userId, currency) {
    const { error } = await supabase.from('profiles').update({ currency }).eq('id', userId);
    assertNoError(error, 'saving your currency preference');
  },
};
