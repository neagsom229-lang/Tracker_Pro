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
    <nav
      aria-label="Primary"
      // pb-[env(safe-area-inset-bottom)] keeps the labels clear of the
      // home indicator on notched iPhones — without it, the bottom row
      // of text sits underneath the system gesture bar on iPhone X and
      // later. (It resolves to 0 everywhere else, so it's free.)
      className="md:hidden fixed bottom-0 inset-x-0 z-30 glass-strong border-t border-white/5 flex justify-around pt-2 px-1 pb-[max(0.5rem,env(safe-area-inset-bottom))]"
    >
      {NAV_ITEMS.map((item) => {
        const active = activeView === item.id;
        return (
          <button
            key={item.id}
            onClick={() => handleClick(item)}
            aria-current={active ? 'page' : undefined}
            // min-w-0 + truncate so five labels can never force the bar
            // to overflow horizontally at 320–375px; min-h-[44px] meets
            // the iOS minimum tap-target size.
            className={`flex flex-col items-center justify-center gap-1 flex-1 min-w-0 min-h-[44px] px-1 text-[10px] transition-colors ${
              active ? 'text-slate-100' : 'text-slate-500'
            }`}
          >
            <item.icon size={18} className="shrink-0" />
            <span className="truncate max-w-full">{item.label}</span>
          </button>
        );
      })}
    </nav>
  );
}