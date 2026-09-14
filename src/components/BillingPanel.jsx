import { useState } from 'react';
import { CreditCard, Sparkles, ExternalLink, RefreshCw } from 'lucide-react';
import toast from 'react-hot-toast';
import { useProStatus } from '../hooks/useProStatus';
import { redirectToPaymentLink, redirectToCustomerPortal } from '../lib/stripe';
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
  const { isPro, subscription, loading, refresh } = useProStatus();
  const [actionLoading, setActionLoading] = useState(false);

  const handleUpgrade = async () => {
    setActionLoading(true);
    try {
      await redirectToPaymentLink(); // navigates away on success
    } catch (err) {
      toast.error(err.message);
      setActionLoading(false);
    }
  };

  const handleManage = async () => {
    setActionLoading(true);
    try {
      await redirectToCustomerPortal(); // navigates away on success
    } catch (err) {
      toast.error(err.message);
      setActionLoading(false);
    }
  };

  return (
    <div className="glass rounded-2xl p-6 shadow-glass max-w-lg">
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2">
          <CreditCard size={18} className="text-gilt-gold" />
          <h3 className="text-slate-100 font-medium">Billing</h3>
        </div>
        <button
          onClick={refresh}
          className="text-slate-500 hover:text-slate-200 p-1"
          aria-label="Refresh subscription status"
          title="Refresh status"
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {isPro ? (
        <>
          <p className="text-sm text-slate-400 mb-1">
            You're on the <span className="gilt-text font-semibold">Pro plan</span>
            {subscription?.plan_name ? ` (${subscription.plan_name})` : ''}.
          </p>
          <p className="text-xs text-slate-500 mb-1">
            Status: {STATUS_LABEL[subscription?.status] || subscription?.status}
          </p>
          {subscription?.current_period_end && (
            <p className="text-xs text-slate-500 mb-5">Renews {formatDate(subscription.current_period_end)}</p>
          )}
          {!subscription?.current_period_end && <div className="mb-5" />}
          <button
            onClick={handleManage}
            disabled={actionLoading}
            className="rounded-xl px-4 py-2.5 text-sm flex items-center gap-2 border border-white/10 text-slate-200 hover:bg-white/5 disabled:opacity-70"
          >
            {actionLoading ? 'Opening portal…' : 'Manage subscription & invoices'} <ExternalLink size={14} />
          </button>
        </>
      ) : (
        <>
          <p className="text-sm text-slate-400 mb-1">
            You're on the Free plan
            {subscription?.status === 'past_due' && <span className="text-expense"> — your last payment failed.</span>}
            {subscription?.status === 'canceled' && <span> — your subscription was canceled.</span>}.
          </p>
          <p className="text-sm text-slate-500 mb-5">Upgrade to unlock budgets, recurring transactions, exports, and more.</p>
          <button
            onClick={handleUpgrade}
            disabled={actionLoading}
            className="gilt-btn rounded-xl px-4 py-2.5 text-sm flex items-center gap-2 disabled:opacity-70"
          >
            <Sparkles size={15} /> {actionLoading ? 'Redirecting…' : 'Upgrade to Pro — $4.99/mo'}
          </button>
        </>
      )}
    </div>
  );
}
