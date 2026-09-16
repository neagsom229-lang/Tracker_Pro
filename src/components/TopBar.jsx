import { Plus } from 'lucide-react';
import { useStore } from '../store/useStore';
import NotificationBell from './NotificationBell';

const TITLES = {
  dashboard: 'Dashboard',
  transactions: 'Transactions',
  budgets: 'Budgets',
  recurring: 'Recurring',
  export: 'Export Data',
  billing: 'Billing',
  admin: 'Admin — Payments',
};

const HIDE_ADD_BUTTON_ON = ['billing', 'export', 'admin'];

export default function TopBar({ activeView }) {
  const openTransactionModal = useStore((s) => s.openTransactionModal);
  const showAddButton = !HIDE_ADD_BUTTON_ON.includes(activeView);

  return (
    <div className="flex items-center justify-between mb-6">
      <h1 className="text-2xl font-semibold text-slate-50 tracking-tight">{TITLES[activeView]}</h1>
      <div className="flex items-center gap-3">
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