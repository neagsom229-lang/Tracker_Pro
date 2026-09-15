import { useEffect, useState, lazy, Suspense } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Gem, AlertCircle, RefreshCw } from 'lucide-react';
import { Toaster, toast } from 'react-hot-toast';
import { useStore } from './store/useStore';
import { refreshUntilPro, useProStatus } from './hooks/useProStatus';
import AuthScreen from './components/AuthScreen';
import ResetPasswordScreen from './components/ResetPasswordScreen';
import Sidebar from './components/Sidebar';
import TopBar from './components/TopBar';
import MobileNav from './components/MobileNav';
import TransactionModal from './components/TransactionModal';
import UpgradeModal from './components/UpgradeModal';
import InstallPrompt from './components/InstallPrompt';
import DashboardSkeleton from './components/skeletons/DashboardSkeleton';
import TransactionListSkeleton from './components/skeletons/TransactionListSkeleton';

// Route-level code splitting: each view panel becomes its own JS chunk,
// fetched only the first time the user actually navigates to it, instead
// of all six shipping in the initial bundle. This matters most for:
//  - Dashboard, which pulls in recharts (a genuinely large dependency)
//  - Budgets / Recurring / Export, which are Pro-only — a free user who
//    never upgrades never downloads that code at all
// TransactionModal and UpgradeModal are deliberately NOT lazy: they're
// used from every view (the "Add Transaction" button lives in TopBar
// across the whole app) and are small, so splitting them would only add
// a Suspense-fallback flicker on a frequent interaction for no real
// bundle-size win.
//
// AuthScreen and ResetPasswordScreen are also NOT lazy on purpose: they
// are the first thing a logged-out visitor sees, so a Suspense fallback
// there would mean a second spinner right after the auth spinner.
const Dashboard = lazy(() => import('./components/Dashboard'));
const TransactionList = lazy(() => import('./components/TransactionList'));
const BudgetProgress = lazy(() => import('./components/BudgetProgress'));
const RecurringManager = lazy(() => import('./components/RecurringManager'));
const ExportPanel = lazy(() => import('./components/ExportPanel'));
const BillingPanel = lazy(() => import('./components/BillingPanel'));
const GoalManager = lazy(() => import('./components/GoalManager'));
const DebtManager = lazy(() => import('./components/DebtManager'));

function LoadingScreen() {
  return (
    <div className="min-h-screen flex items-center justify-center" role="status" aria-live="polite">
      <motion.div
        animate={{ opacity: [0.4, 1, 0.4] }}
        transition={{ repeat: Infinity, duration: 1.4 }}
        className="w-10 h-10 rounded-xl bg-gilt-gradient flex items-center justify-center"
      >
        <Gem size={18} className="text-obsidian-950" />
      </motion.div>
      <span className="sr-only">Checking your session…</span>
    </div>
  );
}

function DataErrorScreen({ message, onRetry }) {
  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="glass-strong rounded-3xl p-8 max-w-sm text-center shadow-glass">
        <div className="w-12 h-12 rounded-2xl bg-expense-soft flex items-center justify-center mx-auto mb-5">
          <AlertCircle size={22} className="text-expense" />
        </div>
        <h1 className="text-lg font-semibold text-slate-50 mb-1">Couldn't reach your data</h1>
        <p className="text-sm text-slate-400 mb-6">{message}</p>
        <button onClick={onRetry} className="gilt-btn rounded-xl px-5 py-2.5 text-sm w-full flex items-center justify-center gap-2">
          <RefreshCw size={15} /> Try again
        </button>
      </div>
    </div>
  );
}

// Views that render their OWN skeleton while `dataLoading` is true get
// listed here; simpler views (budgets/recurring/export/billing) just wait
// for the generic LoadingScreen since they're short, list-shaped panels
// that don't benefit as much from a bespoke skeleton.
const VIEWS = {
  dashboard: Dashboard,
  transactions: () => <TransactionList />,
  budgets: BudgetProgress,
  goals: GoalManager,
  debts: DebtManager,
  recurring: RecurringManager,
  export: ExportPanel,
  billing: BillingPanel,
};

// Views the user can only reach on the Pro plan. Kept here rather than
// only in the nav components because nav is not a security boundary: a
// stale `activeView` (say, a Pro user whose subscription lapses while the
// tab is open) would otherwise keep rendering a paid panel indefinitely.
const PRO_VIEWS = ['budgets', 'goals', 'debts', 'recurring', 'export'];

