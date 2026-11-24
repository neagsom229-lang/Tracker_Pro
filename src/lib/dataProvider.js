import { supabase } from './supabaseClient';
import { api, isLocalBackend } from '../api/client';

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

let jwtWarningLogged = false;
function logJwtWarningOnce(msg) {
  if (jwtWarningLogged) return;
  jwtWarningLogged = true;
  console.warn(`[dataProvider] ${msg} — this usually means your system clock is out of sync. Sync it and sign out/in.`);
}

function assertNoError(error, context) {
  if (error) {
    if (error.status === 401 || error.message?.includes('JWT') || error.code === 'PGRST301') {
      logJwtWarningOnce(context);
    } else {
      console.error(`[dataProvider] ${context}:`, error.message);
    }
    throw new Error(error.message || `Something went wrong while ${context}.`);
  }
}

async function withAuthRetry(fn) {
  try {
    const res = await fn();
    jwtWarningLogged = false;
    return res;
  } catch (err) {
    if (err.status === 401 || err.message?.includes('JWT') || err.code === 'PGRST301') {
      await supabase.auth.refreshSession();
      const res = await fn();
      jwtWarningLogged = false;
      return res;
    }
    throw err;
  }
}

async function withWriteRetry(fn) {
  try {
    return await fn();
  } catch (err) {
    if (err.status === 401 || err.message?.includes('JWT') || err.code === 'PGRST301') {
      await supabase.auth.refreshSession();
      return await fn();
    }
    throw err;
  }
}

