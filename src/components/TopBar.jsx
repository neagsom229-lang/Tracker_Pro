import { Plus } from 'lucide-react';
import { useStore } from '../store/useStore';
import NotificationBell from './Notificationbell';

const TITLES = {
  dashboard: 'Dashboard',
  transactions: 'Transactions',
  budgets: 'Budgets',
  goals: 'Savings Goals',
  debts: 'Debts',
  recurring: 'Recurring',
  export: 'Export Data',
  billing: 'Billing',
};

// Views where "Add Transaction" is the wrong primary action, because each
// has its own more specific one (add a goal, add a debt, manage billing).
const HIDE_ADD_BUTTON_ON = ['billing', 'export', 'goals', 'debts'];

export default function TopBar({ activeView }) {
  const openTransactionModal = useStore((s) => s.openTransactionModal);
  const showAddButton = !HIDE_ADD_BUTTON_ON.includes(activeView);

  return (
    <div className="flex items-center justify-between mb-6 gap-3">
      <h1 className="text-xl sm:text-2xl font-semibold text-slate-50 tracking-tight truncate">
        {TITLES[activeView]}
      </h1>
      <div className="flex items-center gap-2 shrink-0">
        <NotificationBell />
        {showAddButton && (
          <button
            onClick={() => openTransactionModal()}
            className="gilt-btn rounded-xl px-3 sm:px-4 py-2.5 text-sm flex items-center gap-2"
          >
            <Plus size={16} />
            {/* Label collapses on phones so the bell, title and button all
                fit on one row at 375px. */}
            <span className="hidden sm:inline">Add Transaction</span>
          </button>
        )}
      </div>
    </div>
  );
}