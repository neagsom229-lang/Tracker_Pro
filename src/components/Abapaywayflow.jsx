import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { Loader2, ArrowLeft, Upload } from 'lucide-react';
import toast from 'react-hot-toast';
import { createManualPayment, submitPaymentProof } from '../lib/manualPayment';

export default function AbaPaywayFlow({ onBack, onSubmitted }) {
  const [payment, setPayment] = useState(null); // { paymentId, amount }
  const [qrImage, setQrImage] = useState(null); // data URL
  const [loading, setLoading] = useState(true);
  const [transactionRef, setTransactionRef] = useState('');
  const [screenshotFile, setScreenshotFile] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    createManualPayment()
      .then(async (result) => {
        if (cancelled) return;
        // `result.qr` is the raw KHQR payload string (EMVCo TLV text) —
        // this renders it as an actual scannable QR image client-side.
        // The QR content itself was generated server-side, from your
        // own Bakong account alias, with the price fixed by the server —
        // nothing about the amount is client-controlled.
        const dataUrl = await QRCode.toDataURL(result.qr, { width: 260, margin: 1 });
        if (cancelled) return;
        setQrImage(dataUrl);
        setPayment({ paymentId: result.paymentId, amount: result.amount });
      })
      .catch((err) => !cancelled && toast.error(err.message))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!transactionRef.trim() && !screenshotFile) {
      return toast.error('Add your transaction reference or a screenshot so we can verify it.');
    }
    setSubmitting(true);
    try {
      await submitPaymentProof(payment.paymentId, { transactionRef: transactionRef.trim(), screenshotFile });
      onSubmitted();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div>
      <button onClick={onBack} className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-300 mb-4">
        <ArrowLeft size={12} /> Back
      </button>

      <h3 className="text-lg font-semibold text-slate-50 mb-1">Pay with ABA PayWay / Bakong</h3>
      <p className="text-sm text-slate-400 mb-4">
        Scan with ABA Mobile or any Cambodian banking app. Payments are confirmed manually, usually within 24 hours.
      </p>

      {loading && (
        <div className="h-64 flex items-center justify-center">
          <Loader2 size={22} className="animate-spin text-slate-500" />
        </div>
      )}

      {!loading && qrImage && (
        <>
          <div className="bg-white rounded-2xl p-3 flex items-center justify-center mb-3">
            <img src={qrImage} alt="Bakong KHQR payment code" width={220} height={220} />
          </div>
          <p className="text-center text-sm text-slate-300 mb-5">
            Amount: <span className="font-semibold text-slate-100">${payment.amount}</span>
          </p>

          <form onSubmit={handleSubmit} className="flex flex-col gap-3">
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Transaction ID / reference (from your ABA app)</label>
              <input
                value={transactionRef}
                onChange={(e) => setTransactionRef(e.target.value)}
                placeholder="e.g. 250916-0001234567"
                className="w-full bg-obsidian-800/60 border border-white/8 rounded-lg px-3 py-2.5 text-sm text-slate-200 placeholder:text-slate-500 focus:outline-none"
              />
            </div>

            <label className="flex items-center gap-2 text-xs text-slate-400 border border-dashed border-white/12 rounded-lg px-3 py-2.5 cursor-pointer hover:border-white/25">
              <Upload size={14} />
              {screenshotFile ? screenshotFile.name : 'Attach a screenshot (optional but helps us verify faster)'}
              <input type="file" accept="image/*" className="hidden" onChange={(e) => setScreenshotFile(e.target.files?.[0] || null)} />
            </label>

            <button type="submit" disabled={submitting} className="gilt-btn rounded-xl py-2.5 text-sm mt-1 disabled:opacity-70">
              {submitting ? 'Submitting…' : "I've Paid"}
            </button>
          </form>
        </>
      )}
    </div>
  );
}