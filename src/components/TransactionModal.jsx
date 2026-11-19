import { useState } from 'react';
import { useStore } from '../store/useStore';
import { CATEGORIES } from '../utils/constants';
import ReceiptScanner from './ReceiptScanner';
import Modal from './Modal';
import Input from './Input';
import Button from './Button';

const emptyForm = { description: '', amount: '', date: new Date().toISOString().slice(0, 10), category: 'food', direction: 'expense' };

export default function TransactionModal() {
  const isOpen = useStore((s) => s.isTransactionModalOpen);
  const editingId = useStore((s) => s.editingTransactionId);
  const transactions = useStore((s) => s.transactions);
  const closeTransactionModal = useStore((s) => s.closeTransactionModal);
  const addTransaction = useStore((s) => s.addTransaction);
  const updateTransaction = useStore((s) => s.updateTransaction);
  const [submitting, setSubmitting] = useState(false);
  const [touched, setTouched] = useState(false);

  const [form, setForm] = useState(() => {
    if (editingId) {
      const t = transactions.find((tx) => tx.id === editingId);
      if (t) {
        return {
          description: t.description,
          amount: Math.abs(t.amount).toString(),
          date: t.date,
          category: t.category,
          direction: t.amount > 0 ? 'income' : 'expense',
        };
      }
    }
    return emptyForm;
  });

  const errors = [];
  if (!form.description.trim()) errors.push('Add a short description.');
  if (!form.amount || Number(form.amount) <= 0) errors.push('Enter an amount greater than zero.');
  const descErr = touched && !form.description.trim() ? 'Add a short description.' : undefined;
  const amountErr = touched && (!form.amount || Number(form.amount) <= 0) ? 'Enter an amount greater than zero.' : undefined;

  const visibleCategories = CATEGORIES.filter((c) => c.type === form.direction);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setTouched(true);
    if (errors.length) return;
    setSubmitting(true);
    try {
      const amountNum = parseFloat(form.amount);
      const signedAmount = form.direction === 'income' ? amountNum : -amountNum;
      const payload = { description: form.description.trim(), amount: signedAmount, date: form.date, category: form.category };
      if (editingId) await updateTransaction(editingId, payload);
      else await addTransaction(payload);
      closeTransactionModal();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={closeTransactionModal} title={editingId ? 'Edit Transaction' : 'Add Transaction'}>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4" aria-label={editingId ? 'Edit transaction form' : 'Add transaction form'}>
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
              setTouched(false);
            }}
          />
        )}

        <div className="flex rounded-xl bg-card p-1 border border-white/8 overflow-hidden">
          {['expense', 'income'].map((dir) => (
            <button
              type="button"
              key={dir}
              onClick={() => setForm((f) => ({ ...f, direction: dir, category: CATEGORIES.find((c) => c.type === dir).id }))}
              className={`flex-1 py-1.5 rounded-lg text-sm capitalize cursor-pointer transition-colors ${
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

        <Input
          id="tx-desc"
          label="Description"
          value={form.description}
          onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
          onBlur={() => setTouched(true)}
          placeholder="e.g. Grocery run"
          error={descErr}
        />

        <div className="grid grid-cols-2 gap-3">
          <Input
            id="tx-amount"
            label="Amount"
            type="number"
            step="0.01"
            value={form.amount}
            onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
            onBlur={() => setTouched(true)}
            placeholder="0.00"
            error={amountErr}
          />
          <Input id="tx-date" label="Date" type="date" value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} />
        </div>

        <div>
          <label htmlFor="tx-category" className="text-xs text-slate-400 mb-1 block">Category</label>
          <select
            id="tx-category"
            value={form.category}
            onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
            className="w-full bg-card border border-white/8 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/25 cursor-pointer"
          >
            {visibleCategories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
        </div>

        {touched && errors.length > 0 && (
          <div role="alert" className="flex flex-col gap-1">
            <p className="text-xs font-medium text-expense">Please fix:</p>
            <ul className="text-xs text-expense list-disc pl-4">
              {errors.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          </div>
        )}

        <Button type="submit" variant="primary" disabled={submitting} className="mt-1">
          {submitting ? 'Saving…' : editingId ? 'Save Changes' : 'Add Transaction'}
        </Button>
      </form>
    </Modal>
  );
}
