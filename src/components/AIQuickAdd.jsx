import { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Wand2, Loader2, Check, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { useStore } from '../store/useStore';
import { useProStatus } from '../hooks/useProStatus';
import { parseTransactionText } from '../lib/ai';
import { parseQuickAddText } from '../utils/parseQuickAdd';
import { CATEGORIES, getCategory } from '../utils/constants';

/**
 * Natural-language Quick Add: type a sentence, get an editable preview,
 * confirm to add. Two-pass parsing:
 *
 *  1. LOCAL (parseQuickAddText, synchronous, free, no network) runs on
 *     submit and produces a preview almost instantly — this is what
 *     makes the <100ms perceived-response budget trivially achievable
 *     for the common case.
 *  2. AI FALLBACK (the existing parse-transaction Edge Function) only
 *     runs when the local pass has low confidence (missing amount, or
 *     no category keyword matched anything). This is a real network
 *     call with real latency — "perceived response" for THIS path
 *     means the preview card appears immediately in a loading state
 *     (so the UI acknowledges the input within the same budget). It
 *     would be dishonest to also claim the AI call itself resolves in
 *     under 100ms; it doesn't, and no local rewrite of this component
 *     can make a third-party network round trip do that.
 *
 * GATING CHANGE from the previous version of this component, worth
 * calling out explicitly rather than leaving implicit: the whole
 * component used to be Pro-only, because every submission was an
 * OpenAI call. Now that local parsing handles the common case for
 * free, gating the ENTIRE feature behind Pro no longer matches its
 * actual cost shape. New behavior: local-only parsing (confidence
 * 'high', or a free user manually fixing a 'low'-confidence guess in
 * the preview) works for everyone; the AI fallback call specifically
 * is what's Pro-gated. A free user who types something ambiguous still
 * gets a preview card — just with the raw local guess (e.g. category
 * defaulting to "other") instead of an AI-enhanced one — and can
 * correct it inline before confirming, same as a Pro user always could.
 */
export default function AIQuickAdd() {
  const { isPro } = useProStatus();
  const addTransaction = useStore((s) => s.addTransaction);
  const parseCorrections = useStore((s) => s.parseCorrections);
  const saveParseCorrection = useStore((s) => s.saveParseCorrection);

  const [text, setText] = useState('');
  const [preview, setPreview] = useState(null); // { description, amount, date, category, direction, matchedKeyword }
  const [aiLoading, setAiLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const visibleCategories = useMemo(
    () => CATEGORIES.filter((c) => c.type === (preview?.direction || 'expense')),
    [preview?.direction]
  );

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!text.trim() || preview) return;

    const local = parseQuickAddText(text.trim(), parseCorrections);

    if (local.confidence === 'high' || !isPro) {
      // High confidence never needs AI. Low confidence for a free user
      // also skips AI (that's the Pro-gated part) — they get the raw
      // local guess and fix it inline instead.
      setPreview(local);
      return;
    }

    // Low confidence + Pro: show the local guess immediately (this is
    // the "preview appears within budget" part), then enhance it with
    // the AI result once it resolves.
    setPreview(local);
    setAiLoading(true);
    try {
      const aiResult = await parseTransactionText(text.trim());
      const isIncome = getCategory(aiResult.category).type === 'income';
      setPreview({
        description: aiResult.description,
        amount: aiResult.amount,
        date: aiResult.date,
        category: aiResult.category,
        direction: isIncome ? 'income' : 'expense',
        matchedKeyword: local.matchedKeyword, // keep the local guess's keyword for correction-learning purposes
      });
    } catch (err) {
      toast.error(`Couldn't improve that guess: ${err.message} — you can still edit it below.`);
    } finally {
      setAiLoading(false);
    }
  };

  const handleConfirm = async () => {
    if (!preview.amount || preview.amount <= 0) return toast.error('Enter an amount greater than zero.');
    setSubmitting(true);
    try {
      await addTransaction({
        description: preview.description,
        amount: preview.direction === 'income' ? preview.amount : -preview.amount,
        category: preview.category,
        date: preview.date,
      });

      // Learn from this submission: if we have a keyword to hang the
      // correction on (either the one the local parser matched, or a
      // fallback derived from the description) and the user's final
      // category differs from a plain re-parse of the same text, save
      // it — next time this keyword appears, it'll resolve correctly
      // and with high confidence on the FIRST (local, free) pass.
      const fallbackKeyword = preview.description.toLowerCase().split(/\s+/).find((w) => w.length > 2 && !/^\d+$/.test(w));
      const keyword = preview.matchedKeyword || fallbackKeyword;
      const reparsed = parseQuickAddText(text.trim(), parseCorrections);
      if (keyword && reparsed.category !== preview.category) {
        saveParseCorrection(keyword, preview.category);
      }

      setText('');
      setPreview(null);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancel = () => {
    setPreview(null);
    setAiLoading(false);
  };

  return (
    <div className="glass rounded-2xl shadow-glass overflow-hidden">
      {!preview ? (
        <form onSubmit={handleSubmit} className="p-3 pl-4 flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-gilt-gradient flex items-center justify-center shrink-0">
            <Wand2 size={15} className="text-obsidian-950" />
          </div>
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder='Try "coffee 4.50 at Brown yesterday"…'
            className="flex-1 bg-transparent text-sm text-slate-200 placeholder:text-slate-500 focus:outline-none"
          />
          <button
            type="submit"
            disabled={!text.trim()}
            className="gilt-btn rounded-lg px-3 py-1.5 text-xs font-medium disabled:opacity-50"
          >
            Parse
          </button>
        </form>
      ) : (
        <AnimatePresence mode="wait">
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="p-4">
            {aiLoading && (
              <p className="flex items-center gap-1.5 text-xs text-slate-500 mb-3">
                <Loader2 size={11} className="animate-spin" /> Improving this guess…
              </p>
            )}

            <div className="grid grid-cols-2 gap-2.5 mb-3">
              <div className="col-span-2">
                <label className="text-[11px] text-slate-500 mb-1 block">Description</label>
                <input
                  value={preview.description}
                  onChange={(e) => setPreview((p) => ({ ...p, description: e.target.value }))}
                  className="w-full bg-obsidian-800/60 border border-white/8 rounded-lg px-2.5 py-2 text-sm text-slate-200 focus:outline-none"
                />
              </div>
              <div>
                <label className="text-[11px] text-slate-500 mb-1 block">Amount</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={preview.amount ?? ''}
                  onChange={(e) => setPreview((p) => ({ ...p, amount: parseFloat(e.target.value) || null }))}
                  className="w-full bg-obsidian-800/60 border border-white/8 rounded-lg px-2.5 py-2 text-sm text-slate-200 focus:outline-none"
                />
              </div>
              <div>
                <label className="text-[11px] text-slate-500 mb-1 block">Date</label>
                <input
                  type="date"
                  value={preview.date}
                  onChange={(e) => setPreview((p) => ({ ...p, date: e.target.value }))}
                  className="w-full bg-obsidian-800/60 border border-white/8 rounded-lg px-2.5 py-2 text-sm text-slate-200 focus:outline-none"
                />
              </div>
              <div>
                <label className="text-[11px] text-slate-500 mb-1 block">Type</label>
                <div className="flex rounded-lg overflow-hidden border border-white/8">
                  {['expense', 'income'].map((dir) => (
                    <button
                      key={dir}
                      type="button"
                      onClick={() =>
                        setPreview((p) => ({ ...p, direction: dir, category: CATEGORIES.find((c) => c.type === dir).id }))
                      }
                      className={`flex-1 py-2 text-xs capitalize ${
                        preview.direction === dir ? 'bg-white/10 text-slate-100' : 'text-slate-500'
                      }`}
                    >
                      {dir}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-[11px] text-slate-500 mb-1 block">Category</label>
                <select
                  value={preview.category}
                  onChange={(e) => setPreview((p) => ({ ...p, category: e.target.value }))}
                  className="w-full bg-obsidian-800/60 border border-white/8 rounded-lg px-2.5 py-2 text-sm text-slate-200 focus:outline-none"
                >
                  {visibleCategories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex gap-2">
              <button
                onClick={handleConfirm}
                disabled={submitting || aiLoading}
                className="flex-1 gilt-btn rounded-lg py-2 text-sm flex items-center justify-center gap-1.5 disabled:opacity-60"
              >
                <Check size={14} /> {submitting ? 'Adding…' : 'Confirm'}
              </button>
              <button
                onClick={handleCancel}
                disabled={submitting}
                className="rounded-lg px-3 py-2 text-sm border border-white/10 text-slate-400 hover:text-slate-200 flex items-center gap-1.5"
              >
                <X size={14} /> Cancel
              </button>
            </div>
          </motion.div>
        </AnimatePresence>
      )}
    </div>
  );
}