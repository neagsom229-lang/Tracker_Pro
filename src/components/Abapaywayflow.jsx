import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft, CheckCircle2, Smartphone, AlertCircle,
  Copy, Check, RefreshCw, Clock,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { supabase } from '../lib/supabaseClient';
import AbaQrImage from './AbaQrImage';

const PLAN_PRICES = { monthly: 4.99, yearly: 49.99 };
const EXPIRY_SECONDS = 180; // 3 minutes

const ABA_KHQR_PAYLOAD =
  '00020101021129450016abaakhppxxx@abaa01090175306910208ABA Bank40600006abaP2P01125BFE57575374020901753069103090175306900404Dual5204000053031165802KH5915SAMNANG CHHEANG6010Phnom Penh630437F4';

function formatTime(secs) {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export default function AbaPaywayFlow({ plan = 'monthly', onBack, onSuccess }) {
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [reference, setReference] = useState('');
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  // Countdown state — resets when the user clicks "Refresh QR"
  const [secondsLeft, setSecondsLeft] = useState(EXPIRY_SECONDS);
  const [expired, setExpired] = useState(false);
  const tickRef = useRef(null);

  const amount = PLAN_PRICES[plan] ?? 4.99;

  const startCountdown = useCallback(() => {
    clearInterval(tickRef.current);
    setSecondsLeft(EXPIRY_SECONDS);
    setExpired(false);
    tickRef.current = setInterval(() => {
      setSecondsLeft((s) => {
        if (s <= 1) {
          clearInterval(tickRef.current);
          setExpired(true);
          return 0;
        }
        return s - 1;
      });
    }, 1000);
  }, []);

  // Kick off the timer on mount, clear on unmount
  useEffect(() => {
    startCountdown();
    return () => clearInterval(tickRef.current);
  }, [startCountdown]);

  const handleRefreshQr = () => {
    // Note: this only resets the timer. The static KHQR payload is
    // immutable — it doesn't actually change. Once you have a real
    // ABA merchant account, this button will call the API again to
    // fetch a fresh dynamic QR.
    toast.success('QR refreshed.');
    startCountdown();
  };

  const handleCopy = async (value) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable */
    }
  };

  const handleSubmit = async () => {
    setError('');
    const ref = reference.trim();
    if (ref.length < 4) {
      setError('Enter at least the last 4 digits of your ABA reference number.');
      return;
    }
    if (expired) {
      setError('This QR has expired. Please refresh it and pay again.');
      return;
    }

    setSubmitting(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Your session expired — please sign in again.');

      const { error: insertError } = await supabase
        .from('manual_payments')
        .insert({
          user_id: session.user.id,
          plan,
          amount_usd: amount,
          reference: ref,
          status: 'pending',
        });

      if (insertError) throw new Error(insertError.message);

      setSubmitted(true);
      toast.success("Payment claim recorded — we'll confirm shortly.");
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  // ---------- Success screen ----------
  if (submitted) {
    return (
      <div className="flex flex-col items-center gap-4 py-4 text-center">
        <CheckCircle2 size={48} className="text-income" />
        <h3 className="text-lg font-semibold text-slate-50">Payment claim received</h3>
        <p className="text-sm text-slate-400 max-w-[280px]">
          We'll verify your transfer and unlock Pro within a few hours.
          You'll see a notification the moment it's confirmed.
        </p>
        <button onClick={onSuccess} className="gilt-btn rounded-xl px-5 py-2.5 text-sm mt-2">
          Got it
        </button>
      </div>
    );
  }

  // ---------- QR screen ----------
  return (
    <div className="flex flex-col items-center gap-4">
      <button
        onClick={onBack}
        className="self-start text-xs text-slate-400 hover:text-slate-200 flex items-center gap-1"
      >
        <ArrowLeft size={14} /> Back
      </button>

      <h3 className="text-lg font-semibold text-slate-50">Pay with ABA KHQR</h3>
      <p className="text-xs text-slate-400 text-center max-w-[280px] -mt-1">
        Scan this QR with <span className="text-gilt-gold font-medium">ABA Mobile</span> (or any
        Cambodian banking app). Pay exactly{' '}
        <span className="text-slate-200 font-medium">${amount.toFixed(2)} USD</span>.
      </p>

      {/* QR panel — swaps between live QR and expired state */}
      <div className="relative mt-1">
        <AnimatePresence mode="wait">
          {!expired ? (
            <motion.div
              key="qr-live"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="flex flex-col items-center gap-2"
            >
              <AbaQrImage value={ABA_KHQR_PAYLOAD} size={224} />

              {/* Live countdown pill */}
              <div
                className={`flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full border ${
                  secondsLeft <= 30
                    ? 'text-expense border-expense/40 bg-expense/10'
                    : 'text-slate-400 border-white/10 bg-white/5'
                }`}
              >
                <Clock size={12} />
                Expires in {formatTime(secondsLeft)}
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="qr-expired"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              className="flex flex-col items-center gap-3 py-2"
            >
              {/* Faded QR in the background */}
              <div className="relative">
                <div className="opacity-20 pointer-events-none">
                  <AbaQrImage value={ABA_KHQR_PAYLOAD} size={224} />
                </div>
                <div className="absolute inset-0 flex flex-col items-center justify-center rounded-2xl bg-obsidian-950/70 backdrop-blur-[2px]">
                  <AlertCircle size={28} className="text-expense mb-2" />
                  <p className="text-sm font-semibold text-slate-100">QR expired</p>
                  <p className="text-[11px] text-slate-400 mt-0.5">Generate a new one to continue</p>
                </div>
              </div>

              <button
                onClick={handleRefreshQr}
                className="gilt-btn rounded-xl px-4 py-2 text-xs flex items-center gap-2 mt-1"
              >
                <RefreshCw size={13} /> Refresh QR
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Account details */}
      <div className="w-full max-w-[280px] flex flex-col gap-2 mt-1">
        <div className="flex items-center justify-between text-xs text-slate-300 bg-white/5 border border-white/8 rounded-lg px-3 py-2">
          <span className="text-slate-500">USD account</span>
          <span className="font-medium">017 530 690</span>
          <button
            onClick={() => handleCopy('017530690')}
            className="text-slate-400 hover:text-slate-100"
            aria-label="Copy USD account number"
          >
            {copied ? <Check size={13} /> : <Copy size={13} />}
          </button>
        </div>
        <div className="flex items-center justify-between text-xs text-slate-300 bg-white/5 border border-white/8 rounded-lg px-3 py-2">
          <span className="text-slate-500">Name</span>
          <span className="font-medium">SAMNANG CHHEANG</span>
        </div>
      </div>

      <a
        href="abamobilebank://ababank.com"
        className="text-xs text-slate-400 hover:text-slate-200 underline underline-offset-2 flex items-center gap-1.5"
      >
        <Smartphone size={12} /> Open ABA Mobile
      </a>

      {/* Confirmation form — disabled while expired */}
      <div className="w-full max-w-[280px] mt-3 border-t border-white/8 pt-4">
        <label htmlFor="aba-ref" className="text-xs text-slate-400 block mb-1.5">
          After paying, paste your ABA reference number here:
        </label>
        <input
          id="aba-ref"
          value={reference}
          onChange={(e) => {
            setReference(e.target.value);
            if (error) setError('');
          }}
          placeholder="e.g. 1234567890"
          className="w-full bg-obsidian-800/60 border border-white/10 rounded-lg px-3 py-2 text-sm text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-gilt-gold/60 disabled:opacity-50"
          disabled={submitting || expired}
        />

        {error && (
          <p className="text-xs text-expense mt-2 flex items-center gap-1.5">
            <AlertCircle size={12} /> {error}
          </p>
        )}

        <button
          onClick={handleSubmit}
          disabled={submitting || expired || reference.trim().length < 4}
          className="gilt-btn w-full rounded-xl py-2.5 text-sm mt-3 disabled:opacity-50"
        >
          {submitting ? 'Recording…' : expired ? 'QR expired — refresh to continue' : "I've paid — submit for verification"}
        </button>

        <p className="text-[10px] text-slate-500 text-center mt-2">
          Pro unlocks within a few hours of confirmation.
        </p>
      </div>
    </div>
  );
}