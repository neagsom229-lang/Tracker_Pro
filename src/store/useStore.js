import { create } from 'zustand';
import toast from 'react-hot-toast';
import { supabase } from '../lib/supabaseClient';
import { dataProvider } from '../lib/dataProvider';
import { addInterval, todayISO } from '../utils/recurrence';
import { TRANSFER_CATEGORY_IDS } from '../utils/constants';

/**
 * useStore
 * --------
 * DATA FLOW (example: user adds an expense)
 * 1. TransactionModal calls `addTransaction(payload)`.
 * 2. The store immediately builds an optimistic transaction (temp id) and
 *    prepends it to state — the UI updates instantly, before the network
 *    request even resolves. This is what makes the app feel instant
 *    despite now talking to a real database over the network.
 * 3. `dataProvider.addTransaction` sends the insert to Supabase. RLS on
 *    the `transactions` table (see supabase/migrations) guarantees this
 *    can only ever write a row owned by the caller.
 * 4. On success, the optimistic row is swapped for the real row (real id,
 *    real created_at) returned by Postgres.
 * 5. On failure, the optimistic row is rolled back and a toast explains
 *    what went wrong — the UI never silently "loses" or fakes data.
 */

// Module-level (not store state) on purpose: guards the very first data
// load against running twice. On an already-logged-in page load,
// `getSession()` resolving AND `onAuthStateChange` firing its initial
// event (Supabase v2 calls the listener once immediately on subscribe,
// with whatever session already exists, in addition to the separate
// getSession() promise below) can both observe "no session yet → now
// there's one" and each call initData() — two redundant parallel
// fetches of the same data.
let hasInitializedData = false;

// Guards `initAuth` itself. React StrictMode runs every effect twice in
// development, and App calls initAuth() from an effect — without this
// flag that means two live onAuthStateChange subscriptions for the
// lifetime of the tab, so every sign-in/token-refresh is handled twice.
// (The previous `hasInitializedData` flag stopped the duplicate *data*
// fetch but not the duplicate listener itself.)
let authInitialized = false;

// Read synchronously at module load, BEFORE supabase-js has a chance to
// consume and clear the URL hash. A password-reset link arrives as
// .../#access_token=...&type=recovery — if we waited for the
// PASSWORD_RECOVERY event we'd sometimes render a flash of the
// dashboard first. We check both: this for the no-flash case, and the
// event below as the reliable backstop.
function urlLooksLikeRecovery() {
  if (typeof window === 'undefined') return false;
  const hash = window.location.hash || '';
  return hash.includes('type=recovery') || window.location.pathname === '/reset-password';
}

