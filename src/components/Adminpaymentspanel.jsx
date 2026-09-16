import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Check, X, ExternalLink, ShieldCheck } from 'lucide-react';
import toast from 'react-hot-toast';
import { getSubmittedPayments, getPaymentProofUrl, reviewManualPayment } from '../lib/manualPayment';

export default function AdminPaymentsPanel() {
  const [payments, setPayments] = useState(null); // null = loading
  const [actingOn, setActingOn] = useState(null); // payment id currently being approved/rejected

  const load = () => {
    getSubmittedPayments()
      .then(setPayments)
      .catch((err) => toast.error(err.message));
  };

  useEffect(load, []);

  const handleReview = async (paymentId, decision) => {
    setActingOn(paymentId);
    try {
      await reviewManualPayment(paymentId, decision);
      toast.success(decision === 'approve' ? 'Approved — Pro granted.' : 'Rejected.');
      setPayments((prev) => prev.filter((p) => p.id !== paymentId));
    } catch (err) {
      toast.error(err.message);
    } finally {
      setActingOn(null);
    }
  };

  const openProof = async (path) => {
    try {
      const url = await getPaymentProofUrl(path);
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (err) {
      toast.error(err.message);
    }
  };

  if (payments === null) return <p className="text-sm text-slate-500">Loading…</p>;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2 text-slate-400 text-sm">
        <ShieldCheck size={15} /> Admin — payments awaiting review
      </div>

      {payments.length === 0 && (
        <div className="glass rounded-2xl p-8 text-center text-sm text-slate-500">Nothing waiting on you — all caught up.</div>
      )}

      {payments.map((p) => (
        <motion.div key={p.id} layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="glass rounded-2xl p-5 shadow-glass">
          <div className="flex items-start justify-between mb-3">
            <div>
              <p className="text-slate-200 font-medium">{p.payerLabel}</p>
              <p className="text-xs text-slate-500">Submitted {new Date(p.submittedAt).toLocaleString()}</p>
            </div>
            <p className="text-lg font-semibold text-slate-100">${p.amount}</p>
          </div>

          <div className="text-sm text-slate-400 mb-4 space-y-1">
            <p>
              <span className="text-slate-500">Reference: </span>
              {p.claimedTransactionRef || <span className="italic">none provided</span>}
            </p>
            {p.screenshotPath && (
              <button onClick={() => openProof(p.screenshotPath)} className="flex items-center gap-1 text-gilt-gold hover:underline">
                View screenshot <ExternalLink size={12} />
              </button>
            )}
          </div>

          <p className="text-xs text-slate-500 mb-3">
            Check your ABA app for this amount and reference before approving — approving grants Pro immediately.
          </p>

          <div className="flex gap-2">
            <button
              onClick={() => handleReview(p.id, 'approve')}
              disabled={actingOn === p.id}
              className="flex-1 gilt-btn rounded-lg py-2 text-sm flex items-center justify-center gap-1.5 disabled:opacity-60"
            >
              <Check size={14} /> Approve
            </button>
            <button
              onClick={() => handleReview(p.id, 'reject')}
              disabled={actingOn === p.id}
              className="flex-1 rounded-lg py-2 text-sm border border-white/10 text-slate-300 hover:border-expense hover:text-expense flex items-center justify-center gap-1.5 disabled:opacity-60"
            >
              <X size={14} /> Reject
            </button>
          </div>
        </motion.div>
      ))}
    </div>
  );
}