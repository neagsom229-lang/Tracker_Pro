import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { getCategory } from '../utils/constants';
import { formatMoney } from '../utils/format';
import { useStore } from '../store/useStore';

function CustomTooltip({ active, payload, currency }) {
  if (!active || !payload?.length) return null;
  const { name, value } = payload[0];
  return (
    <div className="glass-strong rounded-lg px-3 py-2 text-sm shadow-glass">
      <p className="text-slate-200">{name}</p>
      <p className="text-slate-400">{formatMoney(value, currency)}</p>
    </div>
  );
}

export default function CategoryChart({ spendingMap }) {
  const currency = useStore((s) => s.profile?.currency || "USD");
  const entries = Object.entries(spendingMap);

  if (entries.length === 0) {
    return (
      <div className="h-64 flex items-center justify-center text-sm text-slate-500">
        No expenses yet — add a transaction to see your breakdown.
      </div>
    );
  }

  const data = entries.map(([categoryId, value]) => {
    const cat = getCategory(categoryId);
    return { name: cat.label, value, color: cat.color };
  });

  return (
    <div className="h-64">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            dataKey="value"
            nameKey="name"
            cx="50%"
            cy="50%"
            innerRadius={55}
            outerRadius={85}
            paddingAngle={3}
            strokeWidth={0}
          >
            {data.map((entry) => (
              <Cell key={entry.name} fill={entry.color} />
            ))}
          </Pie>
          <Tooltip content={<CustomTooltip currency={currency} />} />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}
