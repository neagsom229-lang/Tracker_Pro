import { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Landmark, Plus, Trash2, TrendingDown, PartyPopper } from 'lucide-react';
import { useStore, selectDebtTotals } from '../store/useStore';
import { formatMoney } from '../utils/format';

const INPUT_CLASS =
  'w-full bg-obsidian-800/60 border border-white/8 rounded-lg px-3 py-2 text-sm text-slate-200 placeholder:text-slate-500 ' +
  'focus:outline-none focus:border-gilt-gold/60 focus:ring-2 focus:ring-gilt-gold/25 transition';

/**
 * Months to payoff at the current minimum payment, using the standard
 * amortisation formula:  n = -log(1 - r·B/P) / log(1 + r)
 *
 * Returns null when the debt can never be paid off at that rate — which
 * happens whenever the monthly interest exceeds the payment. That case
 * is not an edge case to swallow: it's the single most useful thing this
 * screen can tell someone, so the UI surfaces it explicitly instead of
 * showing a blank or an absurd number.
 */
function monthsToPayoff(balance, annualRatePct, monthlyPayment) {
  if (balance <= 0) return 0;
  if (!monthlyPayment || monthlyPayment <= 0) return null;

  const monthlyRate = annualRatePct / 100 / 12;
  if (monthlyRate === 0) return Math.ceil(balance / monthlyPayment);

  const interestOnly = balance * monthlyRate;
  if (monthlyPayment <= interestOnly) return null; // never pays off

  return Math.ceil(-Math.log(1 - (monthlyRate * balance) / monthlyPayment) / Math.log(1 + monthlyRate));
}

function payoffLabel(months) {
  if (months === null) return null;
  if (months === 0) return 'Cleared';
  if (months < 12) return `${months} mo at minimum`;
  const years = Math.floor(months / 12);
  const rest = months % 12;
  return `${years}y ${rest}m at minimum`;
}

function DebtRow({ debt, currency, onPay, onRemove }) {
  const [amount, setAmount] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const paidOff = debt.balance <= 0;
  const progress = debt.initialBalance > 0 ? (debt.initialBalance - debt.balance) / debt.initialBalance : 0;
  const months = monthsToPayoff(debt.balance, debt.interestRate, debt.minimumPayment);

  const handlePay = async (e) => {
    e.preventDefault();
    const value = parseFloat(amount);
    if (!Number.isFinite(value) || value <= 0) {
      setError('Enter an amount greater than zero.');
      return;
    }
    setError('');
    setBusy(true);
    try {
      await onPay(debt.id, value);
      setAmount('');
    } catch {
      // Store already toasted.
    } finally {
      setBusy(false);
    }
  };

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, height: 0 }}
      className="rounded-xl border border-white/8 bg-obsidian-800/40 p-4"
    >
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            {paidOff && <PartyPopper size={14} className="text-income shrink-0" />}
            <h4 className="text-sm font-medium text-slate-100 truncate">{debt.name}</h4>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            {debt.interestRate > 0 ? `${debt.interestRate}% APR` : 'No interest'}
            {debt.minimumPayment > 0 && ` · min ${formatMoney(debt.minimumPayment, currency)}/mo`}
          </p>
        </div>
        <button
          onClick={() => onRemove(debt.id)}
          aria-label={`Delete debt ${debt.name}`}
          className="text-slate-600 hover:text-expense transition-colors p-1 shrink-0"
        >
          <Trash2 size={14} />
        </button>
      </div>

      <div className="flex items-baseline justify-between text-sm mb-1.5">
        <span className={`font-medium ${paidOff ? 'text-income' : 'text-slate-200'}`}>
          {paidOff ? 'Paid off' : formatMoney(debt.balance, currency)}
        </span>
        <span className="text-xs text-slate-500">
          {formatMoney(debt.initialBalance - debt.balance, currency)} paid
        </span>
      </div>

      <div
        className="h-2 rounded-full bg-white/5 overflow-hidden"
        role="progressbar"
        aria-valuenow={Math.round(progress * 100)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`${debt.name} payoff progress`}
      >
        <motion.div
          className={`h-full rounded-full ${paidOff ? 'bg-income' : 'bg-gilt-gradient'}`}
          initial={{ width: 0 }}
          animate={{ width: `${Math.min(progress * 100, 100)}%` }}
          transition={{ duration: 0.6, ease: 'easeOut' }}
        />
      </div>

      {!paidOff && (
        <>
          <p className="text-xs mt-2">
            {months === null ? (
              <span className="text-expense">
                At {formatMoney(debt.minimumPayment, currency)}/mo the interest outpaces the payment — this
                balance will never clear. Raise the payment.
              </span>
            ) : (
              <span className="text-slate-500">{payoffLabel(months)}</span>
            )}
          </p>

          <form onSubmit={handlePay} className="flex gap-2 mt-3">
            <input
              type="number"
              step="0.01"
              min="0"
              inputMode="decimal"
              value={amount}
              onChange={(e) => {
                setAmount(e.target.value);
                if (error) setError('');
              }}
              placeholder="Log a payment"
              aria-label={`Payment amount for ${debt.name}`}
              className={`${INPUT_CLASS} flex-1 min-w-0`}
            />
            <button
              type="submit"
              disabled={busy}
              className="gilt-btn rounded-lg px-3.5 py-2 text-xs shrink-0 disabled:opacity-60"
            >
              {busy ? 'Saving…' : 'Pay'}
            </button>
          </form>
        </>
      )}

      {error && <p className="text-xs text-expense mt-1.5">{error}</p>}
    </motion.div>
  );
}

