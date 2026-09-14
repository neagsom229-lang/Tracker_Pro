import { useState } from 'react';
import { Plus, Trash2, Repeat } from 'lucide-react';
import { useStore } from '../store/useStore';
import { CATEGORIES, getCategory } from '../utils/constants';
import { formatMoney, formatDate } from '../utils/format';

const FREQUENCY_LABEL = { weekly: 'every week', monthly: 'every month', yearly: 'every year' };

export default function RecurringManager() {
  const recurring = useStore((s) => s.recurring);
  const currency = useStore((s) => s.profile?.currency || 'USD');
  const addRecurring = useStore((s) => s.addRecurring);
  const removeRecurring = useStore((s) => s.removeRecurring);

  const [form, setForm] = useState({ description: '', amount: '', category: 'rent', direction: 'expense', frequency: 'monthly' });
  const [error, setError] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    const amountNum = parseFloat(form.amount);
    if (!form.description.trim()) return setError('Add a short description.');
    if (!amountNum || amountNum <= 0) return setError('Enter an amount greater than zero.');

    setError('');
    addRecurring({
      description: form.description.trim(),
      amount: form.direction === 'income' ? amountNum : -amountNum,
      category: form.category,
      frequency: form.frequency,
    });
    setForm({ description: '', amount: '', category: 'rent', direction: 'expense', frequency: 'monthly' });
  };

  return (
    <div className="glass rounded-2xl p-5 shadow-glass">
      <h3 className="text-slate-100 font-medium mb-1 flex items-center gap-2">
        <Repeat size={16} className="text-gilt-gold" /> Recurring Transactions
      </h3>
      <p className="text-sm text-slate-500 mb-4">
        Automatically posted on schedule — subscriptions, salary, rent, annual renewals.
      </p>

      <div className="flex flex-col divide-y divide-white/5 mb-5">
        {recurring.length === 0 && <p className="text-sm text-slate-500 py-3">No recurring rules yet.</p>}
        {recurring.map((r) => {
          const cat = getCategory(r.category);
          return (
            <div key={r.id} className="flex items-center gap-3 py-3">
              <div className="flex-1 min-w-0">
                <p className="text-sm text-slate-200 truncate">{r.description}</p>
                <p className="text-xs text-slate-500">
                  {cat.label} · {FREQUENCY_LABEL[r.frequency] || 'every month'} · next {formatDate(r.nextRunDate)}
                </p>
              </div>
              <span className={`text-sm font-medium ${r.amount > 0 ? 'text-income' : 'text-expense'}`}>
                {r.amount > 0 ? '+' : '-'}
                {formatMoney(Math.abs(r.amount), currency)}
              </span>
              <button onClick={() => removeRecurring(r.id)} className="text-slate-600 hover:text-expense" aria-label="Remove rule">
                <Trash2 size={14} />
              </button>
            </div>
          );
        })}
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-3 pt-4 border-t border-white/5">
        <div className="flex gap-2">
          <input
            value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            placeholder="e.g. Netflix"
            className="flex-1 bg-obsidian-800/60 border border-white/8 rounded-lg px-3 py-2 text-sm text-slate-200 placeholder:text-slate-500 focus:outline-none"
          />
          <input
            type="number"
            step="0.01"
            value={form.amount}
            onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
            placeholder="Amount"
            className="w-28 bg-obsidian-800/60 border border-white/8 rounded-lg px-3 py-2 text-sm text-slate-200 placeholder:text-slate-500 focus:outline-none"
          />
        </div>
        <div className="flex gap-2 flex-wrap">
          <select
            value={form.direction}
            onChange={(e) =>
              setForm((f) => ({ ...f, direction: e.target.value, category: CATEGORIES.find((c) => c.type === e.target.value).id }))
            }
            className="bg-obsidian-800/60 border border-white/8 rounded-lg px-2.5 py-2 text-sm text-slate-200 focus:outline-none"
          >
            <option value="expense">Expense</option>
            <option value="income">Income</option>
          </select>
          <select
            value={form.category}
            onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
            className="flex-1 bg-obsidian-800/60 border border-white/8 rounded-lg px-2.5 py-2 text-sm text-slate-200 focus:outline-none"
          >
            {CATEGORIES.filter((c) => c.type === form.direction).map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
          <select
            value={form.frequency}
            onChange={(e) => setForm((f) => ({ ...f, frequency: e.target.value }))}
            className="bg-obsidian-800/60 border border-white/8 rounded-lg px-2.5 py-2 text-sm text-slate-200 focus:outline-none"
          >
            <option value="weekly">Weekly</option>
            <option value="monthly">Monthly</option>
            <option value="yearly">Yearly</option>
          </select>
          <button type="submit" className="gilt-btn rounded-lg px-3 flex items-center justify-center" aria-label="Add recurring rule">
            <Plus size={16} />
          </button>
        </div>
        {error && <p className="text-xs text-expense">{error}</p>}
      </form>
    </div>
  );
}