import { useState } from 'react';
import { motion } from 'framer-motion';
import { Plus, Trash2 } from 'lucide-react';
import { useStore, selectSpendingThisMonth } from '../store/useStore';
import { CATEGORIES, getCategory } from '../utils/constants';
import { formatMoney } from '../utils/format';

export default function BudgetProgress() {
  const transactions = useStore((s) => s.transactions);
  const budgets = useStore((s) => s.budgets);
  const currency = useStore((s) => s.profile?.currency || "USD");
  const setBudget = useStore((s) => s.setBudget);
  const removeBudget = useStore((s) => s.removeBudget);

  const [newCategory, setNewCategory] = useState('food');
  const [newLimit, setNewLimit] = useState('');

  const spending = selectSpendingThisMonth(transactions);
  const budgetEntries = Object.entries(budgets);
  const availableCategories = CATEGORIES.filter((c) => c.type === 'expense' && !budgets[c.id]);

  const handleAdd = (e) => {
    e.preventDefault();
    const limit = parseFloat(newLimit);
    if (!limit || limit <= 0) return;
    setBudget(newCategory, limit);
    setNewLimit('');
  };

  return (
    <div className="glass rounded-2xl p-5 shadow-glass">
      <h3 className="text-slate-100 font-medium mb-4">Monthly Budgets</h3>

      <div className="flex flex-col gap-4 mb-5">
        {budgetEntries.length === 0 && (
          <p className="text-sm text-slate-500">No budgets set yet — add one below to start tracking limits.</p>
        )}
        {budgetEntries.map(([categoryId, limit]) => {
          const cat = getCategory(categoryId);
          const spent = spending[categoryId] || 0;
          const pct = Math.min((spent / limit) * 100, 100);
          const over = spent > limit;
          return (
            <div key={categoryId}>
              <div className="flex items-center justify-between mb-1.5 text-sm">
                <span className="text-slate-300">{cat.label}</span>
                <div className="flex items-center gap-2">
                  <span className={over ? 'text-expense' : 'text-slate-400'}>
                    {formatMoney(spent, currency)} / {formatMoney(limit, currency)}
                  </span>
                  <button
                    onClick={() => removeBudget(categoryId)}
                    className="text-slate-600 hover:text-expense"
                    aria-label={`Remove ${cat.label} budget`}
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
              <div className="h-2 rounded-full bg-obsidian-800 overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${pct}%` }}
                  transition={{ duration: 0.6, ease: 'easeOut' }}
                  className={`h-full rounded-full ${over ? 'bg-expense' : 'bg-income'}`}
                />
              </div>
            </div>
          );
        })}
      </div>

      {availableCategories.length > 0 && (
        <form onSubmit={handleAdd} className="flex items-center gap-2 pt-4 border-t border-white/5">
          <select
            value={newCategory}
            onChange={(e) => setNewCategory(e.target.value)}
            className="bg-obsidian-800/60 border border-white/8 rounded-lg px-2.5 py-2 text-sm text-slate-200 focus:outline-none"
          >
            {availableCategories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
          <input
            type="number"
            step="1"
            value={newLimit}
            onChange={(e) => setNewLimit(e.target.value)}
            placeholder="Limit"
            className="flex-1 bg-obsidian-800/60 border border-white/8 rounded-lg px-3 py-2 text-sm text-slate-200 placeholder:text-slate-500 focus:outline-none"
          />
          <button type="submit" className="gilt-btn rounded-lg p-2" aria-label="Add budget">
            <Plus size={16} />
          </button>
        </form>
      )}
    </div>
  );
}
