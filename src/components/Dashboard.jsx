import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Wallet, TrendingUp, TrendingDown, Target, Landmark } from 'lucide-react';
import {
  useStore,
  selectTotals,
  selectSpendingByCategory,
  selectGoalTotals,
  selectDebtTotals,
  selectInRange,
} from '../store/useStore';
import StatCard from './StatCard';
import CategoryChart from './CategoryChart';
import TrendChart from './TrendChart';
import TransactionList from './TransactionList';
import AIQuickAdd from './AIQuickAdd';
import { DATE_RANGES } from '../utils/constants';
import { formatMoney } from '../utils/format';

/**
 * The date filter is the one piece of state every chart on this page
 * reads, so it lives here and the filtered list is passed down. The
 * alternative — each chart reaching into the store and applying the
 * range itself — would mean four components independently re-deriving
 * the same slice and four chances for them to disagree about what "30
 * days" means.
 */
function RangeFilter({ value, onChange }) {
  return (
    <div className="flex items-center gap-1 p-1 rounded-xl border border-white/8 bg-obsidian-800/40 self-start">
      {DATE_RANGES.map((range) => {
        const active = value === range.id;
        return (
          <button
            key={range.id}
            onClick={() => onChange(range.id)}
            aria-pressed={active}
            className={`relative px-3 py-1.5 text-xs rounded-lg transition-colors ${
              active ? 'text-obsidian-950' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            {active && (
              <motion.span
                layoutId="range-pill"
                className="absolute inset-0 rounded-lg bg-gilt-gradient"
                transition={{ type: 'spring', stiffness: 400, damping: 32 }}
              />
            )}
            <span className="relative z-10 font-medium">{range.label}</span>
          </button>
        );
      })}
    </div>
  );
}

function SummaryCard({ icon: Icon, label, primary, secondary, progress, tone, onClick }) {
  return (
    <button
      onClick={onClick}
      className="glass rounded-2xl p-4 sm:p-5 shadow-glass text-left hover:bg-white/5 transition-colors w-full"
    >
      <div className="flex items-center gap-2 mb-2">
        <Icon size={14} className={tone} />
        <span className="text-xs text-slate-400">{label}</span>
      </div>
      <p className="text-xl font-semibold text-slate-50">{primary}</p>
      <p className="text-xs text-slate-500 mt-0.5">{secondary}</p>
      <div className="h-1.5 rounded-full bg-white/5 overflow-hidden mt-3">
        <motion.div
          className="h-full rounded-full bg-gilt-gradient"
          initial={{ width: 0 }}
          animate={{ width: `${Math.min(progress * 100, 100)}%` }}
          transition={{ duration: 0.6, ease: 'easeOut' }}
        />
      </div>
    </button>
  );
}

export default function Dashboard({ onNavigate }) {
  const transactions = useStore((s) => s.transactions);
  const goals = useStore((s) => s.goals);
  const debts = useStore((s) => s.debts);
  const currency = useStore((s) => s.profile?.currency || 'USD');

  const [rangeId, setRangeId] = useState('30d');
  const range = DATE_RANGES.find((r) => r.id === rangeId) ?? DATE_RANGES[1];

  // One filter pass, reused by every consumer below.
  const inRange = useMemo(() => selectInRange(transactions, range.days), [transactions, range.days]);

  const { totalBalance, totalIncome, totalExpenses } = useMemo(() => selectTotals(inRange), [inRange]);
  const spending = useMemo(() => selectSpendingByCategory(inRange), [inRange]);
  const goalTotals = useMemo(() => selectGoalTotals(goals), [goals]);
  const debtTotals = useMemo(() => selectDebtTotals(debts), [debts]);

  // The trend chart draws one point per day, so an "All" range on a
  // years-old account would render thousands of points. Cap the visual
  // window at 365 days; the filter still governs the stat cards.
  const trendWindow = Math.min(range.days ?? 365, 365);

  return (
    <div className="flex flex-col gap-6">
      <AIQuickAdd />

      <div className="flex items-center justify-between gap-3 flex-wrap">
        <RangeFilter value={rangeId} onChange={setRangeId} />
        <p className="text-xs text-slate-500">
          {range.days ? `Last ${range.days} days` : 'All time'} · {inRange.length} transaction
          {inRange.length === 1 ? '' : 's'}
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard label="Net Balance" value={totalBalance} currency={currency} icon={Wallet} tone="neutral" delay={0} />
        <StatCard label="Income" value={totalIncome} currency={currency} icon={TrendingUp} tone="income" delay={0.05} />
        <StatCard label="Expenses" value={totalExpenses} currency={currency} icon={TrendingDown} tone="expense" delay={0.1} />
      </div>

      {(goals.length > 0 || debts.length > 0) && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {goals.length > 0 && (
            <SummaryCard
              icon={Target}
              tone="text-gilt-gold"
              label="Total saved"
              primary={formatMoney(goalTotals.totalSaved, currency)}
              secondary={`of ${formatMoney(goalTotals.totalTarget, currency)} across ${goals.length} goal${
                goals.length === 1 ? '' : 's'
              }`}
              progress={goalTotals.progress}
              onClick={() => onNavigate?.('goals')}
            />
          )}
          {debts.length > 0 && (
            <SummaryCard
              icon={Landmark}
              tone="text-gilt-purple"
              label="Total debt"
              primary={formatMoney(debtTotals.totalBalance, currency)}
              secondary={`${Math.round(debtTotals.payoffProgress * 100)}% paid off${
                debtTotals.totalMinimum > 0
                  ? ` · ${formatMoney(debtTotals.totalMinimum, currency)}/mo minimum`
                  : ''
              }`}
              progress={debtTotals.payoffProgress}
              onClick={() => onNavigate?.('debts')}
            />
          )}
        </div>
      )}

      <div className="glass rounded-2xl p-4 sm:p-5 shadow-glass">
        <h3 className="text-slate-100 font-medium mb-2">Balance Trend &amp; Forecast</h3>
        <p className="text-xs text-slate-500 mb-1">
          Last {trendWindow} days, projected 30 days forward from your recurring rules
        </p>
        {/* The trend always reads from the FULL transaction list, not the
            filtered one: a running balance that starts at zero because
            the filter hid everything before day one would be wrong, not
            just incomplete. The window prop controls what's visible. */}
        <TrendChart transactions={transactions} windowDays={trendWindow} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        <div className="lg:col-span-2 glass rounded-2xl p-4 sm:p-5 shadow-glass">
          <h3 className="text-slate-100 font-medium mb-2">Spending by Category</h3>
          <p className="text-xs text-slate-500 mb-1">Tap a slice to see the transactions behind it</p>
          <CategoryChart spendingMap={spending} transactions={inRange} />
        </div>
        <div className="lg:col-span-3">
          <TransactionList limit={6} />
        </div>
      </div>
    </div>
  );
}