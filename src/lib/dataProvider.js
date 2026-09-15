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


const mapGoal = (row) => ({
  id: row.id,
  name: row.name,
  targetAmount: Number(row.target_amount),
  currentAmount: Number(row.current_amount),
  deadline: row.deadline,
  createdAt: row.created_at,
});

const mapDebt = (row) => ({
  id: row.id,
  name: row.name,
  balance: Number(row.balance),
  initialBalance: Number(row.initial_balance),
  interestRate: Number(row.interest_rate),
  minimumPayment: Number(row.minimum_payment),
  createdAt: row.created_at,
});

const mapNotification = (row) => ({
  id: row.id,
  title: row.title,
  message: row.message,
  type: row.type,
  read: row.read,
  createdAt: row.created_at,
});

export const dataProvider = {
  // ---------------- Transactions ----------------
  async getTransactions(userId) {
    const { data, error } = await supabase
      .from('transactions')
      .select(TRANSACTION_COLUMNS)
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
    const { data, error } = await supabase.from('profiles').select('id, email, display_name, currency').eq('id', userId).single();
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
  // ---------------- Goals (Pro) ----------------
  // `current_amount` is read here but never written here — contributions
  // go through the contribute_to_goal RPC so the goal balance and the
  // matching transaction row move together or not at all.
  async getGoals(userId) {
    const { data, error } = await supabase
      .from('goals')
      .select('id, name, target_amount, current_amount, deadline, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });
    assertNoError(error, 'loading your goals');
    return data.map(mapGoal);
  },

  async addGoal(userId, payload) {
    const { data, error } = await supabase
      .from('goals')
      .insert({
        user_id: userId,
        name: payload.name,
        target_amount: payload.targetAmount,
        deadline: payload.deadline || null,
      })
      .select('id, name, target_amount, current_amount, deadline, created_at')
      .single();
    assertNoError(error, 'creating the goal');
    return mapGoal(data);
  },

  async removeGoal(id) {
    const { error } = await supabase.from('goals').delete().eq('id', id);
    assertNoError(error, 'deleting the goal');
  },

  // Returns BOTH the updated goal and the transaction the database
  // created, so the store can patch each slice without a refetch.
  async contributeToGoal(goalId, amount, date) {
    const { data, error } = await supabase.rpc('contribute_to_goal', {
      p_goal_id: goalId,
      p_amount: amount,
      p_date: date ?? null,
    });
    assertNoError(error, 'adding funds to the goal');
    return { goal: mapGoal(data.goal), transaction: mapTransaction(data.transaction) };
  },

  // ---------------- Debts (Pro) ----------------
  async getDebts(userId) {
    const { data, error } = await supabase
      .from('debts')
      .select('id, name, balance, initial_balance, interest_rate, minimum_payment, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });
    assertNoError(error, 'loading your debts');
    return data.map(mapDebt);
  },

  async addDebt(userId, payload) {
    const { data, error } = await supabase
      .from('debts')
      .insert({
        user_id: userId,
        name: payload.name,
        balance: payload.balance,
        initial_balance: payload.balance,
        interest_rate: payload.interestRate || 0,
        minimum_payment: payload.minimumPayment || 0,
      })
      .select('id, name, balance, initial_balance, interest_rate, minimum_payment, created_at')
      .single();
    assertNoError(error, 'adding the debt');
    return mapDebt(data);
  },

  async removeDebt(id) {
    const { error } = await supabase.from('debts').delete().eq('id', id);
    assertNoError(error, 'deleting the debt');
  },

  async logDebtPayment(debtId, amount, date) {
    const { data, error } = await supabase.rpc('log_debt_payment', {
      p_debt_id: debtId,
      p_amount: amount,
      p_date: date ?? null,
    });
    assertNoError(error, 'logging the payment');
    return { debt: mapDebt(data.debt), transaction: mapTransaction(data.transaction) };
  },

  // ---------------- Notifications ----------------
  // Capped at 50: the bell dropdown shows a scrollable recent list, not
  // an archive, and an unbounded fetch on every app load is a slow query
  // waiting to happen for a long-lived account.
  async getNotifications(userId) {
    const { data, error } = await supabase
      .from('notifications')
      .select('id, title, message, type, read, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(50);
    assertNoError(error, 'loading notifications');
    return data.map(mapNotification);
  },

  async markNotificationRead(id) {
    const { error } = await supabase.from('notifications').update({ read: true }).eq('id', id);
    assertNoError(error, 'updating the notification');
  },

  async markAllNotificationsRead(userId) {
    const { error } = await supabase
      .from('notifications')
      .update({ read: true })
      .eq('user_id', userId)
      .eq('read', false);
    assertNoError(error, 'updating notifications');
  },
};