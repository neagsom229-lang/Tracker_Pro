import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { LayoutGrid, ArrowLeftRight, Target, Landmark, MoreHorizontal, PiggyBank, Repeat, Download, CreditCard } from 'lucide-react';
import { useStore } from '../store/useStore';
import { useProStatus } from '../hooks/useProStatus';
import { useEscapeKey } from '../hooks/useEscapeKey';

/**
 * Bottom nav holds four destinations plus "More".
 *
 * The app now has eight views and a bottom bar tops out at five items
 * before labels become unreadable at 375px. Rather than hiding three
 * views from phone users entirely — which is what simply adding Goals
 * and Debts to the old five-item bar would have done to Budgets,
 * Recurring and Export — the fifth slot opens a sheet with everything
 * that didn't fit.
 */
const PRIMARY_ITEMS = [
  { id: 'dashboard', label: 'Home', icon: LayoutGrid },
  { id: 'transactions', label: 'History', icon: ArrowLeftRight },
  { id: 'goals', label: 'Goals', icon: Target, pro: true },
  { id: 'debts', label: 'Debts', icon: Landmark, pro: true },
];

const MORE_ITEMS = [
  { id: 'budgets', label: 'Budgets', icon: PiggyBank, pro: true },
  { id: 'recurring', label: 'Recurring', icon: Repeat, pro: true },
  { id: 'export', label: 'Export Data', icon: Download, pro: true },
  { id: 'billing', label: 'Billing', icon: CreditCard },
];

export default function MobileNav({ activeView, onNavigate }) {
  const openUpgradeModal = useStore((s) => s.openUpgradeModal);
  const { isPro } = useProStatus();
  const [moreOpen, setMoreOpen] = useState(false);

  useEscapeKey(moreOpen, () => setMoreOpen(false));

  const go = (item) => {
    setMoreOpen(false);
    if (item.pro && !isPro) return openUpgradeModal(item.label.toLowerCase());
    onNavigate(item.id);
  };

  const moreActive = MORE_ITEMS.some((i) => i.id === activeView);

  return (
    <>
      <AnimatePresence>
        {moreOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setMoreOpen(false)}
              className="md:hidden fixed inset-0 bg-obsidian-950/70 backdrop-blur-sm z-40"
            />
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', stiffness: 400, damping: 36 }}
              role="dialog"
              aria-label="More destinations"
              className="md:hidden fixed bottom-0 inset-x-0 z-50 glass-strong rounded-t-3xl border-t border-white/8 p-4 pb-[max(1rem,env(safe-area-inset-bottom))]"
            >
              <div className="w-10 h-1 rounded-full bg-white/15 mx-auto mb-4" />
              {MORE_ITEMS.map((item) => (
                <button
                  key={item.id}
                  onClick={() => go(item)}
                  className={`w-full flex items-center gap-3 px-3 py-3.5 rounded-xl text-sm transition-colors ${
                    activeView === item.id ? 'text-slate-50 bg-white/8' : 'text-slate-300 hover:bg-white/5'
                  }`}
                >
                  <item.icon size={18} />
                  <span className="flex-1 text-left">{item.label}</span>
                  {item.pro && !isPro && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded-md gilt-text border border-gilt-gold/30 font-semibold">
                      PRO
                    </span>
                  )}
                </button>
              ))}
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <nav
        aria-label="Primary"
        className="md:hidden fixed bottom-0 inset-x-0 z-30 glass-strong border-t border-white/5 flex justify-around pt-2 px-1 pb-[max(0.5rem,env(safe-area-inset-bottom))]"
      >
        {PRIMARY_ITEMS.map((item) => {
          const active = activeView === item.id;
          return (
            <button
              key={item.id}
              onClick={() => go(item)}
              aria-current={active ? 'page' : undefined}
              className={`flex flex-col items-center justify-center gap-1 flex-1 min-w-0 min-h-[44px] px-1 text-[10px] transition-colors ${
                active ? 'text-slate-100' : 'text-slate-500'
              }`}
            >
              <item.icon size={18} className="shrink-0" />
              <span className="truncate max-w-full">{item.label}</span>
            </button>
          );
        })}

        <button
          onClick={() => setMoreOpen((v) => !v)}
          aria-expanded={moreOpen}
          aria-label="More destinations"
          className={`flex flex-col items-center justify-center gap-1 flex-1 min-w-0 min-h-[44px] px-1 text-[10px] transition-colors ${
            moreActive || moreOpen ? 'text-slate-100' : 'text-slate-500'
          }`}
        >
          <MoreHorizontal size={18} className="shrink-0" />
          <span className="truncate max-w-full">More</span>
        </button>
      </nav>
    </>
  );
}