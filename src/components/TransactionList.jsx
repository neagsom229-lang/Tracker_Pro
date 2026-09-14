import { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, Pencil, Trash2, SlidersHorizontal } from 'lucide-react';
import { useStore } from '../store/useStore';
import { CATEGORIES, getCategory } from '../utils/constants';
import { formatMoney, formatDate } from '../utils/format';
import EmptyState from './EmptyState';

export default function TransactionList({ limit }) {
  const transactions = useStore((s) => s.transactions);
  const currency = useStore((s) => s.profile?.currency || "USD");
  const deleteTransaction = useStore((s) => s.deleteTransaction);
  const openTransactionModal = useStore((s) => s.openTransactionModal);

  const [query, setQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [showFilters, setShowFilters] = useState(false);

  const filtered = useMemo(() => {
    let list = transactions;
    if (query.trim()) {
      const q = query.toLowerCase();
      list = list.filter((t) => t.description.toLowerCase().includes(q));
    }
    if (categoryFilter !== 'all') {
      list = list.filter((t) => t.category === categoryFilter);
    }
    return limit ? list.slice(0, limit) : list;
  }, [transactions, query, categoryFilter, limit]);

  return (
    <div className="glass rounded-2xl p-5 shadow-glass">
      <div className="flex items-center justify-between mb-4 gap-3">
        <h3 className="text-slate-100 font-medium">{limit ? 'Recent Transactions' : 'All Transactions'}</h3>
        {!limit && (
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search..."
                className="bg-obsidian-800/60 border border-white/8 rounded-lg pl-8 pr-3 py-1.5 text-sm text-slate-200 placeholder:text-slate-500 focus:outline-none w-40"
              />
            </div>
            <button
              onClick={() => setShowFilters((v) => !v)}
              className={`p-2 rounded-lg border border-white/8 transition-colors ${
                showFilters ? 'bg-white/10 text-slate-100' : 'text-slate-400 hover:text-slate-200'
              }`}
              aria-label="Toggle filters"
            >
              <SlidersHorizontal size={14} />
            </button>
          </div>
        )}
      </div>

      <AnimatePresence>
        {showFilters && !limit && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden mb-4"
          >
            <div className="flex flex-wrap gap-2 pb-1">
              <button
                onClick={() => setCategoryFilter('all')}
                className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                  categoryFilter === 'all'
                    ? 'bg-white/10 border-white/20 text-slate-100'
                    : 'border-white/8 text-slate-400 hover:text-slate-200'
                }`}
              >
                All
              </button>
              {CATEGORIES.map((c) => (
                <button
                  key={c.id}
                  onClick={() => setCategoryFilter(c.id)}
                  className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                    categoryFilter === c.id
                      ? 'bg-white/10 border-white/20 text-slate-100'
                      : 'border-white/8 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {c.label}
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {transactions.length === 0 ? (
        <EmptyState />
      ) : (
      <div className="flex flex-col divide-y divide-white/5">
        {filtered.length === 0 && (
          <p className="text-sm text-slate-500 py-6 text-center">No transactions match your search or filters.</p>
        )}
        <AnimatePresence initial={false}>
          {filtered.map((t) => {
            const cat = getCategory(t.category);
            const isIncome = t.amount > 0;
            return (
              <motion.div
                key={t.id}
                layout
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0, height: 0 }}
                className="flex items-center gap-3 py-3 group"
              >
                <div
                  className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-semibold shrink-0"
                  style={{ backgroundColor: `${cat.color}22`, color: cat.color }}
                >
                  {cat.label.slice(0, 2).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-slate-200 truncate">{t.description}</p>
                  <p className="text-xs text-slate-500">
                    {cat.label} · {formatDate(t.date)}
                  </p>
                </div>
                <span className={`text-sm font-medium tabular-nums ${isIncome ? 'text-income' : 'text-expense'}`}>
                  {isIncome ? '+' : '-'}
                  {formatMoney(Math.abs(t.amount), currency)}
                </span>
                <div className="hidden group-hover:flex items-center gap-1">
                  <button
                    onClick={() => openTransactionModal(t.id)}
                    className="p-1.5 rounded-lg text-slate-500 hover:text-slate-200 hover:bg-white/5"
                    aria-label="Edit transaction"
                  >
                    <Pencil size={14} />
                  </button>
                  <button
                    onClick={() => deleteTransaction(t.id)}
                    className="p-1.5 rounded-lg text-slate-500 hover:text-expense hover:bg-expense-soft"
                    aria-label="Delete transaction"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
      )}
    </div>
  );
}
