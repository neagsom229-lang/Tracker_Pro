import { supabase } from './supabaseClient';

/**
 * dataProvider.js (Supabase edition)
 * -----------------------------------
 * Every function is async and returns plain JS data; the store is
 * responsible for catching errors and turning them into toasts. RLS on
 * the server guarantees a user can only ever receive/affect their own rows.
 */

function assertNoError(error, context) {
  if (error) {
    console.error(`[dataProvider] ${context}:`, error.message);
    throw new Error(error.message || `Something went wrong while ${context}.`);
  }
}

const mapTransaction = (row) => ({
  id: row.id,
  description: row.description,
  amount: Number(row.amount),
  category: row.category,
  date: row.date,
  createdAt: row.created_at,
});

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
  initialBalance: Number(row.initial_balance),
  balance: Number(row.balance),
  interestRate: Number(row.interest_rate),
  minimumPayment: Number(row.minimum_payment),
  createdAt: row.created_at,
});

const TRANSACTION_COLUMNS = 'id, description, amount, category, date, created_at';
const GOAL_COLUMNS = 'id, name, target_amount, current_amount, deadline, created_at';
const DEBT_COLUMNS = 'id, name, initial_balance, balance, interest_rate, minimum_payment, created_at';

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

  // ---------------- Savings goals (Pro) ----------------
  async getGoals(userId) {
    const { data, error } = await supabase
      .from('goals')
      .select(GOAL_COLUMNS)
      .eq('user_id', userId)
      .order('created_at', { ascending: true });
    assertNoError(error, 'loading your goals');
    return data.map(mapGoal);
  },

  async addGoal(userId, { name, targetAmount, deadline }) {
    const { data, error } = await supabase
      .from('goals')
      .insert({
        user_id: userId,
        name,
        target_amount: targetAmount,
        current_amount: 0,
        deadline: deadline || null,
      })
      .select(GOAL_COLUMNS)
      .single();
    assertNoError(error, 'creating the goal');
    return mapGoal(data);
  },

  async removeGoal(id) {
    const { error } = await supabase.from('goals').delete().eq('id', id);
    assertNoError(error, 'removing the goal');
  },

  async contributeToGoal(id, delta) {
    const { data: existing, error: readError } = await supabase
      .from('goals')
      .select('current_amount')
      .eq('id', id)
      .single();
    assertNoError(readError, 'reading the goal');

    const next = Number(existing.current_amount) + delta;

    const { data, error } = await supabase
      .from('goals')
      .update({ current_amount: next })
      .eq('id', id)
      .select(GOAL_COLUMNS)
      .single();
    assertNoError(error, 'updating the goal');
    return mapGoal(data);
  },

  // ---------------- Debts (Pro) ----------------
  async getDebts(userId) {
    const { data, error } = await supabase
      .from('debts')
      .select(DEBT_COLUMNS)
      .eq('user_id', userId)
      .order('created_at', { ascending: true });
    assertNoError(error, 'loading your debts');
    return data.map(mapDebt);
  },

  async addDebt(userId, { name, balance, interestRate, minimumPayment }) {
    const { data, error } = await supabase
      .from('debts')
      .insert({
        user_id: userId,
        name,
        initial_balance: balance,
        balance,
        interest_rate: interestRate,
        minimum_payment: minimumPayment,
      })
      .select(DEBT_COLUMNS)
      .single();
    assertNoError(error, 'adding the debt');
    return mapDebt(data);
  },

  async removeDebt(id) {
    const { error } = await supabase.from('debts').delete().eq('id', id);
    assertNoError(error, 'removing the debt');
  },

  // Payment is a DELTA. Same race caveat as contributeToGoal: this is a
  // read-then-write, so two devices paying simultaneously could clobber
  // each other. Fine for a single-user app; the production fix is a
  // `log_debt_payment(debt_id, delta)` Postgres function doing
  // `balance = GREATEST(balance - delta, 0)` atomically.
  async logDebtPayment(id, amount) {
    const { data: existing, error: readError } = await supabase
      .from('debts')
      .select('balance')
      .eq('id', id)
      .single();
    assertNoError(readError, 'reading the debt');

    const next = Math.max(Number(existing.balance) - amount, 0);

    const { data, error } = await supabase
      .from('debts')
      .update({ balance: next })
      .eq('id', id)
      .select(DEBT_COLUMNS)
      .single();
    assertNoError(error, 'logging the payment');
    return mapDebt(data);
  },

  // ---------------- Profile / settings ----------------
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

  // ---------------- Notifications ----------------
  async getNotifications(userId) {
    const { data, error } = await supabase
      .from('notifications')
      .select('id, title, message, type, read, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(50);
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