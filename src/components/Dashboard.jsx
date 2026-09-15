import { useMemo } from 'react';
import { Wallet, TrendingUp, TrendingDown } from 'lucide-react';
import { useStore, selectTotals, selectSpendingThisMonth } from '../store/useStore';
import StatCard from './StatCard';
import CategoryChart from './CategoryChart';
import TrendChart from './TrendChart';
import TransactionList from './TransactionList';
import AIQuickAdd from './AIQuickAdd';

export default function Dashboard() {
  const transactions = useStore((s) => s.transactions);
  const currency = useStore((s) => s.profile?.currency || "USD");

  // Both of these walk the full transactions array. Wrapping them in
  // useMemo means they only re-run when `transactions` itself changes
  // (a new/edited/deleted transaction) — not on every re-render this
  // component happens to go through for an unrelated reason, e.g. the
  // user switching currency, which changes `currency` but not the
  // underlying totals.
  const { totalBalance, totalIncome, totalExpenses } = useMemo(
    () => selectTotals(transactions ?? []),
    [transactions]
  );
  const spendingThisMonth = useMemo(
    () => selectSpendingThisMonth(transactions ?? []),
    [transactions]
  );

  return (
    <div className="flex flex-col gap-6">
      <AIQuickAdd />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard label="Total Balance" value={totalBalance} currency={currency} icon={Wallet} tone="neutral" delay={0} />
        <StatCard label="Total Income" value={totalIncome} currency={currency} icon={TrendingUp} tone="income" delay={0.05} />
        <StatCard label="Total Expenses" value={totalExpenses} currency={currency} icon={TrendingDown} tone="expense" delay={0.1} />
      </div>

      <div className="glass rounded-2xl p-5 shadow-glass">
        <h3 className="text-slate-100 font-medium mb-2">Balance Trend</h3>
        <p className="text-xs text-slate-500 mb-1">Last 30 days</p>
        <TrendChart transactions={transactions ?? []} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        <div className="lg:col-span-2 glass rounded-2xl p-5 shadow-glass">
          <h3 className="text-slate-100 font-medium mb-2">Spending by Category</h3>
          <p className="text-xs text-slate-500 mb-1">This month</p>
          <CategoryChart spendingMap={spendingThisMonth} />
        </div>
        <div className="lg:col-span-3">
          <TransactionList limit={6} />
        </div>
      </div>
    </div>
  );
}