export const useStore = create((set, get) => ({
  // ---------------- Auth ----------------
  session: null, // Supabase `user` object once signed in, else null
  authLoading: true,

  // True while the user is mid password-reset. App renders
  // ResetPasswordScreen instead of the dashboard when this is set, even
  // though a (recovery) session technically exists.
  recoveryMode: urlLooksLikeRecovery(),

  initAuth: () => {
    if (authInitialized) return;
    authInitialized = true;

    const initDataOnce = () => {
      // Don't load the dashboard's data behind the reset-password
      // screen — the user isn't going there yet, and the recovery
      // session may be about to be signed out.
      if (get().recoveryMode) return;
      if (hasInitializedData) return;
      hasInitializedData = true;
      get().initData();
    };

    // 1. Check for an existing session on first load (e.g. page refresh).
    //    persistSession + autoRefreshToken in supabaseClient.js mean the
    //    session is read back out of localStorage here, which is what
    //    keeps the user logged in across refreshes. `authLoading` stays
    //    true until this resolves so App shows the spinner rather than
    //    flashing the login screen at an already-signed-in user.
    supabase.auth.getSession().then(({ data: { session } }) => {
      set({ session: session?.user ?? null, authLoading: false });
      if (session?.user) initDataOnce();
    });

    // 2. Subscribe to ALL future auth changes: login, logout, token
    // refresh, password recovery, and the redirect-back from Google
    // OAuth. This one listener is what makes AuthScreen's Supabase calls
    // "just work" without it needing to touch the store directly.
    supabase.auth.onAuthStateChange((event, session) => {
      const user = session?.user ?? null;
      const wasLoggedOut = !get().session;

      if (event === 'PASSWORD_RECOVERY') {
        set({ session: user, authLoading: false, recoveryMode: true });
        return;
      }

      set({ session: user, authLoading: false });

      if (user && wasLoggedOut) initDataOnce();

      if (!user) {
        // A real sign-out: reset the guard so a fresh sign-in (by the
        // same or a different user, in the same tab) fetches again.
        hasInitializedData = false;
        set({ transactions: [], budgets: {}, recurring: [], goals: [], debts: [], notifications: [], profile: null });
      }
    });
  },

  // Called by ResetPasswordScreen once the new password is saved (or
  // the user cancels). Clears the recovery flag and, if they're still
  // signed in, loads their data so they land on a ready dashboard.
  exitRecoveryMode: async () => {
    set({ recoveryMode: false });
    // Scrub any leftover recovery fragment from the address bar.
    if (typeof window !== 'undefined') {
      window.history.replaceState({}, '', '/');
    }
    const { data } = await supabase.auth.getSession();
    const user = data?.session?.user ?? null;
    set({ session: user });
    if (user && !hasInitializedData) {
      hasInitializedData = true;
      get().initData();
    }
  },

  logout: async () => {
    await supabase.auth.signOut();
  },

  // ---------------- Core data ----------------
  transactions: [],
  budgets: {}, // { [categoryId]: monthlyLimitUSD }
  recurring: [], // [{ id, description, amount, category, frequency, nextRunDate }]
  goals: [], // [{ id, name, targetAmount, currentAmount, deadline }]
  debts: [], // [{ id, name, balance, initialBalance, interestRate, minimumPayment }]
  notifications: [], // newest first; written server-side, read/updated here
  profile: null, // { currency, displayName } — account settings only, not billing
  dataLoading: true,
  dataError: null,

  initData: async () => {
    const userId = get().session?.id;
    if (!userId) return;
    set({ dataLoading: true, dataError: null });
    try {
      // One parallel round trip rather than seven sequential ones. Any
      // single rejection fails the whole load, which is correct here:
      // a dashboard showing transactions but silently missing goals is
      // worse than an honest "couldn't reach your data" with a retry.
      const [transactions, budgets, recurring, goals, debts, notifications, profile] = await Promise.all([
        dataProvider.getTransactions(userId),
        dataProvider.getBudgets(userId),
        dataProvider.getRecurring(userId),
        dataProvider.getGoals(userId),
        dataProvider.getDebts(userId),
        dataProvider.getNotifications(userId),
        dataProvider.getProfile(userId),
      ]);
      set({ transactions, budgets, recurring, goals, debts, notifications, profile, dataLoading: false });
      get().processRecurring();
    } catch (err) {
      // Network failure or RLS/config issue — surface it instead of
      // leaving the UI stuck on a blank loading screen forever.
      set({ dataLoading: false, dataError: err.message });
      toast.error(`Couldn't load your data: ${err.message}`);
    }
  },

  // ---------------- Transaction CRUD (optimistic) ----------------
  // A row that was inserted SERVER-SIDE (parse-transaction) and just
  // needs the UI to catch up -- no network call, unlike addTransaction
  // below which is responsible for the insert itself.
  receiveExternalTransaction: (transaction) => {
    if (get().transactions.some((t) => t.id === transaction.id)) return;
    set({ transactions: [transaction, ...get().transactions] });
  },


  addTransaction: async (payload) => {
    const userId = get().session.id;
    const tempId = `temp-${Date.now()}`;
    const optimistic = { id: tempId, createdAt: new Date().toISOString(), ...payload };
    set({ transactions: [optimistic, ...get().transactions] });

    try {
      const saved = await dataProvider.addTransaction(userId, payload);
      set({ transactions: get().transactions.map((t) => (t.id === tempId ? saved : t)) });
      toast.success('Transaction added!');
      return saved;
    } catch (err) {
      set({ transactions: get().transactions.filter((t) => t.id !== tempId) });
      toast.error(err.message);
      throw err;
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
      set({ transactions: previous }); // roll back to the exact pre-edit state
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
  // frequency: 'weekly' | 'monthly' | 'yearly'
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

  // The recurring "engine": on every app load, walk each rule forward
  // from its stored `nextRunDate` until that date is in the future,
  // creating one real transaction per period that has elapsed (capped so
  // a rule nobody has opened the app for in years can't create thousands
  // of rows at once). This runs client-side for the demo; in a stricter
  // production setup you'd also run this on a daily cron via a Supabase
  // scheduled Edge Function so it fires even if the user never opens the app.
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
          // Insert directly (bypassing the optimistic addTransaction
          // action) so catch-up runs don't spam a toast per transaction
          // or create/discard temporary optimistic rows for something
          // the user didn't just click a button for.
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
  addGoal: async (payload) => {
    const userId = get().session.id;
    try {
      const saved = await dataProvider.addGoal(userId, payload);
      set({ goals: [saved, ...get().goals] });
      toast.success('Goal created.');
      return saved;
    } catch (err) {
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

  // Deliberately NOT optimistic. Every other write in this store updates
  // the UI first and rolls back on failure, which is right for a single
  // row. This one moves two things at once (the goal balance and a new
  // transaction), and the database is what guarantees they move
  // together. Faking that pairing client-side would mean inventing a
  // transaction id we'd have to reconcile, and showing a contribution
  // that the RPC might still reject (goal deleted in another tab,
  // amount rejected by a CHECK). A few hundred milliseconds of a
  // disabled button is a fair price for never showing a contribution
  // that didn't happen.
  contributeToGoal: async (goalId, amount, date) => {
    try {
      const { goal, transaction } = await dataProvider.contributeToGoal(goalId, amount, date);
      set({
        goals: get().goals.map((g) => (g.id === goal.id ? goal : g)),
        transactions: [transaction, ...get().transactions],
      });
      const reached = goal.currentAmount >= goal.targetAmount;
      toast.success(reached ? `\u{1F389} "${goal.name}" is fully funded!` : 'Funds added.');
      return goal;
    } catch (err) {
      toast.error(err.message);
      throw err;
    }
  },

  // ---------------- Debts (Pro) ----------------
  addDebt: async (payload) => {
    const userId = get().session.id;
    try {
      const saved = await dataProvider.addDebt(userId, payload);
      set({ debts: [saved, ...get().debts] });
      toast.success('Debt added.');
      return saved;
    } catch (err) {
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

  // Same reasoning as contributeToGoal: two coupled writes, so the
  // server is the only thing allowed to decide they happened.
  logDebtPayment: async (debtId, amount, date) => {
    try {
      const { debt, transaction } = await dataProvider.logDebtPayment(debtId, amount, date);
      set({
        debts: get().debts.map((d) => (d.id === debt.id ? debt : d)),
        transactions: [transaction, ...get().transactions],
      });
      toast.success(debt.balance === 0 ? `\u{1F389} "${debt.name}" is paid off!` : 'Payment logged.');
      return debt;
    } catch (err) {
      toast.error(err.message);
      throw err;
    }
  },

  // ---------------- Notifications ----------------
  // Inserts arrive here from the Realtime channel in useNotifications.
  receiveNotification: (notification) => {
    // Realtime can redeliver on reconnect, so guard against duplicates
    // rather than trusting the channel to be exactly-once.
    if (get().notifications.some((n) => n.id === notification.id)) return;
    set({ notifications: [notification, ...get().notifications].slice(0, 50) });
  },

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
    if (!previous.some((n) => !n.read)) return;
    set({ notifications: previous.map((n) => ({ ...n, read: true })) });
    try {
      await dataProvider.markAllNotificationsRead(userId);
    } catch (err) {
      set({ notifications: previous });
      toast.error(err.message);
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

  // Re-fetches account settings (currency, display name) from Postgres.
  // Note: this does NOT touch Pro status — that lives in the
  // `subscriptions` table and is read via useProStatus(), which has its
  // own refresh() for use after a Stripe redirect.
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

  // ---------------- UI state (modals) ----------------
  isTransactionModalOpen: false,
  editingTransactionId: null,
  isUpgradeModalOpen: false,
  upgradeReason: '',

  openTransactionModal: (id = null) => set({ isTransactionModalOpen: true, editingTransactionId: id }),
  closeTransactionModal: () => set({ isTransactionModalOpen: false, editingTransactionId: null }),
  openUpgradeModal: (reason = 'this feature') => set({ isUpgradeModalOpen: true, upgradeReason: reason }),
  closeUpgradeModal: () => set({ isUpgradeModalOpen: false }),

  // Pro-gating now happens in components via the useProStatus() hook
  // (e.g. Sidebar/MobileNav check `isPro` from that hook directly, then
  // call `openUpgradeModal(reason)` above if the user isn't Pro) — the
  // store no longer holds isPro itself, since `subscriptions` in
  // Postgres (kept live via Realtime) is the single source of truth.
}));

// ---------------- Derived selectors ----------------
// Plain functions, not stored state, so totals can never drift out of
// sync with the transaction list.

export const selectTotals = (transactions) => {
  const totalIncome = transactions.filter((t) => t.amount > 0).reduce((s, t) => s + t.amount, 0);
  const totalExpenses = transactions.filter((t) => t.amount < 0).reduce((s, t) => s + Math.abs(t.amount), 0);
  return { totalIncome, totalExpenses, totalBalance: totalIncome - totalExpenses };
};

// Excludes transfer categories (savings, debt payments). Those are money
// moving between your own pots, not consumption — leaving them in makes
// "Savings" the largest slice of every disciplined user's spending pie,
// which is both useless and actively discouraging.
export const selectSpendingByCategory = (transactions) => {
  const map = {};
  transactions
    .filter((t) => t.amount < 0 && !TRANSFER_CATEGORY_IDS.includes(t.category))
    .forEach((t) => {
      map[t.category] = (map[t.category] || 0) + Math.abs(t.amount);
    });
  return map;
};

export const selectSpendingThisMonth = (transactions) => {
  const currentMonth = new Date().toISOString().slice(0, 7);
  return selectSpendingByCategory(transactions.filter((t) => t.date.slice(0, 7) === currentMonth));
};

export const selectGoalTotals = (goals) => {
  const totalSaved = goals.reduce((sum, g) => sum + g.currentAmount, 0);
  const totalTarget = goals.reduce((sum, g) => sum + g.targetAmount, 0);
  return {
    totalSaved,
    totalTarget,
    progress: totalTarget > 0 ? totalSaved / totalTarget : 0,
    completed: goals.filter((g) => g.currentAmount >= g.targetAmount).length,
  };
};

export const selectDebtTotals = (debts) => {
  const totalBalance = debts.reduce((sum, d) => sum + d.balance, 0);
  const totalInitial = debts.reduce((sum, d) => sum + d.initialBalance, 0);
  const totalMinimum = debts.reduce((sum, d) => sum + d.minimumPayment, 0);
  return {
    totalBalance,
    totalInitial,
    totalMinimum,
    // How much of the original debt is gone. 1 = debt free.
    payoffProgress: totalInitial > 0 ? (totalInitial - totalBalance) / totalInitial : 0,
  };
};

export const selectUnreadCount = (notifications) => notifications.filter((n) => !n.read).length;

// Filters transactions to a date window. `days: null` means all time.
export const selectInRange = (transactions, days) => {
  if (!days) return transactions;
  const cutoff = new Date();
  cutoff.setHours(0, 0, 0, 0);
  cutoff.setDate(cutoff.getDate() - (days - 1));
  const cutoffISO = new Date(cutoff.getTime() - cutoff.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  return transactions.filter((t) => t.date >= cutoffISO);
};