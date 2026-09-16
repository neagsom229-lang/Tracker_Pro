import { create } from 'zustand';
import toast from 'react-hot-toast';
import { supabase } from '../lib/supabaseClient';
import { dataProvider } from '../lib/dataProvider';
import { addInterval, todayISO } from '../utils/recurrence';

/**
 * useStore
 * --------
 * DATA FLOW (example: user adds an expense)
 * 1. TransactionModal calls `addTransaction(payload)`.
 * 2. The store immediately builds an optimistic transaction (temp id) and
 *    prepends it to state — the UI updates instantly, before the network
 *    request even resolves.
 * 3. `dataProvider.addTransaction` sends the insert to Supabase. RLS on
 *    the `transactions` table guarantees this can only write a row owned
 *    by the caller.
 * 4. On success, the optimistic row is swapped for the real row.
 * 5. On failure, the optimistic row is rolled back and a toast explains why.
 */

let hasInitializedData = false;

export const useStore = create((set, get) => ({
  // ---------------- Auth ----------------
  session: null,
  authLoading: true,
  isPasswordRecovery: false,
  clearPasswordRecovery: () => set({ isPasswordRecovery: false }),

  initAuth: () => {
    const initDataOnce = () => {
      if (hasInitializedData) return;
      hasInitializedData = true;
      get().initData();
    };

    supabase.auth.getSession().then(({ data: { session } }) => {
      set({ session: session?.user ?? null, authLoading: false });
      if (session?.user) initDataOnce();
    });

    supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') set({ isPasswordRecovery: true });

      const user = session?.user ?? null;
      const wasLoggedOut = !get().session;
      set({ session: user, authLoading: false });
      if (user && wasLoggedOut) initDataOnce();
      if (!user) {
        hasInitializedData = false;
        set({
          transactions: [],
          budgets: {},
          recurring: [],
          goals: [],
          debts: [],
          profile: null,
          notifications: [],
        });
      }
    });
  },

  logout: async () => {
    await supabase.auth.signOut();
  },

  // ---------------- Core data ----------------
  transactions: [],
  budgets: {},
  recurring: [],
  goals: [],
  debts: [],
  profile: null,
  dataLoading: true,
  dataError: null,

  initData: async () => {
    const userId = get().session?.id;
    if (!userId) return;
    set({ dataLoading: true, dataError: null });
    try {
      const [transactions, budgets, recurring, profile, notifications, goals, debts] = await Promise.all([
        dataProvider.getTransactions(userId),
        dataProvider.getBudgets(userId),
        dataProvider.getRecurring(userId),
        dataProvider.getProfile(userId),
        dataProvider.getNotifications(userId),
        dataProvider.getGoals(userId),
        dataProvider.getDebts(userId),
      ]);
      set({ transactions, budgets, recurring, profile, notifications, goals, debts, dataLoading: false });
      get().processRecurring();
    } catch (err) {
      set({ dataLoading: false, dataError: err.message });
      toast.error(`Couldn't load your data: ${err.message}`);
    }
  },

  // ---------------- Transaction CRUD (optimistic) ----------------
  addTransaction: async (payload) => {
    const userId = get().session.id;
    const tempId = `temp-${Date.now()}`;
    const optimistic = { id: tempId, createdAt: new Date().toISOString(), ...payload };
    set({ transactions: [optimistic, ...get().transactions] });

    try {
      const saved = await dataProvider.addTransaction(userId, payload);
      set({ transactions: get().transactions.map((t) => (t.id === tempId ? saved : t)) });
      toast.success('Transaction added!');
    } catch (err) {
      set({ transactions: get().transactions.filter((t) => t.id !== tempId) });
      toast.error(err.message);
    }
  },

  updateTransaction: async (id, changes) => {
    const previous = get().transactions;
    set({ transactions: previous.map((t) => (t.id === id ? { ...t, ...changes } : t)) });
    try {
      const saved = await dataProvider.updateTransaction(id, changes);
      set({ transactions: get().transactions.map((t) => (t.id === id ? saved : t)) });
      toast.success('Transaction updated.');
    } catch (err) {
      set({ transactions: previous });
      toast.error(err.message);
    }
  },

  deleteTransaction: async (id) => {
    const previous = get().transactions;
    set({ transactions: previous.filter((t) => t.id !== id) });
    try {
      await dataProvider.deleteTransaction(id);
      toast.success('Transaction deleted.');
    } catch (err) {
      set({ transactions: previous });
      toast.error(err.message);
    }
  },

  // Used by AIQuickAdd: the Edge Function already inserted the row
  // server-side, so this just splices the returned row into local
  // state — no network call, no optimistic insert, nothing to roll
  // back, and a duplicate-guard in case the same row arrives twice.
  receiveExternalTransaction: (tx) => {
    if (!tx?.id) return;
    set((state) => {
      if (state.transactions.some((t) => t.id === tx.id)) return state;
      return { transactions: [tx, ...state.transactions] };
    });
  },

  // ---------------- Budgets (Pro) ----------------
  setBudget: async (categoryId, limitUSD) => {
    const userId = get().session.id;
    const previous = get().budgets;
    set({ budgets: { ...previous, [categoryId]: limitUSD } });
    try {
      await dataProvider.setBudget(userId, categoryId, limitUSD);
      toast.success('Budget saved.');
    } catch (err) {
      set({ budgets: previous });
      toast.error(err.message);
    }
  },

  removeBudget: async (categoryId) => {
    const userId = get().session.id;
    const previous = get().budgets;
    const updated = { ...previous };
    delete updated[categoryId];
    set({ budgets: updated });
    try {
      await dataProvider.removeBudget(userId, categoryId);
      toast.success('Budget removed.');
    } catch (err) {
      set({ budgets: previous });
      toast.error(err.message);
    }
  },

  // ---------------- Recurring transactions (Pro) ----------------
  addRecurring: async (payload) => {
    const userId = get().session.id;
    try {
      const saved = await dataProvider.addRecurring(userId, { ...payload, nextRunDate: payload.nextRunDate || todayISO() });
      set({ recurring: [...get().recurring, saved] });
      toast.success('Recurring rule added.');
    } catch (err) {
      toast.error(err.message);
    }
  },

  removeRecurring: async (id) => {
    const previous = get().recurring;
    set({ recurring: previous.filter((r) => r.id !== id) });
    try {
      await dataProvider.removeRecurring(id);
      toast.success('Recurring rule removed.');
    } catch (err) {
      set({ recurring: previous });
      toast.error(err.message);
    }
  },

  processRecurring: async () => {
    const { recurring, session } = get();
    if (!session) return;
    const userId = session.id;
    const today = todayISO();
    const MAX_CATCHUP_RUNS = 24;

    const newlyCreated = [];
    const ruleUpdates = [];

    for (const rule of recurring) {
      let nextRun = rule.nextRunDate;
      let runsGenerated = 0;

      while (nextRun <= today && runsGenerated < MAX_CATCHUP_RUNS) {
        try {
          const saved = await dataProvider.addTransaction(userId, {
            description: `${rule.description} (auto)`,
            amount: rule.amount,
            category: rule.category,
            date: nextRun,
          });
          newlyCreated.push(saved);
        } catch (err) {
          toast.error(`Couldn't post a scheduled "${rule.description}" transaction: ${err.message}`);
          break;
        }
        nextRun = addInterval(nextRun, rule.frequency);
        runsGenerated += 1;
      }

      if (runsGenerated > 0) {
        ruleUpdates.push({ id: rule.id, nextRunDate: nextRun });
      }
    }

    if (newlyCreated.length > 0) {
      set({ transactions: [...newlyCreated, ...get().transactions] });
      toast.success(
        newlyCreated.length === 1 ? '1 recurring transaction was posted.' : `${newlyCreated.length} recurring transactions were posted.`
      );
    }

    for (const { id, nextRunDate } of ruleUpdates) {
      await dataProvider.updateRecurringNextRun(id, nextRunDate);
      set({ recurring: get().recurring.map((r) => (r.id === id ? { ...r, nextRunDate } : r)) });
    }
  },

  // ---------------- Savings goals (Pro) ----------------
  addGoal: async ({ name, targetAmount, deadline }) => {
    const userId = get().session.id;
    const tempId = `temp-${Date.now()}`;
    const optimistic = {
      id: tempId,
      name,
      targetAmount,
      currentAmount: 0,
      deadline: deadline ?? null,
      createdAt: new Date().toISOString(),
    };
    set({ goals: [...get().goals, optimistic] });

    try {
      const saved = await dataProvider.addGoal(userId, { name, targetAmount, deadline });
      set({ goals: get().goals.map((g) => (g.id === tempId ? saved : g)) });
      toast.success('Goal created.');
      return saved;
    } catch (err) {
      set({ goals: get().goals.filter((g) => g.id !== tempId) });
      toast.error(err.message);
      throw err;
    }
  },

  removeGoal: async (id) => {
    const previous = get().goals;
    set({ goals: previous.filter((g) => g.id !== id) });
    try {
      await dataProvider.removeGoal(id);
      toast.success('Goal removed.');
    } catch (err) {
      set({ goals: previous });
      toast.error(err.message);
    }
  },

  contributeToGoal: async (id, amount) => {
    const previous = get().goals;
    set({
      goals: previous.map((g) =>
        g.id === id ? { ...g, currentAmount: g.currentAmount + amount } : g
      ),
    });
    try {
      const saved = await dataProvider.contributeToGoal(id, amount);
      set({ goals: get().goals.map((g) => (g.id === id ? saved : g)) });
      toast.success('Contribution added.');
      return saved;
    } catch (err) {
      set({ goals: previous });
      toast.error(err.message);
      throw err;
    }
  },

  // ---------------- Debts (Pro) ----------------
  addDebt: async ({ name, balance, interestRate, minimumPayment }) => {
    const userId = get().session.id;
    const tempId = `temp-${Date.now()}`;
    const optimistic = {
      id: tempId,
      name,
      initialBalance: balance,
      balance,
      interestRate,
      minimumPayment,
      createdAt: new Date().toISOString(),
    };
    set({ debts: [...get().debts, optimistic] });

    try {
      const saved = await dataProvider.addDebt(userId, { name, balance, interestRate, minimumPayment });
      set({ debts: get().debts.map((d) => (d.id === tempId ? saved : d)) });
      toast.success('Debt added.');
      return saved;
    } catch (err) {
      set({ debts: get().debts.filter((d) => d.id !== tempId) });
      toast.error(err.message);
      throw err;
    }
  },

  removeDebt: async (id) => {
    const previous = get().debts;
    set({ debts: previous.filter((d) => d.id !== id) });
    try {
      await dataProvider.removeDebt(id);
      toast.success('Debt removed.');
    } catch (err) {
      set({ debts: previous });
      toast.error(err.message);
    }
  },

  logDebtPayment: async (id, amount) => {
    const previous = get().debts;
    set({
      debts: previous.map((d) =>
        d.id === id ? { ...d, balance: Math.max(d.balance - amount, 0) } : d
      ),
    });
    try {
      const saved = await dataProvider.logDebtPayment(id, amount);
      set({ debts: get().debts.map((d) => (d.id === id ? saved : d)) });
      toast.success('Payment logged.');
      return saved;
    } catch (err) {
      set({ debts: previous });
      toast.error(err.message);
      throw err;
    }
  },

  // ---------------- Settings / billing ----------------
  setCurrency: async (currency) => {
    const userId = get().session.id;
    const previous = get().profile;
    set({ profile: { ...previous, currency } });
    try {
      await dataProvider.setCurrency(userId, currency);
    } catch (err) {
      set({ profile: previous });
      toast.error(err.message);
    }
  },

  refreshProfile: async () => {
    const userId = get().session?.id;
    if (!userId) return;
    try {
      const profile = await dataProvider.getProfile(userId);
      set({ profile });
    } catch (err) {
      toast.error(err.message);
    }
  },

  // ---------------- Notifications ----------------
  notifications: [],

  receiveNotification: (notification) =>
    set((state) => {
      if (state.notifications.some((n) => n.id === notification.id)) return state;
      return { notifications: [notification, ...state.notifications] };
    }),

  markNotificationRead: async (id) => {
    const previous = get().notifications;
    set({ notifications: previous.map((n) => (n.id === id ? { ...n, read: true } : n)) });
    try {
      await dataProvider.markNotificationRead(id);
    } catch (err) {
      set({ notifications: previous });
      toast.error(err.message);
    }
  },

  markAllNotificationsRead: async () => {
    const userId = get().session?.id;
    if (!userId) return;
    const previous = get().notifications;
    set({ notifications: previous.map((n) => ({ ...n, read: true })) });
    try {
      await dataProvider.markAllNotificationsRead(userId);
    } catch (err) {
      set({ notifications: previous });
      toast.error(err.message);
    }
  },

  // ---------------- UI state (modals) ----------------
  isTransactionModalOpen: false,
  editingTransactionId: null,
  isUpgradeModalOpen: false,
  upgradeReason: '',

  openTransactionModal: (id = null) => set({ isTransactionModalOpen: true, editingTransactionId: id }),
  closeTransactionModal: () => set({ isTransactionModalOpen: false, editingTransactionId: null }),
  openUpgradeModal: (reason = 'this feature') => set({ isUpgradeModalOpen: true, upgradeReason: reason }),
  closeUpgradeModal: () => set({ isUpgradeModalOpen: false }),
}));

