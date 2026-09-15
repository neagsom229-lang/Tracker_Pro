import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { useStore } from '../store/useStore';
import { formatMoney } from '../utils/format';

const DAYS_IN_WINDOW = 30;

/**
 * Builds the data Recharts needs: one point per day for the last 30
 * days, each holding the user's *running* (cumulative) balance as of
 * that day — not just that day's net change. This is what makes the
 * chart read as "your balance over time" rather than a noisy up/down
 * bar-per-day view.
 *
 * How it's computed:
 *  1. Split transactions into "before the window" and "within the
 *     window" by date string comparison (safe here because dates are
 *     stored as ISO 'YYYY-MM-DD', which sorts identically as strings
 *     or as actual dates).
 *  2. Sum everything before the window into `runningBalance` — this is
 *     the balance the user already had at the start of day 1 of the
 *     chart.
 *  3. Walk forward one calendar day at a time. On any day that has
 *     transactions, add their sum to `runningBalance`. Push a point for
 *     every day (even with no activity) so the line/area doesn't have
 *     gaps — a flat balance for a few days is a normal shape, not
 *     missing data.
 */
function buildTrendData(transactions) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const windowStart = new Date(today);
  windowStart.setDate(windowStart.getDate() - (DAYS_IN_WINDOW - 1));
  const windowStartISO = windowStart.toISOString().slice(0, 10);

  // Balance already banked before the chart's first day.
  let runningBalance = transactions
    .filter((t) => t.date < windowStartISO)
    .reduce((sum, t) => sum + t.amount, 0);

  // Group in-window transactions by date for O(1) lookup while walking days.
  const byDate = {};
  for (const t of transactions) {
    if (t.date >= windowStartISO) {
      byDate[t.date] = (byDate[t.date] ?? 0) + t.amount;
    }
  }

  const points = [];
  const cursor = new Date(windowStart);
  for (let i = 0; i < DAYS_IN_WINDOW; i++) {
    const iso = cursor.toISOString().slice(0, 10);
    runningBalance += byDate[iso] ?? 0;
    points.push({
      date: iso,
      // Short label for the X axis, e.g. "Jan 5" — full ISO date is
      // still available in `date` for the tooltip.
      label: cursor.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
      balance: runningBalance,
    });
    cursor.setDate(cursor.getDate() + 1);
  }
  return points;
}

function CustomTooltip({ active, payload, currency }) {
  if (!active || !payload?.length) return null;
  const point = payload[0].payload;
  return (
    <div className="glass-strong rounded-lg px-3 py-2 text-sm shadow-glass">
      <p className="text-slate-400 text-xs uppercase tracking-wide">{point.label}</p>
      <p className="text-slate-100 font-medium">{formatMoney(point.balance, currency)}</p>
    </div>
  );
}

export default function TrendChart() {
  const transactions = useStore((s) => s.transactions);
  const currency = useStore((s) => s.profile?.currency || 'USD');

  // Nothing to chart yet — show an animated placeholder rather than an
  // empty axis with a flat zero line, which looks like a bug rather
  // than "you haven't added anything yet".
  if (transactions.length === 0) {
    return (
      <div className="h-64 flex flex-col items-center justify-center gap-3 text-sm text-slate-500">
        <div className="w-16 h-16 rounded-full bg-gilt-gradient opacity-30 animate-glow-pulse" />
        <p>Your balance trend will appear here once you add a transaction.</p>
      </div>
    );
  }

  const data = buildTrendData(transactions);

  return (
    <div className="h-64">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
          <defs>
            {/* Fill fades from solid gold near the line to fully
                transparent at the bottom — the classic "area chart
                glow" look, built from the same gilt-gold token used
                for CTAs elsewhere in the app. */}
            <linearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#E8C77A" stopOpacity={0.35} />
              <stop offset="100%" stopColor="#E8C77A" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="rgba(255,255,255,0.05)" vertical={false} />
          <XAxis
            dataKey="label"
            tick={{ fill: '#64748B', fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            interval={Math.ceil(DAYS_IN_WINDOW / 6) - 1}
          />
          <YAxis hide domain={['dataMin - 20', 'dataMax + 20']} />
          <Tooltip content={<CustomTooltip currency={currency} />} />
          <Area
            type="monotone"
            dataKey="balance"
            stroke="#E8C77A"
            strokeWidth={2}
            fill="url(#trendFill)"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}