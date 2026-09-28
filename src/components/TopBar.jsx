import { Plus, Sun, Moon } from 'lucide-react';
import { useStore } from '../store/useStore';
import NotificationBell from './NotificationBell';

const TITLES = {
  dashboard: 'Dashboard',
  transactions: 'Transactions',
  budgets: 'Budgets',
  recurring: 'Recurring',
  goals: 'Savings Goals',
  debts: 'Debt Manager',
  export: 'Export Data',
  billing: 'Billing',
  admin: 'Admin — Payments',
};

const HIDE_ADD_BUTTON_ON = ['billing', 'export', 'admin', 'goals', 'debts'];

export default function TopBar({ activeView }) {
  const openTransactionModal = useStore((s) => s.openTransactionModal);
  const theme = useStore((s) => s.theme);
  const setTheme = useStore((s) => s.setTheme);
  const showAddButton = !HIDE_ADD_BUTTON_ON.includes(activeView);

  const toggleTheme = () => {
    setTheme(theme === 'dark' ? 'light' : 'dark');
  };

  return (
    <div className="flex items-center justify-between mb-6">
      <h1 className="text-2xl font-semibold text-slate-50 tracking-tight">{TITLES[activeView] || 'Dashboard'}</h1>
      <div className="flex items-center gap-3">
        <button
          onClick={toggleTheme}
          aria-label="Toggle theme"
          className="p-2 rounded-xl text-slate-400 hover:text-slate-200 hover:bg-white/5 transition-colors"
        >
          {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
        </button>
        <NotificationBell />
        {showAddButton && (
          <button
            onClick={() => openTransactionModal()}
            className="gilt-btn rounded-xl px-4 py-2.5 text-sm flex items-center gap-2"
          >
            <Plus size={16} /> Add Transaction
          </button>
        )}
      </div>
    </div>
  );
}