export default function DebtManager() {
  const debts = useStore((s) => s.debts);
  const currency = useStore((s) => s.profile?.currency || 'USD');
  const addDebt = useStore((s) => s.addDebt);
  const removeDebt = useStore((s) => s.removeDebt);
  const logDebtPayment = useStore((s) => s.logDebtPayment);

  const totals = useMemo(() => selectDebtTotals(debts), [debts]);

  const [name, setName] = useState('');
  const [balance, setBalance] = useState('');
  const [rate, setRate] = useState('');
  const [minimum, setMinimum] = useState('');
  const [formError, setFormError] = useState('');
  const [creating, setCreating] = useState(false);

  // Highest interest rate first: this is the avalanche method, and it's
  // the ordering that costs the user least money overall. Sorting by
  // balance (snowball) is the alternative and is worth offering as a
  // toggle later, but a default has to be picked and this is the one
  // that's mathematically correct.
  const sorted = useMemo(
    () => [...debts].sort((a, b) => Number(a.balance === 0) - Number(b.balance === 0) || b.interestRate - a.interestRate),
    [debts]
  );

  const handleCreate = async (e) => {
    e.preventDefault();
    const cleanName = name.trim();
    const startBalance = parseFloat(balance);

    if (!cleanName) return setFormError('Give the debt a name.');
    if (!Number.isFinite(startBalance) || startBalance <= 0) {
      return setFormError('Enter a balance greater than zero.');
    }

    setFormError('');
    setCreating(true);
    try {
      await addDebt({
        name: cleanName.slice(0, 60),
        balance: startBalance,
        interestRate: parseFloat(rate) || 0,
        minimumPayment: parseFloat(minimum) || 0,
      });
      setName('');
      setBalance('');
      setRate('');
      setMinimum('');
    } catch {
      // Store already toasted.
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="glass rounded-2xl p-4 sm:p-5 shadow-glass">
        <div className="flex items-center gap-2 mb-1">
          <Landmark size={16} className="text-gilt-purple" />
          <h3 className="text-slate-100 font-medium">Debts</h3>
        </div>
        <p className="text-xs text-slate-500 mb-4">
          {debts.length === 0 ? (
            'Add a loan or card to track what you owe and how fast it is shrinking.'
          ) : (
            <span className="flex items-center gap-1.5">
              <TrendingDown size={11} />
              {formatMoney(totals.totalBalance, currency)} outstanding ·{' '}
              {Math.round(totals.payoffProgress * 100)}% paid off
            </span>
          )}
        </p>

        <div className="flex flex-col gap-3">
          <AnimatePresence initial={false}>
            {sorted.map((debt) => (
              <DebtRow key={debt.id} debt={debt} currency={currency} onPay={logDebtPayment} onRemove={removeDebt} />
            ))}
          </AnimatePresence>
        </div>
      </div>

      <div className="glass rounded-2xl p-4 sm:p-5 shadow-glass">
        <h3 className="text-slate-100 font-medium mb-4 text-sm">Add a debt</h3>
        <form onSubmit={handleCreate} className="flex flex-col gap-3">
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <div>
              <label htmlFor="debt-name" className="text-xs text-slate-400 mb-1 block">
                Name
              </label>
              <input
                id="debt-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Visa card"
                maxLength={60}
                className={INPUT_CLASS}
              />
            </div>
            <div>
              <label htmlFor="debt-balance" className="text-xs text-slate-400 mb-1 block">
                Balance
              </label>
              <input
                id="debt-balance"
                type="number"
                step="0.01"
                min="0"
                inputMode="decimal"
                value={balance}
                onChange={(e) => setBalance(e.target.value)}
                placeholder="1200"
                className={INPUT_CLASS}
              />
            </div>
            <div>
              <label htmlFor="debt-rate" className="text-xs text-slate-400 mb-1 block">
                APR %
              </label>
              <input
                id="debt-rate"
                type="number"
                step="0.01"
                min="0"
                max="100"
                inputMode="decimal"
                value={rate}
                onChange={(e) => setRate(e.target.value)}
                placeholder="18.9"
                className={INPUT_CLASS}
              />
            </div>
            <div>
              <label htmlFor="debt-minimum" className="text-xs text-slate-400 mb-1 block">
                Min / month
              </label>
              <input
                id="debt-minimum"
                type="number"
                step="0.01"
                min="0"
                inputMode="decimal"
                value={minimum}
                onChange={(e) => setMinimum(e.target.value)}
                placeholder="50"
                className={INPUT_CLASS}
              />
            </div>
          </div>

          {formError && <p className="text-xs text-expense">{formError}</p>}

          <button
            type="submit"
            disabled={creating}
            className="gilt-btn rounded-xl px-4 py-2.5 text-sm flex items-center justify-center gap-2 sm:self-start disabled:opacity-60"
          >
            <Plus size={15} /> {creating ? 'Adding…' : 'Add debt'}
          </button>
        </form>
      </div>
    </div>
  );
}