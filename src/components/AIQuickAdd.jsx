import { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Wand2, Loader2, Check, X, Sparkles } from 'lucide-react';
import { supabase } from '../lib/supabaseClient';
import { useStore } from '../store/useStore';
import { getCategory } from '../utils/constants';
import { formatMoney, formatDate } from '../utils/format';

/**
 * AIQuickAdd
 * ----------
 * Type "Spent $15 on lunch today" → a transaction appears.
 *
 * Two things worth knowing before you change this:
 *
 * 1. THE ROW IS ALREADY SAVED BY THE TIME THE REVIEW CARD APPEARS. The
 *    parse-transaction Edge Function inserts the transaction itself and
 *    returns it — "Keep it" just clears the review UI, and "Discard"
 *    issues a real delete. This trades the safety of a client-side
 *    confirm-before-write for a simpler function contract; it means a
 *    parse the user never revisits (they navigate away mid-review)
 *    leaves a real row behind rather than nothing. If that turns out to
 *    matter in practice, moving confirmation back to the client — parse
 *    returns a draft, a separate endpoint or store action inserts it —
 *    is the fix.
 *
 * 2. NO API KEY LIVES HERE. This component only ever calls our own
 *    Supabase Edge Function, authenticated with the user's own access
 *    token. The OpenAI key exists only as a Supabase secret, readable
 *    by the function's Deno process and nothing else. See
 *    supabase/functions/parse-transaction/index.ts.
 */

