import { useMemo } from 'react';
import { AlertTriangle } from 'lucide-react';
import { useStore, selectSpendingThisMonth } from '../store/useStore';
import { useProStatus } from '../hooks/useProStatus';
import { getCategory } from '../utils/constants';
import { formatMoney } from '../utils/format';

/**
 * Shows the 3 budgeted categories closest to (or over) their limit,
 * right on the Dashboard. Renders nothing at all if there's nothing
 * useful to show (not Pro, or Pro with no budgets set yet) — an empty
 * "you have no budgets" card would just be dashboard clutter for
 * exactly the users who'd get no value from it.
 */
export default function BudgetHealthCard() {
  const { isPro } = useProStatus();
  const transactions = useStore((s) => s.transactions);
  const budgets = useStore((s) => s.budgets);
  const currency = useStore((s) => s.profile?.currency || 'USD');

  const topBudgets = useMemo(() => {
    if (!isPro || Object.keys(budgets).length === 0) return [];
    const spending = selectSpendingThisMonth(transactions);
    return Object.entries(budgets)
      .map(([categoryId, limit]) => {
        const spent = spending[categoryId] || 0;
        return { categoryId, limit, spent, ratio: spent / limit };
      })
      .sort((a, b) => b.ratio - a.ratio) // most urgent (closest to/over limit) first
      .slice(0, 3);
  }, [isPro, budgets, transactions]);

  if (topBudgets.length === 0) return null;

  return (
    <div className="glass rounded-2xl p-5 shadow-glass flex-1">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-slate-100 font-medium">Budget Health</h3>
        <button
          onClick={() => window.dispatchEvent(new CustomEvent('obsidian:navigate', { detail: 'budgets' }))}
          className="text-xs text-slate-500 hover:text-slate-300"
        >
          Manage
        </button>
      </div>

      <div className="flex flex-col gap-3">
        {topBudgets.map(({ categoryId, limit, spent, ratio }) => {
          const cat = getCategory(categoryId);
          const over = ratio > 1;
          const nearLimit = !over && ratio >= 0.8;
          const barColor = over ? 'bg-expense' : nearLimit ? 'bg-amber-400' : 'bg-income';
          return (
            <div key={categoryId}>
              <div className="flex items-center justify-between mb-1 text-xs">
                <span className="text-slate-300 flex items-center gap-1">
                  {over && <AlertTriangle size={11} className="text-expense" />}
                  {cat.label}
                </span>
                <span className={over ? 'text-expense' : 'text-slate-500'}>
                  {formatMoney(spent, currency)} / {formatMoney(limit, currency)}
                </span>
              </div>
              <div className="h-1.5 rounded-full bg-obsidian-800 overflow-hidden">
                <div className={`h-full rounded-full ${barColor}`} style={{ width: `${Math.min(ratio * 100, 100)}%` }} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}