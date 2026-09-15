import { motion } from 'framer-motion';
import {
  LayoutGrid, ArrowLeftRight, PiggyBank, Target, Landmark, Repeat, Download, LogOut, Gem, CreditCard,
} from 'lucide-react';
import { useStore } from '../store/useStore';
import { useProStatus } from '../hooks/useProStatus';

export const NAV_ITEMS = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutGrid },
  { id: 'transactions', label: 'Transactions', icon: ArrowLeftRight },
  { id: 'budgets', label: 'Budgets', icon: PiggyBank, pro: true },
  { id: 'goals', label: 'Goals', icon: Target, pro: true },
  { id: 'debts', label: 'Debts', icon: Landmark, pro: true },
  { id: 'recurring', label: 'Recurring', icon: Repeat, pro: true },
  { id: 'export', label: 'Export Data', icon: Download, pro: true },
  { id: 'billing', label: 'Billing', icon: CreditCard },
];

export default function Sidebar({ activeView, onNavigate }) {
  const session = useStore((s) => s.session);
  const profile = useStore((s) => s.profile);
  const logout = useStore((s) => s.logout);
  const openUpgradeModal = useStore((s) => s.openUpgradeModal);
  const { isPro } = useProStatus(); // sourced from the `subscriptions` table, not local state
  const displayName = profile?.displayName || session?.email?.split('@')[0] || 'Guest';

  const handleClick = (item) => {
    if (item.pro && !isPro) {
      openUpgradeModal(item.label.toLowerCase());
      return;
    }
    onNavigate(item.id);
  };

  return (
    <aside className="hidden md:flex md:w-64 flex-col justify-between glass-strong border-r border-white/5 p-5 h-screen sticky top-0">
      <div>
        <div className="flex items-center gap-2 px-2 mb-8">
          <div className="w-8 h-8 rounded-lg bg-gilt-gradient flex items-center justify-center">
            <Gem size={16} className="text-obsidian-950" strokeWidth={2.5} />
          </div>
          <span className="text-lg font-semibold tracking-tight">Obsidian</span>
        </div>

        <nav className="flex flex-col gap-1">
          {NAV_ITEMS.map((item) => {
            const active = activeView === item.id;
            return (
              <button
                key={item.id}
                onClick={() => handleClick(item)}
                aria-current={active ? 'page' : undefined}
                className={`relative flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-colors text-left
                  ${active ? 'text-slate-50' : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'}`}
              >
                {active && (
                  <motion.div
                    layoutId="sidebar-active"
                    className="absolute inset-0 bg-white/8 rounded-xl border border-white/10"
                    transition={{ type: 'spring', stiffness: 350, damping: 30 }}
                  />
                )}
                <item.icon size={18} className="relative z-10" strokeWidth={2} />
                <span className="relative z-10 flex-1">{item.label}</span>
                {item.pro && !isPro && (
                  <span className="relative z-10 text-[10px] px-1.5 py-0.5 rounded-md gilt-text border border-gilt-gold/30 font-semibold">
                    PRO
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </div>

      <div className="flex items-center gap-3 px-2 pt-4 border-t border-white/5">
        <div className="w-9 h-9 rounded-full bg-obsidian-700 flex items-center justify-center text-sm font-medium text-slate-200">
          {displayName[0]?.toUpperCase() || '?'}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm text-slate-200 truncate">{displayName}</p>
          <p className="text-xs text-slate-500 truncate">{isPro ? 'Pro Member' : 'Free Plan'}</p>
        </div>
        <button
          onClick={logout}
          aria-label="Log out"
          className="text-slate-500 hover:text-slate-200 transition-colors p-1.5"
        >
          <LogOut size={16} />
        </button>
      </div>
    </aside>
  );
}