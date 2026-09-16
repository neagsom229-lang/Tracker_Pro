import { useEffect, useState, lazy, Suspense } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Gem, AlertCircle, RefreshCw } from 'lucide-react';
import { Toaster, toast } from 'react-hot-toast';
import { useStore } from './store/useStore';
import { useProStatus } from './hooks/useProStatus';
import AuthScreen from './components/AuthScreen';
import ResetPasswordScreen from './components/ResetPasswordScreen';
import Sidebar from './components/Sidebar';
import TopBar from './components/TopBar';
import MobileNav from './components/MobileNav';
import TransactionModal from './components/TransactionModal';
import UpgradeModal from './components/UpgradeModal';
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
const Dashboard = lazy(() => import('./components/Dashboard'));
const TransactionList = lazy(() => import('./components/TransactionList'));
const BudgetProgress = lazy(() => import('./components/BudgetProgress'));
const RecurringManager = lazy(() => import('./components/RecurringManager'));
const ExportPanel = lazy(() => import('./components/ExportPanel'));
const BillingPanel = lazy(() => import('./components/BillingPanel'));
const AdminPaymentsPanel = lazy(() => import('./components/AdminPaymentsPanel'));

function LoadingScreen() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <motion.div
        animate={{ opacity: [0.4, 1, 0.4] }}
        transition={{ repeat: Infinity, duration: 1.4 }}
        className="w-10 h-10 rounded-xl bg-gilt-gradient flex items-center justify-center"
      >
        <Gem size={18} className="text-obsidian-950" />
      </motion.div>
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
  recurring: RecurringManager,
  export: ExportPanel,
  billing: BillingPanel,
  // Not access-controlled here — a non-admin manually forcing activeView
  // to 'admin' would just see an empty list, since RLS ("Admins can view
  // all manual payments") only returns other users' rows to profiles
  // with is_admin = true, and review-manual-payment independently
  // re-checks is_admin server-side before approving anything. The
  // Sidebar nav item is hidden from non-admins for UX, not security.
  admin: AdminPaymentsPanel,
};

export default function App() {
  const session = useStore((s) => s.session);
  const authLoading = useStore((s) => s.authLoading);
  const isPasswordRecovery = useStore((s) => s.isPasswordRecovery);
  const dataLoading = useStore((s) => s.dataLoading);
  const dataError = useStore((s) => s.dataError);
  const initAuth = useStore((s) => s.initAuth);
  const initData = useStore((s) => s.initData);
  const { refresh: refreshProStatus } = useProStatus();

  const [activeView, setActiveView] = useState('dashboard');

  useEffect(() => {
    initAuth();
  }, [initAuth]);

  // The Stripe Payment Link is configured (in the Stripe Dashboard, not
  // in code — see README) to redirect back here with `?success=true`
  // once payment completes. The webhook usually lands within a second or
  // two of that redirect, and useProStatus()'s Realtime subscription
  // will pick it up on its own — but we also force one explicit refetch
  // right here so the "Welcome to Pro" toast and unlocked UI show up
  // immediately instead of waiting on Realtime's round trip.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('success') === 'true' && session) {
      refreshProStatus().then(() => toast.success('Payment received — welcome to Pro!'));
      params.delete('success');
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, [session, refreshProStatus]);

  if (authLoading) return <LoadingScreen />;
  // Checked BEFORE the normal `!session` gate: a password-recovery link
  // click gives the user a real session (see the comment on
  // isPasswordRecovery in useStore.js), so without this check they'd
  // skip straight to the Dashboard instead of being asked to actually
  // set a new password.
  if (isPasswordRecovery) return <ResetPasswordScreen />;
  if (!session) return <AuthScreen />;
  if (dataError) return <DataErrorScreen message={dataError} onRetry={initData} />;

  const ActiveComponent = VIEWS[activeView];

  return (
    <div className="min-h-screen flex">
      <Toaster
        position="top-right"
        toastOptions={{
          style: { background: '#13141B', color: '#E2E8F0', border: '1px solid rgba(255,255,255,0.08)' },
        }}
      />
      <Sidebar activeView={activeView} onNavigate={setActiveView} />

      <main className="flex-1 p-5 md:p-8 pb-24 md:pb-8 max-w-6xl mx-auto w-full">
        <TopBar activeView={activeView} />

        {dataLoading ? (
          activeView === 'dashboard' ? <DashboardSkeleton /> : <TransactionListSkeleton />
        ) : (
          <Suspense fallback={activeView === 'dashboard' ? <DashboardSkeleton /> : <TransactionListSkeleton />}>
            <AnimatePresence mode="wait">
              <motion.div
                key={activeView}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.25 }}
              >
                <ActiveComponent />
              </motion.div>
            </AnimatePresence>
          </Suspense>
        )}
      </main>

      <MobileNav activeView={activeView} onNavigate={setActiveView} />
      <TransactionModal />
      <UpgradeModal />
    </div>
  );
}