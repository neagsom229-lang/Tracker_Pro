import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Sparkles, Check, Landmark } from 'lucide-react';
import toast from 'react-hot-toast';
import { useStore } from '../store/useStore';
import { useEscapeKey } from '../hooks/useEscapeKey';
import { redirectToPaymentLink } from '../lib/stripe';
import AbaPaywayFlow from './Abapaywayflow';

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
  // 'choose' | 'stripe-redirecting' | 'aba' | 'aba-submitted'
  const [step, setStep] = useState('choose');

  useEscapeKey(isOpen, closeUpgradeModal);

  // Reset back to the first screen every time the modal is freshly opened,
  // so closing mid-flow and reopening later doesn't strand the user on
  // whatever step they left off on.
  const handleClose = () => {
    closeUpgradeModal();
    setTimeout(() => setStep('choose'), 300); // after the close animation finishes
  };

  // Sends the browser to the Stripe Payment Link (with our user's id
  // attached as client_reference_id) — there is no local "upgradeToPro()"
  // call anymore. Pro status only ever flips true once Stripe confirms
  // payment and calls our webhook (see supabase/functions/stripe-webhook),
  // which the useProStatus() hook then picks up automatically via
  // Realtime. We never trust the client alone to grant itself a paid feature.
  const handleStripeUpgrade = async () => {
    setLoading(true);
    try {
      await redirectToPaymentLink();
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
                className="absolute top-5 right-5 text-slate-500 hover:text-slate-200"
                aria-label="Close"
              >
                <X size={18} />
              </button>

              {step === 'choose' && (
                <>
                  <div className="w-11 h-11 rounded-2xl bg-gilt-gradient flex items-center justify-center mb-5">
                    <Sparkles size={20} className="text-obsidian-950" />
                  </div>

                  <h3 className="text-xl font-semibold text-slate-50 mb-1">Unlock Obsidian Pro</h3>
                  <p className="text-sm text-slate-400 mb-5">
                    {reason ? `${reason.charAt(0).toUpperCase()}${reason.slice(1)} is a Pro feature.` : 'This feature is part of Pro.'}{' '}
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

                  <button
                    onClick={handleStripeUpgrade}
                    disabled={loading}
                    className="gilt-btn w-full rounded-xl py-2.5 text-sm mb-2 disabled:opacity-70"
                  >
                    {loading ? 'Redirecting to Stripe…' : 'Upgrade to Pro — $4.99/mo'}
                  </button>

                  <button
                    onClick={() => setStep('aba')}
                    className="w-full rounded-xl py-2.5 text-sm mb-2 border border-white/10 text-slate-300 hover:text-slate-100 hover:border-white/20 flex items-center justify-center gap-2"
                  >
                    <Landmark size={14} /> Pay with ABA PayWay / Bakong
                  </button>

                  <button onClick={handleClose} className="w-full rounded-xl py-2.5 text-sm text-slate-400 hover:text-slate-200">
                    Maybe later
                  </button>
                </>
              )}

              {step === 'aba' && <AbaPaywayFlow onBack={() => setStep('choose')} onSubmitted={() => setStep('aba-submitted')} />}

              {step === 'aba-submitted' && (
                <div className="text-center py-4">
                  <div className="w-11 h-11 rounded-2xl bg-gilt-gradient flex items-center justify-center mb-5 mx-auto">
                    <Check size={20} className="text-obsidian-950" />
                  </div>
                  <h3 className="text-lg font-semibold text-slate-50 mb-2">Thanks — we've got it</h3>
                  <p className="text-sm text-slate-400 mb-6">
                    We'll verify your payment and unlock Pro, usually within 24 hours. You'll get a notification the moment it's confirmed.
                  </p>
                  <button onClick={handleClose} className="gilt-btn w-full rounded-xl py-2.5 text-sm">
                    Got it
                  </button>
                </div>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}