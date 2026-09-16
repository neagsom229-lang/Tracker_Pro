import { useState } from 'react';
import {
  CreditCard,
  Sparkles,
  ExternalLink,
  RefreshCw,
  Landmark,
  Clock,
  CheckCircle2,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { useStore } from '../store/useStore';
import { useProStatus } from '../hooks/useProStatus';
import { redirectToCustomerPortal } from '../lib/stripe';
import { formatDate } from '../utils/format';

const STATUS_LABEL = {
  active: 'Active',
  trialing: 'Trial',
  past_due: 'Past due — update your card',
  canceled: 'Canceled',
  incomplete: 'Incomplete',
  incomplete_expired: 'Expired',
  unpaid: 'Unpaid',
};

export default function BillingPanel() {
  const {
    isPro,
    subscription,
    isPendingReview,
    pendingPayment,
    loading,
    refresh,
  } = useProStatus();
  const openUpgradeModal = useStore((s) => s.openUpgradeModal);
  const [actionLoading, setActionLoading] = useState(false);

  const provider = subscription?.payment_provider || 'stripe'; // 'stripe' | 'aba' | 'aba_manual'

  const handleManage = async () => {
    // ABA subscriptions can't use the Stripe customer portal; they need
    // to be managed manually until we build an ABA cancel endpoint.
    if (provider === 'aba' || provider === 'aba_manual') {
      toast.success(
        "You're on an ABA PayWay subscription. Contact support to cancel or change your plan."
      );
      return;
    }
    setActionLoading(true);
    try {
      await redirectToCustomerPortal();
    } catch (err) {
      toast.error(err.message);
      setActionLoading(false);
    }
  };

  const handleRefresh = async () => {
    try {
      await refresh();
    } catch (err) {
      toast.error('Could not refresh status. Try again in a moment.');
    }
  };

  return (
    <div className="glass rounded-2xl p-6 shadow-glass max-w-lg">
      {/* ---------- Header ---------- */}
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2">
          <CreditCard size={18} className="text-gilt-gold" />
          <h3 className="text-slate-100 font-medium">Billing</h3>
        </div>
        <button
          onClick={handleRefresh}
          className="text-slate-500 hover:text-slate-200 p-1"
          aria-label="Refresh subscription status"
          title="Refresh status"
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* ---------- State 1: Pro (active subscription) ---------- */}
      {isPro && (
        <>
          <p className="text-sm text-slate-400 mb-1">
            You're on the <span className="gilt-text font-semibold">Pro plan</span>
            {subscription?.plan_name ? ` (${subscription.plan_name})` : ''}.
          </p>
          <p className="text-xs text-slate-500 mb-1">
            Status: {STATUS_LABEL[subscription?.status] || subscription?.status}
          </p>
          <p className="text-xs text-slate-500 mb-5 flex items-center gap-1.5">
            {provider === 'aba' || provider === 'aba_manual' ? (
              <>
                <Landmark size={12} /> Paid via ABA KHQR
              </>
            ) : (
              <>
                <CreditCard size={12} /> Paid via Card (Stripe)
              </>
            )}
          </p>

          <button
            onClick={handleManage}
            disabled={actionLoading}
            className="rounded-xl px-4 py-2.5 text-sm flex items-center gap-2 border border-white/10 text-slate-200 hover:bg-white/5 disabled:opacity-70"
          >
            {actionLoading
              ? 'Opening portal…'
              : provider === 'aba' || provider === 'aba_manual'
              ? 'Contact support to cancel'
              : 'Manage subscription & invoices'}
            {provider !== 'aba' && provider !== 'aba_manual' && <ExternalLink size={14} />}
          </button>
        </>
      )}

      {/* ---------- State 2: Payment submitted, awaiting review ---------- */}
      {!isPro && isPendingReview && (
        <>
          <div className="flex items-center gap-2 mb-3">
            <span className="w-2 h-2 rounded-full bg-gilt-gold animate-pulse" />
            <p className="text-sm font-medium text-slate-100">
              Payment submitted — under review
            </p>
          </div>

          <div className="bg-white/5 border border-white/8 rounded-xl p-4 mb-4">
            <div className="flex items-start gap-3">
              <Clock size={18} className="text-gilt-gold shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="text-xs text-slate-400 mb-2">
                  We received your ABA payment claim. Verification usually takes a few hours.
                </p>
                <div className="flex flex-col gap-1.5 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500">Reference</span>
                    <span className="text-slate-200 font-mono truncate max-w-[140px]">
                      {pendingPayment?.reference || '—'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500">Amount</span>
                    <span className="text-slate-200 font-medium">
                      ${Number(pendingPayment?.amount_usd || 0).toFixed(2)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500">Submitted</span>
                    <span className="text-slate-300">
                      {pendingPayment?.created_at ? formatDate(pendingPayment.created_at) : '—'}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <p className="text-xs text-slate-500 mb-4 flex items-start gap-1.5">
            <CheckCircle2 size={13} className="text-income shrink-0 mt-0.5" />
            <span>
              You'll see a notification and this panel will update automatically the moment
              Pro is unlocked. No need to refresh.
            </span>
          </p>

          <button
            onClick={handleRefresh}
            disabled={loading}
            className="text-xs text-slate-400 hover:text-slate-200 underline underline-offset-2 disabled:opacity-50"
          >
            {loading ? 'Checking…' : 'Check status now'}
          </button>
        </>
      )}

      {/* ---------- State 3: Free (no subscription, no pending payment) ---------- */}
      {!isPro && !isPendingReview && (
        <>
          <p className="text-sm text-slate-400 mb-1">
            You're on the Free plan
            {subscription?.status === 'past_due' && (
              <span className="text-expense"> — your last payment failed.</span>
            )}
            {subscription?.status === 'canceled' && (
              <span> — your subscription was canceled.</span>
            )}
            .
          </p>
          <p className="text-sm text-slate-500 mb-5">
            Upgrade to unlock budgets, recurring transactions, exports, and more.
          </p>

          <button
            onClick={() => openUpgradeModal('')}
            className="gilt-btn rounded-xl px-4 py-2.5 text-sm flex items-center gap-2"
          >
            <Sparkles size={15} /> Upgrade to Pro — $4.99/mo
          </button>

          <p className="text-[11px] text-slate-500 mt-3">
            Pay with card (Stripe) or ABA KHQR — your choice at checkout.
          </p>
        </>
      )}
    </div>
  );
}