export default function App() {
  const session = useStore((s) => s.session);
  const authLoading = useStore((s) => s.authLoading);
  const recoveryMode = useStore((s) => s.recoveryMode);
  const dataLoading = useStore((s) => s.dataLoading);
  const dataError = useStore((s) => s.dataError);
  const initAuth = useStore((s) => s.initAuth);
  const initData = useStore((s) => s.initData);
  const { isPro, loading: proLoading } = useProStatus();

  const [activeView, setActiveView] = useState('dashboard');

  useEffect(() => {
    initAuth();
  }, [initAuth]);

  // ---- Stripe return flow -------------------------------------------
  //
  // The Payment Link is configured (in the Stripe Dashboard, not in
  // code — see README) to redirect back to /dashboard?success=true once
  // payment completes. Two things have to be true for Pro to unlock
  // without a manual refresh:
  //
  //  1. vercel.json rewrites /(.*) to /index.html, so the /dashboard
  //     path loads this SPA rather than 404ing. (Already in place.)
  //  2. The `subscriptions` row has to actually exist by the time we
  //     read it — and it's written by the Stripe *webhook*, which is a
  //     separate request racing this redirect. A single refetch fired
  //     the instant the page loads will often lose that race and leave
  //     the user staring at a locked Pro UI after paying.
  //
  // So instead of one refetch, poll with a short backoff until the row
  // shows an active status (or we give up and let the Realtime
  // subscription in useProStatus deliver it whenever it lands).
  useEffect(() => {
    if (!session) return;

    const params = new URLSearchParams(window.location.search);
    const paid = params.get('success') === 'true';
    const canceled = params.get('canceled') === 'true';
    if (!paid && !canceled) return;

    // Strip the flag immediately so a refresh (or this effect re-running
    // on any later session change) can't replay the toast.
    window.history.replaceState({}, '', window.location.pathname);

    if (canceled) {
      toast('Checkout canceled — no charge was made.', { icon: '👋' });
      return;
    }

    let cancelled = false;
    const toastId = toast.loading('Confirming your payment…');

    (async () => {
      const unlocked = await refreshUntilPro();
      if (cancelled) return;
      toast.dismiss(toastId);
      if (unlocked) {
        toast.success('Payment received — welcome to Pro!');
      } else {
        // Stripe took the money but the webhook hasn't landed yet.
        // useProStatus' Realtime channel will flip the UI the moment it
        // does, so this is informational, not an error.
        toast('Payment received. Pro will unlock in a moment.', { icon: '⏳', duration: 6000 });
      }
    })();

    return () => {
      cancelled = true;
      toast.dismiss(toastId);
    };
  }, [session]);

  // ---- Redirect logic ------------------------------------------------
  // Order matters. Recovery is checked BEFORE the session check because
  // a password-reset link signs the user in with a short-lived recovery
  // session — without this branch they'd be dropped straight onto the
  // dashboard with no way to actually set a new password.
  if (authLoading) return <LoadingScreen />;
  if (recoveryMode) return <ResetPasswordScreen />;
  if (!session) return <AuthScreen />;
  if (dataError) return <DataErrorScreen message={dataError} onRetry={initData} />;

  // Fall back to the dashboard if the current view is Pro-gated and the
  // user isn't (or no longer is) Pro. `proLoading` is checked so the
  // first render — before the subscription row has come back — doesn't
  // bounce a genuine Pro user off the page they just opened.
  const effectiveView = !proLoading && PRO_VIEWS.includes(activeView) && !isPro ? 'dashboard' : activeView;
  const ActiveComponent = VIEWS[effectiveView];

  return (
    <div className="min-h-screen flex">
      <Toaster
        position="top-right"
        toastOptions={{
          style: { background: '#13141B', color: '#E2E8F0', border: '1px solid rgba(255,255,255,0.08)' },
        }}
      />
      <Sidebar activeView={effectiveView} onNavigate={setActiveView} />

      <main className="flex-1 p-5 md:p-8 pb-28 md:pb-8 max-w-6xl mx-auto w-full">
        <TopBar activeView={effectiveView} />

        {dataLoading ? (
          effectiveView === 'dashboard' ? <DashboardSkeleton /> : <TransactionListSkeleton />
        ) : (
          <Suspense fallback={effectiveView === 'dashboard' ? <DashboardSkeleton /> : <TransactionListSkeleton />}>
            <AnimatePresence mode="wait">
              <motion.div
                key={effectiveView}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.25 }}
              >
                <ActiveComponent onNavigate={setActiveView} />
              </motion.div>
            </AnimatePresence>
          </Suspense>
        )}
      </main>

      <MobileNav activeView={effectiveView} onNavigate={setActiveView} />
      <TransactionModal />
      <UpgradeModal />
      <InstallPrompt />
    </div>
  );
}