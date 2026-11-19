import { useMemo, useState } from 'react';
import { AreaChart, Area, XAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { Plus, Trash2, TrendingUp, Sparkles } from 'lucide-react';
import { useStore } from '../store/useStore';
import { useProStatus } from '../hooks/useProStatus';
import { formatMoney } from '../utils/format';

const ASSET_TYPES = [
  { id: 'cash', label: 'Cash / Bank' },
  { id: 'investment', label: 'Investment' },
  { id: 'property', label: 'Property' },
  { id: 'debt', label: 'Debt (loan, credit card, etc.)' },
];

function CustomTooltip({ active, payload, currency }) {
  if (!active || !payload?.length) return null;
  const point = payload[0].payload;
  return (
    <div className="glass-strong rounded-lg px-3 py-2 text-sm shadow-glass">
      <p className="text-slate-400 text-xs">{new Date(`${point.date}T00:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</p>
      <p className="text-slate-100 font-medium">{formatMoney(point.netWorth, currency)}</p>
    </div>
  );
}

export default function NetWorth() {
  const { isPro } = useProStatus();
  const openUpgradeModal = useStore((s) => s.openUpgradeModal);
  const assets = useStore((s) => s.assets);
  const netWorthHistory = useStore((s) => s.netWorthHistory);
  const currency = useStore((s) => s.profile?.currency || 'USD');
  const addAsset = useStore((s) => s.addAsset);
  const removeAsset = useStore((s) => s.removeAsset);

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: '', type: 'cash', value: '' });
  const [submitting, setSubmitting] = useState(false);

  const { totalAssets, totalDebts, netWorth } = useMemo(() => {
    const totalAssets = assets.filter((a) => a.type !== 'debt').reduce((sum, a) => sum + a.value, 0);
    const totalDebts = assets.filter((a) => a.type === 'debt').reduce((sum, a) => sum + a.value, 0);
    return { totalAssets, totalDebts, netWorth: totalAssets - totalDebts };
  }, [assets]);

  if (!isPro) {
    return (
      <div className="glass rounded-2xl p-5 shadow-glass flex-1 flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gilt-gradient/20 flex items-center justify-center shrink-0">
            <TrendingUp size={17} className="text-gilt-gold" />
          </div>
          <div>
            <p className="text-sm text-slate-200 font-medium">Net Worth</p>
            <p className="text-xs text-slate-500">Track assets and debts in one place. Pro feature.</p>
          </div>
        </div>
        <button onClick={() => openUpgradeModal('Net Worth')} className="gilt-btn rounded-xl px-4 py-2 text-sm flex items-center gap-1.5">
          <Sparkles size={13} /> Unlock
        </button>
      </div>
    );
  }

  const handleAdd = async (e) => {
    e.preventDefault();
    const value = parseFloat(form.value);
    if (!form.name.trim() || !value || value < 0) return;
    setSubmitting(true);
    await addAsset({ name: form.name.trim(), type: form.type, value });
    setForm({ name: '', type: 'cash', value: '' });
    setSubmitting(false);
  };

  return (
    <div className="glass rounded-2xl p-5 shadow-glass flex-1">
      <div className="flex items-center justify-between mb-1">
        <h3 className="text-slate-100 font-medium">Net Worth</h3>
        <button onClick={() => setShowForm((v) => !v)} className="text-xs text-slate-500 hover:text-slate-300">
          {showForm ? 'Done' : 'Manage'}
        </button>
      </div>

      <p className={`text-3xl font-semibold mb-1 ${netWorth >= 0 ? 'text-slate-100' : 'text-expense'}`}>
        {formatMoney(netWorth, currency)}
      </p>
      <p className="text-xs text-slate-500 mb-4">
        {formatMoney(totalAssets, currency)} assets — {formatMoney(totalDebts, currency)} debts
      </p>

      {netWorthHistory.length >= 2 ? (
        <div className="h-32 mb-2">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={netWorthHistory} margin={{ top: 4, right: 4, left: 4, bottom: 0 }}>
              <defs>
                <linearGradient id="netWorthFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#E8C77A" stopOpacity={0.3} />
                  <stop offset="100%" stopColor="#E8C77A" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="date" hide />
              <Tooltip content={<CustomTooltip currency={currency} />} />
              <Area type="monotone" dataKey="netWorth" stroke="#E8C77A" strokeWidth={2} fill="url(#netWorthFill)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <p className="text-xs text-slate-600 italic mb-2">
          Your trend line will build up day by day as your net worth changes — there&apos;s no way to show history from before you started tracking it here.
        </p>
      )}

      {showForm && (
        <div className="mt-3 pt-3 border-t border-white/8">
          <form onSubmit={handleAdd} className="flex flex-wrap gap-2 mb-3">
            <input
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="e.g. Savings account"
              className="flex-1 min-w-[120px] bg-obsidian-800/60 border border-white/8 rounded-lg px-2.5 py-2 text-sm text-slate-200 placeholder:text-slate-500 focus:outline-none"
            />
            <select
              value={form.type}
              onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}
              className="bg-obsidian-800/60 border border-white/8 rounded-lg px-2.5 py-2 text-sm text-slate-200 focus:outline-none"
            >
              {ASSET_TYPES.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </select>
            <input
              type="number"
              step="0.01"
              min="0"
              value={form.value}
              onChange={(e) => setForm((f) => ({ ...f, value: e.target.value }))}
              placeholder="Value"
              className="w-24 bg-obsidian-800/60 border border-white/8 rounded-lg px-2.5 py-2 text-sm text-slate-200 placeholder:text-slate-500 focus:outline-none"
            />
            <button type="submit" disabled={submitting} className="gilt-btn rounded-lg px-3 disabled:opacity-60">
              <Plus size={15} />
            </button>
          </form>

          <div className="flex flex-col gap-1.5 max-h-40 overflow-y-auto">
            {assets.map((a) => (
              <div key={a.id} className="flex items-center justify-between text-sm">
                <span className="text-slate-300">
                  {a.name} <span className="text-slate-600 text-xs">({ASSET_TYPES.find((t) => t.id === a.type)?.label})</span>
                </span>
                <div className="flex items-center gap-2">
                  <span className={a.type === 'debt' ? 'text-expense' : 'text-slate-300'}>{formatMoney(a.value, currency)}</span>
                  <button onClick={() => removeAsset(a.id)} className="text-slate-600 hover:text-expense" aria-label={`Remove ${a.name}`}>
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            ))}
            {assets.length === 0 && <p className="text-xs text-slate-500">Add your first asset or debt above.</p>}
          </div>
        </div>
      )}
    </div>
  );
}