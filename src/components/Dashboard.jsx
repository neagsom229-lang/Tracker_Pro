import { Wallet, TrendingUp, TrendingDown } from 'lucide-react';
import { useStore, selectTotals, selectSpendingThisMonth } from '../store/useStore';
import StatCard from './StatCard';
import CategoryChart from './CategoryChart';
import TransactionList from './TransactionList';

export default function Dashboard() {
  const transactions = useStore((s) => s.transactions);
  const currency = useStore((s) => s.profile?.currency || "USD");
  const { totalBalance, totalIncome, totalExpenses } = selectTotals(transactions);
  const spendingThisMonth = selectSpendingThisMonth(transactions);

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard label="Total Balance" value={totalBalance} currency={currency} icon={Wallet} tone="neutral" delay={0} />
        <StatCard label="Total Income" value={totalIncome} currency={currency} icon={TrendingUp} tone="income" delay={0.05} />
        <StatCard label="Total Expenses" value={totalExpenses} currency={currency} icon={TrendingDown} tone="expense" delay={0.1} />
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
