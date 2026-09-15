import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';
import { useStore } from '../store/useStore';
import { useEscapeKey } from '../hooks/useEscapeKey';
import { CATEGORIES } from '../utils/constants';
import ReceiptScanner from './ReceiptScanner';

const emptyForm = { description: '', amount: '', date: new Date().toISOString().slice(0, 10), category: 'food', direction: 'expense' };

export default function TransactionModal() {
  const isOpen = useStore((s) => s.isTransactionModalOpen);
  const editingId = useStore((s) => s.editingTransactionId);
  const transactions = useStore((s) => s.transactions);
  const closeTransactionModal = useStore((s) => s.closeTransactionModal);
  const addTransaction = useStore((s) => s.addTransaction);
  const updateTransaction = useStore((s) => s.updateTransaction);

  useEscapeKey(isOpen, closeTransactionModal);

  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState('');

  useEffect(() => {
    if (editingId) {
      const t = transactions.find((tx) => tx.id === editingId);
      if (t) {
        setForm({
          description: t.description,
          amount: Math.abs(t.amount).toString(),
          date: t.date,
          category: t.category,
          direction: t.amount > 0 ? 'income' : 'expense',
        });
      }
    } else {
      setForm(emptyForm);
    }
    setError('');
  }, [editingId, isOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSubmit = async (e) => {
    e.preventDefault();
    const amountNum = parseFloat(form.amount);
    if (!form.description.trim()) return setError('Add a short description.');
    if (!amountNum || amountNum <= 0) return setError('Enter an amount greater than zero.');

    const signedAmount = form.direction === 'income' ? amountNum : -amountNum;
    const payload = { description: form.description.trim(), amount: signedAmount, date: form.date, category: form.category };

    if (editingId) await updateTransaction(editingId, payload);
    else await addTransaction(payload);

    closeTransactionModal();
  };

  const visibleCategories = CATEGORIES.filter((c) => c.type === form.direction);

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
          onClick={closeTransactionModal}
        >
          <motion.div
            initial={{ opacity: 0, y: 16, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.98 }}
            transition={{ type: 'spring', stiffness: 300, damping: 28 }}
            onClick={(e) => e.stopPropagation()}
            className="glass-strong rounded-2xl w-full max-w-md p-6 shadow-glass"
          >
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-lg font-medium text-slate-100">{editingId ? 'Edit Transaction' : 'Add Transaction'}</h3>
              <div className="flex items-center gap-2">
                {!editingId && (
                  <ReceiptScanner
                    onScanned={(result) => {
                      setForm({
                        description: result.description,
                        amount: result.amount.toString(),
                        date: result.date,
                        category: result.category,
                        direction: CATEGORIES.find((c) => c.id === result.category)?.type || 'expense',
                      });
                      setError('');
                    }}
                  />
                )}
                <button onClick={closeTransactionModal} className="text-slate-500 hover:text-slate-200" aria-label="Close">
                  <X size={18} />
                </button>
              </div>
            </div>

            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <div className="flex rounded-xl bg-obsidian-800/60 p-1 border border-white/8">
                {['expense', 'income'].map((dir) => (
                  <button
                    type="button"
                    key={dir}
                    onClick={() => setForm((f) => ({ ...f, direction: dir, category: CATEGORIES.find((c) => c.type === dir).id }))}
                    className={`flex-1 py-1.5 rounded-lg text-sm capitalize transition-colors ${
                      form.direction === dir
                        ? dir === 'income'
                          ? 'bg-income-soft text-income'
                          : 'bg-expense-soft text-expense'
                        : 'text-slate-400'
                    }`}
                  >
                    {dir}
                  </button>
                ))}
              </div>

              <div>
                <label className="text-xs text-slate-400 mb-1 block">Description</label>
                <input
                  autoFocus
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  placeholder="e.g. Grocery run"
                  className="w-full bg-obsidian-800/60 border border-white/8 rounded-lg px-3 py-2 text-sm text-slate-200 placeholder:text-slate-500 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">Amount</label>
                  <input
                    type="number"
                    step="0.01"
                    value={form.amount}
                    onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
                    placeholder="0.00"
                    className="w-full bg-obsidian-800/60 border border-white/8 rounded-lg px-3 py-2 text-sm text-slate-200 placeholder:text-slate-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">Date</label>
                  <input
                    type="date"
                    value={form.date}
                    onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
                    className="w-full bg-obsidian-800/60 border border-white/8 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs text-slate-400 mb-1 block">Category</label>
                <select
                  value={form.category}
                  onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
                  className="w-full bg-obsidian-800/60 border border-white/8 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none"
                >
                  {visibleCategories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </div>

              {error && <p className="text-xs text-expense">{error}</p>}

              <button type="submit" className="gilt-btn rounded-xl py-2.5 mt-1 text-sm">
                {editingId ? 'Save Changes' : 'Add Transaction'}
              </button>
            </form>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}