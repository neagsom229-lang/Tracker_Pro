import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Sparkles, Check, Landmark, CreditCard, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { useStore } from '../store/useStore';
import { useEscapeKey } from '../hooks/useEscapeKey';
import { redirectToPaymentLink } from '../lib/stripe';
import AbaPaywayFlow from './AbaPaywayFlow';

const PRO_PERKS = [
  'Monthly budgeting goals with overspend alerts',
  'Automatic recurring income & subscriptions',
  'One-click CSV & PDF export',
  'Multi-currency support across 5 currencies',
];

export default function UpgradeModal() {
  const isOpen = useStore((s) => s.isUpgradeModalOpen);
  const reason = useStore((s) => s.upgradeReason);
  const closeUpgradeModal = useStore((s) => s.closeUpgradeModal);

  const [loading, setLoading] = useState(false);
  // 'choose' | 'aba'
  const [step, setStep] = useState('choose');

  useEscapeKey(isOpen, () => {
    if (step === 'aba') setStep('choose');
    else closeUpgradeModal();
  });

  const handleClose = () => {
    closeUpgradeModal();
    setTimeout(() => setStep('choose'), 300);
  };

  const handleStripeUpgrade = async () => {
    setLoading(true);
    try {
      await redirectToPaymentLink();
      // Navigator leaves the page on success; nothing after this runs.
    } catch (err) {
      toast.error(err.message);
      setLoading(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
          onClick={handleClose}
        >
          <motion.div
            initial={{ opacity: 0, y: 16, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.97 }}
            transition={{ type: 'spring', stiffness: 300, damping: 28 }}
            onClick={(e) => e.stopPropagation()}
            className="relative w-full max-w-sm rounded-3xl p-[1px] bg-gilt-gradient shadow-gilt"
          >
            <div className="glass-strong rounded-3xl p-7 max-h-[85vh] overflow-y-auto">
              <button
                onClick={handleClose}
                className="absolute top-5 right-5 text-slate-500 hover:text-slate-200 z-10"
                aria-label="Close"
              >
                <X size={18} />
              </button>

              {step === 'choose' && (
                <>
                  <div className="w-11 h-11 rounded-2xl bg-gilt-gradient flex items-center justify-center mb-5">
                    <Sparkles size={20} className="text-obsidian-950" />
                  </div>

                  <h3 className="text-xl font-semibold text-slate-50 mb-1">
                    Unlock Obsidian Pro
                  </h3>
                  <p className="text-sm text-slate-400 mb-5">
                    {reason
                      ? `${reason.charAt(0).toUpperCase()}${reason.slice(1)} is a Pro feature.`
                      : 'This feature is part of Pro.'}{' '}
                    Upgrade to take full control of your finances.
                  </p>

                  <ul className="flex flex-col gap-2.5 mb-6">
                    {PRO_PERKS.map((perk) => (
                      <li key={perk} className="flex items-start gap-2.5 text-sm text-slate-300">
                        <Check size={16} className="text-gilt-gold shrink-0 mt-0.5" />
                        {perk}
                      </li>
                    ))}
                  </ul>

                  {/* --- Option 1: Stripe (cards, international) --- */}
                  <button
                    onClick={handleStripeUpgrade}
                    disabled={loading}
                    className="gilt-btn w-full rounded-xl py-2.5 text-sm mb-2 disabled:opacity-70 flex items-center justify-center gap-2"
                  >
                    {loading ? (
                      <>
                        <Loader2 size={14} className="animate-spin" /> Redirecting to Stripe…
                      </>
                    ) : (
                      <>
                        <CreditCard size={14} /> Pay with Card — $4.99/mo
                      </>
                    )}
                  </button>

                  {/* --- Option 2: ABA KHQR (Cambodia) --- */}
                  <button
                    onClick={() => setStep('aba')}
                    className="w-full rounded-xl py-2.5 text-sm mb-3 border border-white/10 text-slate-200 hover:text-white hover:border-white/25 flex items-center justify-center gap-2 transition"
                  >
                    <Landmark size={14} /> Pay with ABA KHQR — $4.99/mo
                  </button>

                  <p className="text-[11px] text-slate-500 text-center mb-3">
                    Cards work globally. ABA KHQR works with any Cambodian banking app.
                  </p>

                  <button
                    onClick={handleClose}
                    className="w-full rounded-xl py-2.5 text-sm text-slate-400 hover:text-slate-200"
                  >
                    Maybe later
                  </button>
                </>
              )}

              {step === 'aba' && (
                <AbaPaywayFlow
                  plan="monthly"
                  onBack={() => setStep('choose')}
                  onSuccess={handleClose}
                />
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}