import { LayoutGrid, ArrowLeftRight, PiggyBank, Repeat, CreditCard } from 'lucide-react';
import { useStore } from '../store/useStore';
import { useProStatus } from '../hooks/useProStatus';

// Export is reachable from the desktop sidebar and from Billing on
// mobile to keep the bottom nav to five items max (a common mobile UX
// ceiling before it feels cramped).
const NAV_ITEMS = [
  { id: 'dashboard', label: 'Home', icon: LayoutGrid },
  { id: 'transactions', label: 'History', icon: ArrowLeftRight },
  { id: 'budgets', label: 'Budgets', icon: PiggyBank, pro: true },
  { id: 'recurring', label: 'Recurring', icon: Repeat, pro: true },
  { id: 'billing', label: 'Billing', icon: CreditCard },
];

export default function MobileNav({ activeView, onNavigate }) {
  const openUpgradeModal = useStore((s) => s.openUpgradeModal);
  const { isPro } = useProStatus();

  const handleClick = (item) => {
    if (item.pro && !isPro) return openUpgradeModal(item.label.toLowerCase());
    onNavigate(item.id);
  };

  return (
    <nav className="md:hidden fixed bottom-0 inset-x-0 z-30 glass-strong border-t border-white/5 flex justify-around py-2 px-1">
      {NAV_ITEMS.map((item) => {
        const active = activeView === item.id;
        return (
          <button
            key={item.id}
            onClick={() => handleClick(item)}
            className={`flex flex-col items-center gap-1 px-2 py-1 text-[10px] ${
              active ? 'text-slate-100' : 'text-slate-500'
            }`}
          >
            <item.icon size={18} />
            {item.label}
          </button>
        );
      })}
    </nav>
  );
}
