import { useEffect, lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom';
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
import CommandPalette from './components/CommandPalette';
import DashboardSkeleton from './components/skeletons/DashboardSkeleton';
import TransactionListSkeleton from './components/skeletons/TransactionListSkeleton';

const Dashboard = lazy(() => import('./components/Dashboard'));
const TransactionList = lazy(() => import('./components/TransactionList'));
const BudgetProgress = lazy(() => import('./components/BudgetProgress'));
const RecurringManager = lazy(() => import('./components/RecurringManager'));
const GoalManager = lazy(() => import('./components/GoalManager'));
const DebtManager = lazy(() => import('./components/DebtManager'));
const ExportPanel = lazy(() => import('./components/ExportPanel'));
const BillingPanel = lazy(() => import('./components/BillingPanel'));
const AdminPaymentsPanel = lazy(() => import('./components/AdminPaymentsPanel'));

function LoadingScreen() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-obsidian-950">
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
    <div className="min-h-screen flex items-center justify-center p-6 bg-obsidian-950">
      <div className="glass-strong rounded-3xl p-8 max-w-sm text-center shadow-glass">
        <div className="w-12 h-12 rounded-2xl bg-expense-soft flex items-center justify-center mx-auto mb-5">
          <AlertCircle size={22} className="text-expense" />
        </div>
        <h1 className="text-lg font-semibold text-slate-50 mb-1">Couldn&apos;t reach your data</h1>
        <p className="text-sm text-slate-400 mb-6">{message}</p>
        <button onClick={onRetry} className="gilt-btn rounded-xl px-5 py-2.5 text-sm w-full flex items-center justify-center gap-2">
          <RefreshCw size={15} /> Try again
        </button>
      </div>
    </div>
  );
}

function AppContent() {
  const session = useStore((s) => s.session);
  const authLoading = useStore((s) => s.authLoading);
  const isPasswordRecovery = useStore((s) => s.isPasswordRecovery);
  const dataLoading = useStore((s) => s.dataLoading);
  const dataError = useStore((s) => s.dataError);
  const initAuth = useStore((s) => s.initAuth);
  const initData = useStore((s) => s.initData);
  const { refresh: refreshProStatus } = useProStatus();
  const location = useLocation();
  const navigate = useNavigate();

  const activeView = location.pathname.replace('/', '') || 'dashboard';

  useEffect(() => {
    initAuth();
  }, [initAuth]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('success') === 'true' && session) {
      refreshProStatus().then(() => toast.success('Payment received — welcome to Pro!'));
      params.delete('success');
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, [session, refreshProStatus]);

  useEffect(() => {
    const handleNavigate = (e) => navigate(`/${e.detail}`);
    window.addEventListener('obsidian:navigate', handleNavigate);
    return () => window.removeEventListener('obsidian:navigate', handleNavigate);
  }, [navigate]);

  if (authLoading) return <LoadingScreen />;
  if (isPasswordRecovery) return <ResetPasswordScreen />;
  if (!session) return <AuthScreen />;
  if (dataError) return <DataErrorScreen message={dataError} onRetry={initData} />;

  return (
    <div className="min-h-screen flex bg-obsidian-950 text-slate-100">
      <Toaster
        position="top-right"
        toastOptions={{
          style: { background: '#13141B', color: '#E2E8F0', border: '1px solid rgba(255,255,255,0.08)' },
        }}
      />
      <Sidebar />

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
                <Routes>
                  <Route path="/dashboard" element={<Dashboard />} />
                  <Route path="/transactions" element={<TransactionList />} />
                  <Route path="/budgets" element={<BudgetProgress />} />
                  <Route path="/recurring" element={<RecurringManager />} />
                  <Route path="/goals" element={<GoalManager />} />
                  <Route path="/debts" element={<DebtManager />} />
                  <Route path="/export" element={<ExportPanel />} />
                  <Route path="/billing" element={<BillingPanel />} />
                  <Route path="/admin" element={<AdminPaymentsPanel />} />
                  <Route path="*" element={<Navigate to="/dashboard" replace />} />
                </Routes>
              </motion.div>
            </AnimatePresence>
          </Suspense>
        )}
      </main>

      <MobileNav />
      <TransactionModal />
      <UpgradeModal />
      <CommandPalette />
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AppContent />
    </BrowserRouter>
  );
}