// The user's LOCAL calendar date, not UTC. `new Date().toISOString()`
// would tell the model it's already tomorrow for anyone east of UTC —
// which in Phnom Penh (UTC+7) means every evening entry lands on the
// wrong day.
function localTodayISO() {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

const EXAMPLES = ['Spent $15 on lunch today', 'Grab to work 3.50', 'Got paid 1200 salary yesterday'];

export default function AIQuickAdd() {
  // The Edge Function now inserts the row itself and returns it, so this
  // component only needs to splice the confirmed result into local
  // state -- calling the store's addTransaction() here would insert a
  // second, duplicate row.
  const receiveExternalTransaction = useStore((s) => s.receiveExternalTransaction);
  const currency = useStore((s) => s.profile?.currency || 'USD');

  const [text, setText] = useState('');
  const [parsing, setParsing] = useState(false);
  const [discarding, setDiscarding] = useState(false);
  const [draft, setDraft] = useState(null); // parsed result awaiting confirmation
  const [error, setError] = useState('');
  const inputRef = useRef(null);

  const handleParse = async () => {
    const input = text.trim();
    if (!input || parsing) return;

    setParsing(true);
    setError('');
    setDraft(null);

    try {
      // A fresh token, not a cached one: if the user has had the tab
      // open for an hour the old access_token is expired and the
      // function would reject it as unauthenticated.
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) throw new Error('Your session expired — please sign in again.');

      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/parse-transaction`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ text: input, today: localTodayISO() }),
      });

      const body = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(body.error || "Couldn't read that. Try including an amount, e.g. \u201cSpent $15 on lunch\u201d.");
      }

      setDraft(body); // { transaction, usage, mocked }
    } catch (err) {
      setError(err.message);
    } finally {
      setParsing(false);
    }
  };

  const handleConfirm = () => {
    if (!draft) return;
    // The row is already in Postgres (the function inserted it during
    // Parse) -- this just makes the UI catch up. No network call, no
    // chance of a duplicate insert.
    receiveExternalTransaction(draft.transaction);
    setDraft(null);
    setText('');
    inputRef.current?.focus();
  };

  const removeTransaction = useStore((s) => s.deleteTransaction);

  const handleDiscard = async () => {
    // The row already exists in Postgres by this point (Parse inserted
    // it), so "Discard" has to actually delete it -- otherwise it stays
    // in the ledger even though the UI shows nothing was added.
    if (!draft) return;
    setDiscarding(true);
    await removeTransaction(draft.transaction.id);
    setDiscarding(false);
    setDraft(null);
    inputRef.current?.focus();
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (draft) handleConfirm();
      else handleParse();
    }
    if (e.key === 'Escape' && draft) handleDiscard();
  };

  const category = draft ? getCategory(draft.transaction.category) : null;
  const signedAmount = draft ? draft.transaction.amount : 0;

  return (
    <div className="glass rounded-2xl p-4 sm:p-5 shadow-glass">
      <div className="flex items-center gap-2 mb-3">
        <Sparkles size={14} className="text-gilt-gold" />
        <h3 className="text-slate-100 font-medium text-sm">Quick Add</h3>
        <span className="text-[10px] uppercase tracking-wide text-slate-500 border border-white/8 rounded-full px-2 py-0.5">
          AI
        </span>
      </div>

      {/* Stacks on narrow screens so the input never gets squeezed to an
          unusable width on a 375px device. */}
      <div className="flex flex-col sm:flex-row gap-2">
        <input
          ref={inputRef}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            if (draft) setDraft(null);
            if (error) setError('');
          }}
          onKeyDown={handleKeyDown}
          disabled={parsing}
          placeholder="Spent $15 on lunch today…"
          aria-label="Describe a transaction in plain language"
          className="flex-1 min-w-0 bg-obsidian-800/60 border border-white/8 rounded-xl px-3.5 py-2.5 text-sm text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-gilt-gold/60 focus:ring-2 focus:ring-gilt-gold/25 transition disabled:opacity-60"
        />
        <button
          onClick={handleParse}
          disabled={parsing || !text.trim()}
          className="gilt-btn rounded-xl px-4 py-2.5 text-sm flex items-center justify-center gap-2 disabled:opacity-50 shrink-0"
        >
          {parsing ? <Loader2 size={15} className="animate-spin" /> : <Wand2 size={15} />}
          {parsing ? 'Reading…' : 'Parse'}
        </button>
      </div>

      <div aria-live="polite">
        <AnimatePresence mode="wait">
          {error && (
            <motion.p
              key="error"
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="text-xs text-expense mt-2.5"
            >
              {error}
            </motion.p>
          )}

          {draft && (
            <motion.div
              key="draft"
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              className="mt-3 rounded-xl border border-gilt-gold/25 bg-gilt-gold/5 p-3"
            >
              <p className="text-[11px] text-slate-400 mb-2">Saved -- check it looks right, or discard it:</p>

              <div className="flex items-center gap-3 flex-wrap">
                <span
                  className="w-2 h-2 rounded-full shrink-0"
                  style={{ backgroundColor: category.color }}
                  aria-hidden="true"
                />
                <span className="text-sm text-slate-100 font-medium truncate max-w-[40%]">{draft.transaction.description}</span>
                <span className="text-xs text-slate-400">{category.label}</span>
                <span className="text-xs text-slate-500">{formatDate(draft.transaction.date)}</span>
                <span
                  className={`text-sm font-semibold ml-auto ${signedAmount >= 0 ? 'text-income' : 'text-expense'}`}
                >
                  {formatMoney(signedAmount, currency)}
                </span>
              </div>

              <div className="flex gap-2 mt-3">
                <button
                  onClick={handleConfirm}
                  className="gilt-btn rounded-lg px-3 py-1.5 text-xs flex items-center gap-1.5"
                >
                  <Check size={13} /> Keep it
                </button>
                <button
                  onClick={handleDiscard}
                  disabled={discarding}
                  className="rounded-lg px-3 py-1.5 text-xs text-slate-400 hover:text-slate-200 border border-white/8 flex items-center gap-1.5 disabled:opacity-60"
                >
                  <X size={13} /> {discarding ? 'Removing…' : 'Discard'}
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {!draft && !error && (
        <div className="flex flex-wrap gap-1.5 mt-3">
          {EXAMPLES.map((example) => (
            <button
              key={example}
              onClick={() => {
                setText(example);
                inputRef.current?.focus();
              }}
              className="text-[11px] text-slate-500 hover:text-slate-300 border border-white/8 rounded-full px-2.5 py-1 transition-colors"
            >
              {example}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}