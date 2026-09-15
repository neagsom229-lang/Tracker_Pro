import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Target, Plus, Trash2, Check, CalendarClock, AlertTriangle } from 'lucide-react';
import { useGoals } from '../hooks/useGoals';
import { useStore } from '../store/useStore';
import { formatMoney } from '../utils/format';

const INPUT_CLASS =
  'w-full bg-obsidian-800/60 border border-white/8 rounded-lg px-3 py-2 text-sm text-slate-200 placeholder:text-slate-500 ' +
  'focus:outline-none focus:border-gilt-gold/60 focus:ring-2 focus:ring-gilt-gold/25 transition';

function deadlineLabel(goal) {
  if (goal.isComplete) return 'Funded';
  if (goal.daysLeft === null) return 'No deadline';
  if (goal.daysLeft < 0) return `${Math.abs(goal.daysLeft)} days overdue`;
  if (goal.daysLeft === 0) return 'Due today';
  if (goal.daysLeft === 1) return '1 day left';
  if (goal.daysLeft < 45) return `${goal.daysLeft} days left`;
  return `${Math.round(goal.daysLeft / 30)} months left`;
}

function GoalRow({ goal, currency, onContribute, onRemove }) {
  const [amount, setAmount] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const handleContribute = async (e) => {
    e.preventDefault();
    const value = parseFloat(amount);
    if (!Number.isFinite(value) || value <= 0) {
      setError('Enter an amount greater than zero.');
      return;
    }
    setError('');
    setBusy(true);
    try {
      await onContribute(goal.id, value);
      setAmount('');
    } catch {
      // The store already surfaced the failure as a toast.
    } finally {
      setBusy(false);
    }
  };

  const barColor = goal.isComplete ? 'bg-income' : goal.isOverdue ? 'bg-expense' : 'bg-gilt-gradient';

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
            {goal.isComplete && <Check size={14} className="text-income shrink-0" />}
            {goal.isOverdue && <AlertTriangle size={14} className="text-expense shrink-0" />}
            <h4 className="text-sm font-medium text-slate-100 truncate">{goal.name}</h4>
          </div>
          <p className="text-xs text-slate-500 mt-0.5 flex items-center gap-1">
            <CalendarClock size={11} />
            {deadlineLabel(goal)}
            {goal.requiredMonthly !== null && (
              <span className="text-slate-600">
                {' '}
                · {formatMoney(goal.requiredMonthly, currency)}/mo to stay on track
              </span>
            )}
          </p>
        </div>
        <button
          onClick={() => onRemove(goal.id)}
          aria-label={`Delete goal ${goal.name}`}
          className="text-slate-600 hover:text-expense transition-colors p-1 shrink-0"
        >
          <Trash2 size={14} />
        </button>
      </div>

      <div className="flex items-baseline justify-between text-sm mb-1.5">
        <span className="text-slate-200 font-medium">{formatMoney(goal.currentAmount, currency)}</span>
        <span className="text-xs text-slate-500">of {formatMoney(goal.targetAmount, currency)}</span>
      </div>

      <div
        className="h-2 rounded-full bg-white/5 overflow-hidden"
        role="progressbar"
        aria-valuenow={Math.round(goal.percent)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`${goal.name} progress`}
      >
        <motion.div
          className={`h-full rounded-full ${barColor}`}
          initial={{ width: 0 }}
          animate={{ width: `${goal.percent}%` }}
          transition={{ duration: 0.6, ease: 'easeOut' }}
        />
      </div>

      {!goal.isComplete && (
        <form onSubmit={handleContribute} className="flex gap-2 mt-3">
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
            placeholder={`Add funds (${formatMoney(goal.remaining, currency)} to go)`}
            aria-label={`Amount to add to ${goal.name}`}
            className={`${INPUT_CLASS} flex-1 min-w-0`}
          />
          <button
            type="submit"
            disabled={busy}
            className="gilt-btn rounded-lg px-3.5 py-2 text-xs shrink-0 disabled:opacity-60"
          >
            {busy ? 'Adding…' : 'Add'}
          </button>
        </form>
      )}

      {error && <p className="text-xs text-expense mt-1.5">{error}</p>}
    </motion.div>
  );
}

export default function GoalManager() {
  const { goals, totals, addGoal, removeGoal, contributeToGoal } = useGoals();
  const currency = useStore((s) => s.profile?.currency || 'USD');

  const [name, setName] = useState('');
  const [target, setTarget] = useState('');
  const [deadline, setDeadline] = useState('');
  const [formError, setFormError] = useState('');
  const [creating, setCreating] = useState(false);

  const handleCreate = async (e) => {
    e.preventDefault();
    setCreating(true);
    try {
      await addGoal({ name, targetAmount: target, deadline });
      setName('');
      setTarget('');
      setDeadline('');
      setFormError('');
    } catch (err) {
      setFormError(err.message);
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="glass rounded-2xl p-4 sm:p-5 shadow-glass">
        <div className="flex items-center gap-2 mb-1">
          <Target size={16} className="text-gilt-gold" />
          <h3 className="text-slate-100 font-medium">Savings Goals</h3>
        </div>
        <p className="text-xs text-slate-500 mb-4">
          {goals.length === 0
            ? 'Set a target, then add funds as you save.'
            : `${formatMoney(totals.totalSaved, currency)} saved across ${goals.length} goal${
                goals.length === 1 ? '' : 's'
              }${totals.completed > 0 ? ` · ${totals.completed} funded` : ''}`}
        </p>

        <div className="flex flex-col gap-3">
          <AnimatePresence initial={false}>
            {goals.map((goal) => (
              <GoalRow
                key={goal.id}
                goal={goal}
                currency={currency}
                onContribute={contributeToGoal}
                onRemove={removeGoal}
              />
            ))}
          </AnimatePresence>
        </div>
      </div>

      <div className="glass rounded-2xl p-4 sm:p-5 shadow-glass">
        <h3 className="text-slate-100 font-medium mb-4 text-sm">New goal</h3>
        <form onSubmit={handleCreate} className="flex flex-col gap-3">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="sm:col-span-1">
              <label htmlFor="goal-name" className="text-xs text-slate-400 mb-1 block">
                Name
              </label>
              <input
                id="goal-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Emergency fund"
                maxLength={60}
                className={INPUT_CLASS}
              />
            </div>
            <div>
              <label htmlFor="goal-target" className="text-xs text-slate-400 mb-1 block">
                Target amount
              </label>
              <input
                id="goal-target"
                type="number"
                step="0.01"
                min="0"
                inputMode="decimal"
                value={target}
                onChange={(e) => setTarget(e.target.value)}
                placeholder="3000"
                className={INPUT_CLASS}
              />
            </div>
            <div>
              <label htmlFor="goal-deadline" className="text-xs text-slate-400 mb-1 block">
                Deadline <span className="text-slate-600">(optional)</span>
              </label>
              <input
                id="goal-deadline"
                type="date"
                value={deadline}
                onChange={(e) => setDeadline(e.target.value)}
                className={`${INPUT_CLASS} [color-scheme:dark]`}
              />
            </div>
          </div>

          {formError && <p className="text-xs text-expense">{formError}</p>}

          <button
            type="submit"
            disabled={creating}
            className="gilt-btn rounded-xl px-4 py-2.5 text-sm flex items-center justify-center gap-2 sm:self-start disabled:opacity-60"
          >
            <Plus size={15} /> {creating ? 'Creating…' : 'Create goal'}
          </button>
        </form>
      </div>
    </div>
  );
}