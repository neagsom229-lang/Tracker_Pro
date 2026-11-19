import AnimatedCounter from './AnimatedCounter';

const toneStyles = {
  neutral: { icon: 'text-gilt-gold bg-gilt-gold/10', text: 'text-slate-100' },
  income: { icon: 'text-income bg-income-soft', text: 'text-income' },
  expense: { icon: 'text-expense bg-expense-soft', text: 'text-expense' },
};

export default function StatCard({ label, value, currency, icon: Icon, tone = 'neutral' }) {
  const styles = toneStyles[tone];
  return (
    <div className="glass rounded-2xl p-5 shadow-glass flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <span className="text-sm text-slate-400">{label}</span>
        <div className={`p-2 rounded-xl ${styles.icon}`}>
          <Icon size={18} strokeWidth={2} />
        </div>
      </div>
      <div className={`text-2xl font-semibold tabular-nums ${styles.text}`}>
        <AnimatedCounter value={value} currencyCode={currency} />
      </div>
    </div>
  );
}