async function safeFetch(context, fallbackValue, fn) {
  try {
    return await withAuthRetry(fn);
  } catch (err) {
    if (err.status === 401 || err.message?.includes('JWT') || err.code === 'PGRST301') {
      logJwtWarningOnce(context);
    } else {
      console.warn(`[dataProvider] ${context}:`, err.message);
    }
    return fallbackValue;
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
    if (isLocalBackend()) return safeFetch('loading transactions', [], () => api.transactions.get());
    return safeFetch('loading transactions', [], async () => {
      const all = [];
      let from = 0;
      while (true) {
        const { data, error } = await supabase
          .from('transactions')
          .select(TRANSACTION_COLUMNS)
          .eq('user_id', userId)
          .order('date', { ascending: false })
          .range(from, from + PAGE_SIZE - 1);
        if (error) throw error;
        all.push(...data);
        if (data.length < PAGE_SIZE) break;
        from += PAGE_SIZE;
      }
      return all.map(mapTransaction);
    });
  },

  async addTransaction(userId, payload) {
    if (isLocalBackend()) {
      return safeFetch('adding the transaction', null, () =>
        api.transactions.add({
          description: payload.description,
          amount: payload.amount,
          category: payload.category,
          date: payload.date,
        })
      );
    }
    return withWriteRetry(async () => {
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
    });
  },

  async updateTransaction(id, changes) {
    if (isLocalBackend()) {
      const patch = {};
      for (const key of ['description', 'amount', 'category', 'date']) {
        if (changes[key] !== undefined) patch[key] = changes[key];
      }
      return safeFetch('updating the transaction', null, () => api.transactions.update(id, patch));
    }
    return withWriteRetry(async () => {
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
    });
  },

  async deleteTransaction(id) {
    if (isLocalBackend()) {
      return safeFetch('deleting the transaction', id, () => api.transactions.remove(id).then(() => id));
    }
    return withWriteRetry(async () => {
      const { error } = await supabase.from('transactions').delete().eq('id', id);
      assertNoError(error, 'deleting the transaction');
      return id;
    });
  },

  // ---------------- Budgets ----------------
  async getBudgets(userId) {
    if (isLocalBackend()) return safeFetch('loading budgets', {}, () => api.budgets.get());
    return safeFetch('loading budgets', {}, async () => {
      const { data, error } = await supabase.from('budgets').select('category, monthly_limit').eq('user_id', userId);
      if (error) throw error;
      return Object.fromEntries(data.map((b) => [b.category, Number(b.monthly_limit)]));
    });
  },

  async setBudget(userId, category, limit) {
    if (isLocalBackend()) return safeFetch('saving the budget', null, () => api.budgets.upsert(category, limit));
    return withWriteRetry(async () => {
      const { error } = await supabase
        .from('budgets')
        .upsert({ user_id: userId, category, monthly_limit: limit }, { onConflict: 'user_id,category' });
      assertNoError(error, 'saving the budget');
    });
  },

  async removeBudget(userId, category) {
    if (isLocalBackend()) return safeFetch('removing the budget', null, () => api.budgets.remove(category));
    return withWriteRetry(async () => {
      const { error } = await supabase.from('budgets').delete().eq('user_id', userId).eq('category', category);
      assertNoError(error, 'removing the budget');
    });
  },

  // ---------------- Recurring rules ----------------
  async getRecurring(userId) {
    if (isLocalBackend()) return safeFetch('loading recurring rules', [], () => api.recurring.get());
    return safeFetch('loading recurring rules', [], async () => {
      const { data, error } = await supabase
        .from('recurring_rules')
        .select('id, description, amount, category, frequency, next_run_date')
        .eq('user_id', userId)
        .order('created_at', { ascending: true });
      if (error) throw error;
      return data.map((r) => ({
        id: r.id,
        description: r.description,
        amount: Number(r.amount),
        category: r.category,
        frequency: r.frequency,
        nextRunDate: r.next_run_date,
      }));
    });
  },

  async addRecurring(userId, payload) {
    if (isLocalBackend()) return safeFetch('adding the recurring rule', null, () => api.recurring.add(payload));
    return withWriteRetry(async () => {
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
    });
  },

  async updateRecurringNextRun(id, nextRunDate) {
    if (isLocalBackend()) return safeFetch('updating the recurring rule', null, () => api.recurring.update(id, nextRunDate));
    return withWriteRetry(async () => {
      const { error } = await supabase.from('recurring_rules').update({ next_run_date: nextRunDate }).eq('id', id);
      assertNoError(error, 'updating the recurring rule');
    });
  },

  async removeRecurring(id) {
    if (isLocalBackend()) return safeFetch('removing the recurring rule', null, () => api.recurring.remove(id));
    return withWriteRetry(async () => {
      const { error } = await supabase.from('recurring_rules').delete().eq('id', id);
      assertNoError(error, 'removing the recurring rule');
    });
  },

  // ---------------- Profile / settings ----------------
  // Billing fields (is_pro, stripe_customer_id, etc.) used to live here
  // but were moved to dedicated `subscriptions` / `stripe_customers`
  // tables in migration 002 — see useProStatus() for how Pro status is
  // read now. This function only returns account-level settings.
  async getProfile(userId) {
    if (isLocalBackend())
      return safeFetch('loading your profile', null, async () => {
        const data = await api.profile.get();
        return data?.id ? data : null;
      });
    return safeFetch('loading your profile', null, async () => {
      const { data, error } = await supabase.from('profiles').select('id, email, display_name, currency, is_admin').eq('id', userId).single();
      if (error) throw error;
      return {
        id: data.id,
        email: data.email,
        displayName: data.display_name,
        currency: data.currency,
        isAdmin: data.is_admin,
      };
    });
  },

  async setCurrency(userId, currency) {
    if (isLocalBackend()) return safeFetch('saving the currency preference', null, () => api.profile.update(currency));
    return withWriteRetry(async () => {
      const { error } = await supabase.from('profiles').update({ currency }).eq('id', userId);
      assertNoError(error, 'saving your currency preference');
    });
  },

  // ---------------- Notifications ----------------
  async getNotifications(userId) {
    if (isLocalBackend()) return safeFetch('loading notifications', [], () => api.notifications.get());
    return safeFetch('loading notifications', [], async () => {
      const { data, error } = await supabase
        .from('notifications')
        .select('id, title, message, type, read, created_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      return data.map((n) => ({
        id: n.id,
        title: n.title,
        message: n.message,
        type: n.type,
        read: n.read,
        createdAt: n.created_at,
      }));
    });
  },

  async markNotificationRead(id) {
    if (isLocalBackend()) return safeFetch('updating that notification', null, () => api.notifications.markRead(id));
    return withWriteRetry(async () => {
      const { error } = await supabase.from('notifications').update({ read: true }).eq('id', id);
      assertNoError(error, 'updating that notification');
    });
  },

  async markAllNotificationsRead(userId) {
    if (isLocalBackend()) return safeFetch('updating your notifications', null, () => api.notifications.markAllRead());
    return withWriteRetry(async () => {
      const { error } = await supabase.from('notifications').update({ read: true }).eq('user_id', userId).eq('read', false);
      assertNoError(error, 'updating your notifications');
    });
  },

  // ---------------- Quick Add parse corrections ----------------
  async getParseCorrections(userId) {
    if (isLocalBackend()) return safeFetch('loading your Quick Add corrections', {}, () => api.parseCorrections.get());
    return safeFetch('loading your Quick Add corrections', {}, async () => {
      const { data, error } = await supabase.from('parse_corrections').select('pattern_key, corrected_category').eq('user_id', userId);
      if (error) throw error;
      return Object.fromEntries(data.map((c) => [c.pattern_key, c.corrected_category]));
    });
  },

  async saveParseCorrection(userId, patternKey, correctedCategory) {
    if (isLocalBackend()) {
      return safeFetch('saving that correction', null, () => api.parseCorrections.save(patternKey, correctedCategory));
    }
    // Upsert on (user_id, pattern_key) — matches the unique constraint
    // in the migration, so correcting the same keyword twice updates
    // the existing row instead of erroring or duplicating.
    return withWriteRetry(async () => {
      const { error } = await supabase
        .from('parse_corrections')
        .upsert(
          { user_id: userId, pattern_key: patternKey, corrected_category: correctedCategory, updated_at: new Date().toISOString() },
          { onConflict: 'user_id,pattern_key' }
        );
      assertNoError(error, 'saving that correction');
    });
  },

  // ---------------- Net worth (assets & debts) ----------------
  async getAssets(userId) {
    if (isLocalBackend()) return safeFetch('loading your assets', [], () => api.assets.get());
    return safeFetch('loading your assets', [], async () => {
      const { data, error } = await supabase
        .from('assets')
        .select('id, name, type, value')
        .eq('user_id', userId)
        .order('created_at', { ascending: true });
      if (error) throw error;
      return data.map((a) => ({ id: a.id, name: a.name, type: a.type, value: Number(a.value) }));
    });
  },

  async addAsset(userId, payload) {
    if (isLocalBackend()) throw new Error('Assets are not available in local mode yet (phase 2).');
    return withWriteRetry(async () => {
      const { data, error } = await supabase
        .from('assets')
        .insert({ user_id: userId, name: payload.name, type: payload.type, value: payload.value })
        .select('id, name, type, value')
        .single();
      assertNoError(error, 'adding that');
      return { id: data.id, name: data.name, type: data.type, value: Number(data.value) };
    });
  },

  async removeAsset(id) {
    if (isLocalBackend()) throw new Error('Assets are not available in local mode yet (phase 2).');
    return withWriteRetry(async () => {
      const { error } = await supabase.from('assets').delete().eq('id', id);
      assertNoError(error, 'removing that');
    });
  },

  // Last 90 days — enough for a meaningful trend line without loading
  // an ever-growing history for someone who's used this for years.
  async getNetWorthHistory(userId) {
    if (isLocalBackend()) return safeFetch('loading your net worth history', [], () => api.netWorth.get());
    return safeFetch('loading your net worth history', [], async () => {
      const ninetyDaysAgo = new Date();
      ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
      const { data, error } = await supabase
        .from('net_worth_snapshots')
        .select('date, total_assets, total_debts, net_worth')
        .eq('user_id', userId)
        .gte('date', ninetyDaysAgo.toISOString().slice(0, 10))
        .order('date', { ascending: true });
      if (error) throw error;
      return data.map((s) => ({
        date: s.date,
        totalAssets: Number(s.total_assets),
        totalDebts: Number(s.total_debts),
        netWorth: Number(s.net_worth),
      }));
    });
  },
};
