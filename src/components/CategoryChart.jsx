import { useMemo, useState } from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft } from 'lucide-react';
import { getCategory } from '../utils/constants';
import { formatMoney, formatDate } from '../utils/format';
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

/**
 * CategoryChart
 * -------------
 * Donut of spend by category, with click-to-drill-down.
 *
 * `transactions` is the ALREADY RANGE-FILTERED list from Dashboard, and
 * `spendingMap` is derived from the same list. Passing both looks
 * redundant but isn't: the map is what the chart renders, and the raw
 * list is what the drill-down needs. Recomputing the list from the map
 * is impossible (the map has lost the individual rows), and recomputing
 * the map here would duplicate a memo Dashboard already owns.
 */
export default function CategoryChart({ spendingMap, transactions = [] }) {
  const currency = useStore((s) => s.profile?.currency || 'USD');
  const openTransactionModal = useStore((s) => s.openTransactionModal);
  const [drilldown, setDrilldown] = useState(null); // category id or null
  const [showTable, setShowTable] = useState(false);
  const [focused, setFocused] = useState(null);

  // Derived values are all declared before the first use and before any
  // early return. (Reading `data` above its useMemo was a TDZ crash.)
  const entries = Object.entries(spendingMap);

  const data = useMemo(
    () =>
      entries
        .map(([categoryId, value]) => {
          const cat = getCategory(categoryId);
          return { id: categoryId, name: cat.label, value, color: cat.color };
        })
        // Skill rule: sorted bar/donut — descending by value.
        .sort((a, b) => (b.value || 0) - (a.value || 0)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [spendingMap]
  );

  const total = data.reduce((s, d) => s + Math.abs(d.value), 0);
  const summary = data.length
    ? `Spending by category: ${data[0].name} ${formatMoney(Math.abs(data[0].value), currency)} (${Math.round((Math.abs(data[0].value) / total) * 100)}% of spending)`
    : '';

  const drilldownRows = useMemo(() => {
    if (!drilldown) return [];
    return transactions
      .filter((t) => t.category === drilldown && t.amount < 0)
      .sort((a, b) => (a.date < b.date ? 1 : -1));
  }, [drilldown, transactions]);

  if (entries.length === 0) {
    return (
      <div className="h-64 flex items-center justify-center text-sm text-slate-500 text-center px-4">
        No expenses in this range — add a transaction or widen the date filter.
      </div>
    );
  }

  if (drilldown) {
    const cat = getCategory(drilldown);
    const total = spendingMap[drilldown] || 0;

    return (
      <AnimatePresence mode="wait">
        <motion.div
          key="drilldown"
          initial={{ opacity: 0, x: 12 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -12 }}
          className="h-64 flex flex-col"
        >
          <div className="flex items-center gap-2 mb-3 shrink-0">
            <button
              onClick={() => setDrilldown(null)}
              className="text-slate-400 hover:text-slate-100 transition-colors p-1 -ml-1"
              aria-label="Back to all categories"
            >
              <ArrowLeft size={15} />
            </button>
            <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: cat.color }} />
            <span className="text-sm text-slate-100 font-medium">{cat.label}</span>
            <span className="text-xs text-slate-500 ml-auto">
              {formatMoney(total, currency)} · {drilldownRows.length} item
              {drilldownRows.length === 1 ? '' : 's'}
            </span>
          </div>

          <div className="flex-1 overflow-y-auto overscroll-contain -mr-1 pr-1">
            {drilldownRows.map((t) => (
              <button
                key={t.id}
                onClick={() => openTransactionModal(t.id)}
                className="w-full flex items-center justify-between gap-3 py-2 px-2 -mx-2 rounded-lg hover:bg-white/5 transition-colors text-left"
              >
                <div className="min-w-0">
                  <p className="text-sm text-slate-200 truncate">{t.description}</p>
                  <p className="text-[11px] text-slate-500">{formatDate(t.date)}</p>
                </div>
                <span className="text-sm text-expense shrink-0">{formatMoney(t.amount, currency)}</span>
              </button>
            ))}
          </div>
        </motion.div>
      </AnimatePresence>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => setShowTable((v) => !v)}
          aria-expanded={showTable}
          className="text-xs text-slate-300 hover:text-slate-100 hover:bg-white/5 rounded-lg px-3 py-1.5 flex items-center gap-1.5 cursor-pointer transition-colors"
        >
          {showTable ? 'Hide table' : 'View as table'}
        </button>
        {summary && (
          <p role="status" className="text-xs text-slate-500 truncate" title={summary}>
            {summary}
            {focused ? ` · focused: ${focused.name} ${formatMoney(Math.abs(focused.value), currency)}` : ''}
          </p>
        )}
      </div>

      <div
        // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex
        tabIndex={0}
        role="img"
        aria-label="Spending by category chart"
        onFocus={() => setFocused(data[0])}
        onBlur={() => setFocused(null)}
        className="h-64 cursor-pointer"
      >
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
              // Recharts fires this with the datum, not the DOM event, so
              // the category id has to be carried on the datum itself.
              onClick={(slice) => slice?.id && setDrilldown(slice.id)}
              className="cursor-pointer focus:outline-none"
            >
              {data.map((entry) => (
                <Cell key={entry.name} fill={entry.color} />
              ))}
            </Pie>
            <Tooltip content={<CustomTooltip currency={currency} />} />
          </PieChart>
        </ResponsiveContainer>
      </div>

      {/* Visible labels — never color alone. */}
      <ul className="flex flex-wrap gap-x-4 gap-y-1" aria-label="Category amounts">
        {data.map((d) => (
          <li key={d.id} className="flex items-center gap-1.5 text-xs text-slate-300">
            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: d.color }} />
            <span className="truncate">{d.name}</span>
            <span className="tabular-nums text-slate-400">
              {formatMoney(Math.abs(d.value), currency)} ({Math.round((Math.abs(d.value) / total) * 100)}%)
            </span>
          </li>
        ))}
      </ul>

      {showTable && (
        <table className="w-full text-sm mt-1 border-collapse">
          <thead>
            <tr className="text-xs text-slate-400 border-b border-white/5 pb-1">
              <th className="text-left py-1 pr-3 font-normal">Category</th>
              <th className="text-right w-28 py-1 tabular-nums font-normal">Spent</th>
              <th className="text-right w-16 py-1 tabular-nums font-normal">%</th>
            </tr>
          </thead>
          <tbody>
            {data.map((d) => (
              <tr key={d.id} className="border-b border-white/5 last:border-b-0">
                <td className="py-1 text-slate-200">
                  <span className="inline-block w-2 h-2 rounded-full mr-1.5" style={{ backgroundColor: d.color }} />
                  {d.name}
                </td>
                <td className="py-1 text-right tabular-nums text-expense">{formatMoney(Math.abs(d.value), currency)}</td>
                <td className="py-1 text-right tabular-nums text-slate-400">
                  {total > 0 ? Math.round((Math.abs(d.value) / total) * 100) : 0}%
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}