// ---------------- Derived selectors ----------------

export const selectTotals = (transactions) => {
  const totalIncome = transactions.filter((t) => t.amount > 0).reduce((s, t) => s + t.amount, 0);
  const totalExpenses = transactions.filter((t) => t.amount < 0).reduce((s, t) => s + Math.abs(t.amount), 0);
  return { totalIncome, totalExpenses, totalBalance: totalIncome - totalExpenses };
};

export const selectSpendingByCategory = (transactions) => {
  const map = {};
  transactions
    .filter((t) => t.amount < 0)
    .forEach((t) => {
      map[t.category] = (map[t.category] || 0) + Math.abs(t.amount);
    });
  return map;
};

export const selectSpendingThisMonth = (transactions) => {
  const currentMonth = new Date().toISOString().slice(0, 7);
  return selectSpendingByCategory(transactions.filter((t) => t.date.slice(0, 7) === currentMonth));
};

export const selectUnreadCount = (notifications) => notifications.filter((n) => !n.read).length;

export const selectGoalTotals = (goals) => {
  const totalTarget = goals.reduce((s, g) => s + (g.targetAmount || 0), 0);
  const totalSaved = goals.reduce((s, g) => s + (g.currentAmount || 0), 0);
  const completed = goals.filter((g) => g.currentAmount >= g.targetAmount).length;
  return {
    count: goals.length,
    completed,
    totalTarget,
    totalSaved,
    totalRemaining: Math.max(totalTarget - totalSaved, 0),
  };
};

export const selectDebtTotals = (debts) => {
  const totalBalance = debts.reduce((s, d) => s + (d.balance || 0), 0);
  const totalInitial = debts.reduce((s, d) => s + (d.initialBalance || 0), 0);
  const rawProgress = totalInitial > 0 ? (totalInitial - totalBalance) / totalInitial : 0;
  return {
    count: debts.length,
    totalBalance,
    totalInitial,
    payoffProgress: Math.min(Math.max(rawProgress, 0), 1),
  };
};