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
// fetches of the same data. This flag makes only the first of the two
// actually trigger a fetch; every subsequent real sign-in (after an
// explicit sign-out) still works normally since `initAuth` isn't
// re-run per sign-in — `hasInitializedData` only needs to guard this
// one startup race, not every future auth transition.
let hasInitializedData = false;

export const useStore = create((set, get) => ({
  // ---------------- Auth ----------------
  session: null, // Supabase `user` object once signed in, else null
  authLoading: true,
  // True for the window between the user clicking a "reset your
  // password" email link and them actually setting a new password.
  // Supabase treats that click as a real sign-in (it sets a genuine
  // session so `updateUser({ password })` has something to act on), so
  // without this flag the normal `session` check in App.jsx would drop
  // the user straight into the Dashboard on a temporary recovery
  // session, instead of prompting them to actually set a new password.
  isPasswordRecovery: false,
  clearPasswordRecovery: () => set({ isPasswordRecovery: false }),

  initAuth: () => {
    const initDataOnce = () => {
      if (hasInitializedData) return;
      hasInitializedData = true;
      get().initData();
    };

    // 1. Check for an existing session on first load (e.g. page refresh).
    supabase.auth.getSession().then(({ data: { session } }) => {
      set({ session: session?.user ?? null, authLoading: false });
      if (session?.user) initDataOnce();
    });

    // 2. Subscribe to ALL future auth changes: login, logout, token
    // refresh, the redirect-back from Google OAuth, and password
    // recovery. This one listener is what makes AuthScreen's Supabase
    // calls "just work" without it needing to touch the store directly.
    supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') set({ isPasswordRecovery: true });

      const user = session?.user ?? null;
      const wasLoggedOut = !get().session;
      set({ session: user, authLoading: false });
      if (user && wasLoggedOut) initDataOnce();
      if (!user) {
        // A real sign-out: reset the guard so a fresh sign-in (by the
        // same or a different user, in the same tab) fetches again.
        hasInitializedData = false;
        set({ transactions: [], budgets: {}, recurring: [], profile: null, bankConnections: [], notifications: [] });
      }
    });
  },

  logout: async () => {
    await supabase.auth.signOut();
  },

  // ---------------- Core data ----------------
  transactions: [],
  budgets: {}, // { [categoryId]: monthlyLimitUSD }
  recurring: [], // [{ id, description, amount, category, frequency, nextRunDate }]
  profile: null, // { currency, displayName } — account settings only, not billing
  bankConnections: [], // [{ id, institutionName, status, lastSyncedAt }] — never the access token itself
  dataLoading: true,
  dataError: null,

  initData: async () => {
    const userId = get().session?.id;
    if (!userId) return;
    set({ dataLoading: true, dataError: null });
    try {
      const [transactions, budgets, recurring, profile, bankConnections, notifications] = await Promise.all([
        dataProvider.getTransactions(userId),
        dataProvider.getBudgets(userId),
        dataProvider.getRecurring(userId),
        dataProvider.getProfile(userId),
        dataProvider.getBankConnections(userId),
        dataProvider.getNotifications(userId),
      ]);
      set({ transactions, budgets, recurring, profile, bankConnections, notifications, dataLoading: false });
      get().processRecurring();
    } catch (err) {
      // Network failure or RLS/config issue — surface it instead of
      // leaving the UI stuck on a blank loading screen forever.
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
      set({ transactions: previous }); // roll back to the exact pre-edit state
      toast.error(err.message);
    }
  },

  deleteTransaction: async (id) => {
    // Capture the specific removed transaction, not just "the array
    // before" — see the comment above addTransaction's tempId pattern.
    // If this delete is in flight at the same moment something else
    // legitimately changes `transactions` (a Realtime bank-sync insert
    // landing, another tab adding a transaction, AI Quick Add
    // resolving), restoring a stale full-array snapshot on failure
    // would silently erase that OTHER, successful change too — the
    // user would watch a transaction they just added vanish, for a
    // reason completely unrelated to it. Removing/restoring only this
    // one row composes safely with whatever else is happening.
    const removed = get().transactions.find((t) => t.id === id);
    set({ transactions: get().transactions.filter((t) => t.id !== id) });
    try {
      await dataProvider.deleteTransaction(id);
      toast.success('Transaction deleted.');
    } catch (err) {
      if (removed) {
        // Re-insert and re-sort rather than assume position 0 — another
        // transaction could have been added in the interim, and the
        // list's invariant (newest first) should hold regardless.
        set({ transactions: [...get().transactions, removed].sort((a, b) => (a.date < b.date ? 1 : -1)) });
      }
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
    const removedLimit = get().budgets[categoryId]; // capture just this key's value
    const updated = { ...get().budgets };
    delete updated[categoryId];
    set({ budgets: updated });
    try {
      await dataProvider.removeBudget(userId, categoryId);
      toast.success('Budget removed.');
    } catch (err) {
      // Merge the one key back into whatever `budgets` looks like NOW,
      // not a stale snapshot — same reasoning as deleteTransaction above:
      // a concurrent setBudget() on a different category shouldn't be
      // undone by this failure.
      set({ budgets: { ...get().budgets, [categoryId]: removedLimit } });
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
    const removed = get().recurring.find((r) => r.id === id);
    set({ recurring: get().recurring.filter((r) => r.id !== id) });
    try {
      await dataProvider.removeRecurring(id);
      toast.success('Recurring rule removed.');
    } catch (err) {
      if (removed) set({ recurring: [...get().recurring, removed] });
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

  // ---------------- Notifications ----------------
  // Initial list loaded once by initData(); useNotifications.js keeps it
  // live afterward via a Realtime INSERT subscription that calls
  // receiveNotification() as new rows land (e.g. from a budget-exceeded
  // or recurring-due check running server-side).
  notifications: [],

  receiveNotification: (notification) =>
    set((state) => {
      // Realtime can occasionally redeliver an event (e.g. a brief
      // reconnect); de-dupe by id rather than trusting "exactly once."
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