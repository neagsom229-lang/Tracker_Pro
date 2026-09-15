import { useMemo } from 'react';
import { AreaChart, Area, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ReferenceLine } from 'recharts';
import { useStore } from '../store/useStore';
import { formatMoney } from '../utils/format';
import { addInterval } from '../utils/recurrence';

const FORECAST_DAYS = 30;

function toISO(date) {
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

function shortLabel(date) {
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/**
 * Builds the historical series: one point per day for the selected
 * window, each holding the RUNNING (cumulative) balance as of that day.
 *
 * 1. Split transactions into "before the window" and "within it" by
 *    string comparison — safe because dates are ISO 'YYYY-MM-DD', which
 *    sorts identically as strings and as dates.
 * 2. Sum everything before the window into `runningBalance`: the balance
 *    the user already had on day 1 of the chart.
 * 3. Walk forward one day at a time, pushing a point for every day even
 *    when nothing happened, so a flat stretch reads as a flat line
 *    rather than a gap.
 */
function buildHistory(transactions, windowDays) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const windowStart = new Date(today);
  windowStart.setDate(windowStart.getDate() - (windowDays - 1));
  const windowStartISO = toISO(windowStart);

  let runningBalance = transactions
    .filter((t) => t.date < windowStartISO)
    .reduce((sum, t) => sum + t.amount, 0);

  const byDate = {};
  for (const t of transactions) {
    if (t.date >= windowStartISO) byDate[t.date] = (byDate[t.date] ?? 0) + t.amount;
  }

  const points = [];
  const cursor = new Date(windowStart);
  for (let i = 0; i < windowDays; i++) {
    const iso = toISO(cursor);
    runningBalance += byDate[iso] ?? 0;
    points.push({ date: iso, label: shortLabel(cursor), balance: runningBalance, forecast: null });
    cursor.setDate(cursor.getDate() + 1);
  }

  return { points, endingBalance: runningBalance, todayISO: toISO(today) };
}

/**
 * Projects the balance forward using only what we actually know is
 * coming: the user's recurring rules. That's a deliberately conservative
 * model — it does NOT extrapolate discretionary spending from an
 * average, because a forecast that says "you'll be broke in three weeks"
 * based on a fortnight of holiday spending is worse than no forecast.
 * What this answers is the question a recurring-rules feature earns the
 * right to answer: given the bills and income I've already told you
 * about, where does my balance land?
 */
function buildForecast(recurring, startBalance, startISO) {
  if (recurring.length === 0) return [];

  // Pre-compute the dated hits for each rule across the horizon, rather
  // than testing every rule against every day.
  const byDate = {};
  const horizonEnd = new Date(`${startISO}T00:00:00`);
  horizonEnd.setDate(horizonEnd.getDate() + FORECAST_DAYS);
  const horizonEndISO = toISO(horizonEnd);

  for (const rule of recurring) {
    let next = rule.nextRunDate;
    // A rule whose nextRunDate is in the past is already handled by
    // processRecurring on load, so start from the later of the two.
    if (next <= startISO) next = addInterval(next > startISO ? next : startISO, rule.frequency);

    let guard = 0;
    while (next <= horizonEndISO && guard < 60) {
      byDate[next] = (byDate[next] ?? 0) + rule.amount;
      next = addInterval(next, rule.frequency);
      guard += 1;
    }
  }

  const points = [];
  let running = startBalance;
  const cursor = new Date(`${startISO}T00:00:00`);

  for (let i = 0; i < FORECAST_DAYS; i++) {
    cursor.setDate(cursor.getDate() + 1);
    const iso = toISO(cursor);
    running += byDate[iso] ?? 0;
    points.push({ date: iso, label: shortLabel(cursor), balance: null, forecast: running, isForecast: true });
  }

  return points;
}

function CustomTooltip({ active, payload, currency }) {
  if (!active || !payload?.length) return null;
  const point = payload[0].payload;
  const value = point.isForecast ? point.forecast : point.balance;
  return (
    <div className="glass-strong rounded-lg px-3 py-2 text-sm shadow-glass">
      <p className="text-slate-400 text-xs uppercase tracking-wide">
        {point.label}
        {point.isForecast && <span className="text-gilt-purple ml-1.5 normal-case">projected</span>}
      </p>
      <p className="text-slate-100 font-medium">{formatMoney(value, currency)}</p>
    </div>
  );
}

export default function TrendChart({ transactions, windowDays = 30, showForecast = true }) {
  const currency = useStore((s) => s.profile?.currency || 'USD');
  const recurring = useStore((s) => s.recurring);

  const { data, todayLabel, hasForecast } = useMemo(() => {
    if (transactions.length === 0) return { data: [], todayLabel: null, hasForecast: false };

    const { points, endingBalance, todayISO } = buildHistory(transactions, windowDays);
    const forecast = showForecast ? buildForecast(recurring, endingBalance, todayISO) : [];

    // Seed the forecast series on today's point so the two lines meet
    // instead of leaving a one-day gap at the join.
    if (forecast.length > 0 && points.length > 0) {
      points[points.length - 1] = { ...points[points.length - 1], forecast: endingBalance };
    }

    return {
      data: [...points, ...forecast],
      todayLabel: points.length > 0 ? points[points.length - 1].label : null,
      hasForecast: forecast.length > 0,
    };
  }, [transactions, windowDays, recurring, showForecast]);

  if (transactions.length === 0) {
    return (
      <div className="h-64 flex flex-col items-center justify-center gap-3 text-sm text-slate-500 text-center px-4">
        <div className="w-16 h-16 rounded-full bg-gilt-gradient opacity-30 animate-glow-pulse" />
        <p>Your balance trend will appear here once you add a transaction.</p>
      </div>
    );
  }

  return (
    <>
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
            <defs>
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
              // Always about six labels regardless of how wide the window
              // is, so 90D doesn't turn the axis into a grey smear.
              interval={Math.max(Math.ceil(data.length / 6) - 1, 0)}
            />
            <YAxis hide domain={['dataMin - 20', 'dataMax + 20']} />
            <Tooltip content={<CustomTooltip currency={currency} />} />

            {hasForecast && todayLabel && (
              <ReferenceLine
                x={todayLabel}
                stroke="rgba(159,122,234,0.5)"
                strokeDasharray="3 3"
                label={{ value: 'today', fill: '#9F7AEA', fontSize: 10, position: 'insideTopRight' }}
              />
            )}

            <Area type="monotone" dataKey="balance" stroke="#E8C77A" strokeWidth={2} fill="url(#trendFill)" />

            {/* Dashed and unfilled on purpose: a solid filled area would
                read as recorded history rather than a projection. */}
            {hasForecast && (
              <Line
                type="monotone"
                dataKey="forecast"
                stroke="#9F7AEA"
                strokeWidth={2}
                strokeDasharray="4 4"
                dot={false}
              />
            )}
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {showForecast && !hasForecast && (
        <p className="text-xs text-slate-600 mt-2">
          Add recurring rules to see a 30-day cash-flow projection here.
        </p>
      )}
    </>
  );
}