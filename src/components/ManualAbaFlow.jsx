import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, CheckCircle2, Smartphone, AlertCircle, RefreshCw, Clock } from 'lucide-react';
import toast from 'react-hot-toast';
import AbaQrImage from './AbaQrImage';
import { createManualPayment, submitPaymentProof } from '../lib/manualPayment';

const EXPIRY_SECONDS = 180;

function formatTime(secs) {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export default function ManualAbaFlow({ onBack, onSuccess }) {
  const [loading, setLoading] = useState(true);
  const [paymentId, setPaymentId] = useState(null);
  const [qr, setQr] = useState('');
  const [amount, setAmount] = useState(4.99);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [reference, setReference] = useState('');
  const [error, setError] = useState('');
  const [secondsLeft, setSecondsLeft] = useState(EXPIRY_SECONDS);
  const [expired, setExpired] = useState(false);
  const tickRef = useRef(null);

  const startTimer = useCallback(() => {
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

  const loadPayment = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await createManualPayment();
      setPaymentId(data.paymentId);
      setQr(data.qr);
      setAmount(Number(data.amount ?? 4.99));
      startTimer();
    } catch (err) {
      setError(err.message || 'Could not start the payment — try again.');
    } finally {
      setLoading(false);
    }
  }, [startTimer]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await createManualPayment();
        if (cancelled) return;
        setPaymentId(data.paymentId);
        setQr(data.qr);
        setAmount(Number(data.amount ?? 4.99));
        startTimer();
      } catch (err) {
        if (!cancelled) setError(err.message || 'Could not start the payment — try again.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; clearInterval(tickRef.current); };
  }, [startTimer]);

  const handleRefreshQr = async () => {
    await loadPayment();
    toast.success('QR refreshed.');
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
    if (!paymentId) {
      setError('Payment not ready yet — please refresh.');
      return;
    }

    setSubmitting(true);
    try {
      await submitPaymentProof(paymentId, { transactionRef: ref, screenshotFile: null });
      setSubmitted(true);
      toast.success("Payment claim recorded — we'll confirm shortly.");
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <div className="flex flex-col items-center gap-4 py-4 text-center">
        <CheckCircle2 size={48} className="text-income" />
        <h3 className="text-lg font-semibold text-slate-50">Payment claim received</h3>
        <p className="text-sm text-slate-400 max-w-[280px]">
          We&apos;ll verify your transfer and unlock Pro within a few hours. You&apos;ll see a notification the moment it&apos;s confirmed.
        </p>
        <button onClick={onSuccess} className="gilt-btn rounded-xl px-5 py-2.5 text-sm mt-2">Got it</button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-4">
      <button onClick={onBack} className="self-start text-xs text-slate-400 hover:text-slate-200 flex items-center gap-1">
        <ArrowLeft size={14} /> Back
      </button>

      <h3 className="text-lg font-semibold text-slate-50">Pay with ABA KHQR</h3>
      <p className="text-xs text-slate-400 text-center max-w-[280px] -mt-1">
        Scan this QR with <span className="text-gilt-gold font-medium">ABA Mobile</span> (or any Cambodian banking app). Pay exactly{' '}
        <span className="text-slate-200 font-medium">${Number(amount).toFixed(2)} USD</span>.
      </p>

      <div className="relative mt-1">
        <AnimatePresence mode="wait">
          {!expired ? (
            <motion.div key="qr-live" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="flex flex-col items-center gap-2">
              {loading ? (
                <div className="w-[224px] h-[224px] rounded-2xl bg-white/5 animate-pulse" />
              ) : qr ? (
                <AbaQrImage value={qr} size={224} />
              ) : (
                <div className="w-[224px] h-[224px] rounded-2xl bg-white/5 flex flex-col items-center justify-center gap-3 text-xs text-slate-500 px-4 text-center">
                  <span>{error || 'QR unavailable'}</span>
                  <button onClick={handleRefreshQr} className="gilt-btn rounded-lg px-3 py-1.5 text-xs flex items-center gap-1.5"><RefreshCw size={12} /> Try again</button>
                </div>
              )}
              <div className={`flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full border ${secondsLeft <= 30 ? 'text-expense border-expense/40 bg-expense/10' : 'text-slate-400 border-white/10 bg-white/5'}`}>
                <Clock size={12} /> Expires in {formatTime(secondsLeft)}
              </div>
            </motion.div>
          ) : (
            <motion.div key="qr-expired" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} className="flex flex-col items-center gap-3 py-2">
              <div className="relative">
                <div className="opacity-20 pointer-events-none">{qr ? <AbaQrImage value={qr} size={224} /> : <div className="w-[224px] h-[224px] rounded-2xl bg-white/5" />}</div>
                <div className="absolute inset-0 flex flex-col items-center justify-center rounded-2xl bg-obsidian-950/70 backdrop-blur-[2px]">
                  <AlertCircle size={28} className="text-expense mb-2" />
                  <p className="text-sm font-semibold text-slate-100">QR expired</p>
                  <p className="text-[11px] text-slate-400 mt-0.5">Generate a new one to continue</p>
                </div>
              </div>
              <button onClick={handleRefreshQr} className="gilt-btn rounded-xl px-4 py-2 text-xs flex items-center gap-2 mt-1">
                <RefreshCw size={13} /> Refresh QR
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <a href="abamobilebank://ababank.com" className="text-xs text-slate-400 hover:text-slate-200 underline underline-offset-2 flex items-center gap-1.5">
        <Smartphone size={12} /> Open ABA Mobile
      </a>

      <div className="w-full max-w-[280px] mt-3 border-t border-white/8 pt-4">
        <label htmlFor="aba-ref" className="text-xs text-slate-400 block mb-1.5">After paying, paste your ABA reference number here:</label>
        <input
          id="aba-ref"
          value={reference}
          onChange={(e) => { setReference(e.target.value); if (error) setError(''); }}
          placeholder="e.g. 1234567890"
          className="w-full bg-card border border-white/10 rounded-lg px-3 py-2 text-sm text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-gilt-gold/60 disabled:opacity-50"
          disabled={submitting || expired || loading}
        />

        {error && <p className="text-xs text-expense mt-2 flex items-center gap-1.5"><AlertCircle size={12} /> {error}</p>}

        <button
          onClick={handleSubmit}
          disabled={submitting || expired || loading || reference.trim().length < 4 || !paymentId}
          className="gilt-btn w-full rounded-xl py-2.5 text-sm mt-3 disabled:opacity-50"
        >
          {submitting ? 'Recording…' : expired ? 'QR expired — refresh to continue' : "I've paid — submit for verification"}
        </button>

        <p className="text-[10px] text-slate-500 text-center mt-2">Pro unlocks within a few hours of confirmation.</p>
      </div>
    </div>
  );
}
