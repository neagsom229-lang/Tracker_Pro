import { useState } from 'react';
import { motion } from 'framer-motion';
import { Gem, KeyRound, AlertCircle } from 'lucide-react';
import toast from 'react-hot-toast';
import { supabase } from '../lib/supabaseClient';
import { useStore } from '../store/useStore';
import { translateAuthError } from './AuthScreen';

/**
 * ResetPasswordScreen
 * -------------------
 * The missing half of "Forgot password?". Clicking the emailed link
 * brings the user back to this app with a short-lived RECOVERY session
 * already established (supabase-js parses it out of the URL hash because
 * `detectSessionInUrl: true`). That session is a real session — which is
 * exactly the trap: without a dedicated screen the user is silently
 * dropped onto the dashboard and never gets to set a new password.
 *
 * The store sets `recoveryMode` when it sees `type=recovery` in the URL
 * or a PASSWORD_RECOVERY event, and App renders this instead of the
 * dashboard until the password is actually changed.
 */

const INPUT_CLASS =
  'w-full bg-obsidian-800/60 border border-white/8 rounded-lg px-3 py-2.5 text-sm text-slate-200 placeholder:text-slate-500 ' +
  'focus:outline-none focus:border-gilt-gold/60 focus:ring-2 focus:ring-gilt-gold/25 transition';

export default function ResetPasswordScreen() {
  const exitRecoveryMode = useStore((s) => s.exitRecoveryMode);

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (password.length < 8) {
      setError('Please use at least 8 characters.');
      return;
    }
    if (password !== confirm) {
      setError("Those two passwords don't match.");
      return;
    }

    setLoading(true);
    setError('');

    const { error: updateError } = await supabase.auth.updateUser({ password });
    setLoading(false);

    if (updateError) {
      const msg = (updateError.message || '').toLowerCase();
      // The recovery session expires after an hour, and the link is
      // single-use. Both surface as a missing/invalid session here.
      if (msg.includes('session') || updateError.code === 'session_not_found') {
        setError('This reset link has expired. Please request a new one from the sign-in screen.');
      } else if (msg.includes('same as the old') || updateError.code === 'same_password') {
        setError('That is already your current password — please choose a different one.');
      } else {
        setError(translateAuthError(updateError).text);
      }
      return;
    }

    toast.success('Password updated — you\u2019re signed in.');
    // Clears recoveryMode and kicks off the normal data load, so the
    // user lands on their dashboard already authenticated rather than
    // being bounced back to a login form.
    await exitRecoveryMode();
  };

  const handleCancel = async () => {
    // Sign out so the recovery session can't be left sitting in the tab
    // as a normal login without the password ever having been changed.
    await supabase.auth.signOut();
    await exitRecoveryMode();
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center relative overflow-hidden px-4 py-10">
      <div className="absolute inset-0 -z-10">
        <div className="absolute top-[-10%] left-[10%] w-72 h-72 rounded-full bg-gilt-purple/20 blur-3xl" />
        <div className="absolute bottom-[-10%] right-[10%] w-80 h-80 rounded-full bg-gilt-gold/10 blur-3xl" />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="glass-strong rounded-3xl p-8 w-full max-w-sm shadow-glass"
      >
        <div className="flex items-center gap-2 mb-8">
          <div className="w-9 h-9 rounded-lg bg-gilt-gradient flex items-center justify-center">
            <Gem size={17} className="text-obsidian-950" strokeWidth={2.5} />
          </div>
          <span className="text-lg font-semibold tracking-tight">Obsidian</span>
        </div>

        <div className="w-11 h-11 rounded-2xl bg-gilt-gold/10 flex items-center justify-center mb-5">
          <KeyRound size={19} className="text-gilt-gold" />
        </div>

        <h1 className="text-2xl font-semibold text-slate-50 mb-1">Choose a new password</h1>
        <p className="text-sm text-slate-400 mb-6">You'll be signed in automatically once it's saved.</p>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <label htmlFor="new-password" className="text-xs text-slate-400 mb-1 block">
              New password
            </label>
            <input
              id="new-password"
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
              autoFocus
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className={INPUT_CLASS}
            />
            <p className="text-xs text-slate-500 mt-1">At least 8 characters.</p>
          </div>

          <div>
            <label htmlFor="confirm-password" className="text-xs text-slate-400 mb-1 block">
              Confirm new password
            </label>
            <input
              id="confirm-password"
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder="••••••••"
              className={INPUT_CLASS}
            />
          </div>

          <div aria-live="polite">
            {error && (
              <div className="flex gap-2 text-xs rounded-lg px-3 py-2.5 bg-expense-soft text-expense border border-expense/20">
                <AlertCircle size={14} className="shrink-0 mt-0.5" />
                <p className="leading-relaxed">{error}</p>
              </div>
            )}
          </div>

          <button
            type="submit"
            disabled={loading}
            className="gilt-btn rounded-xl py-2.5 text-sm mt-1 disabled:opacity-70"
          >
            {loading ? 'Saving…' : 'Save new password'}
          </button>
        </form>

        <button
          onClick={handleCancel}
          className="text-xs text-slate-400 hover:text-slate-200 underline underline-offset-2 mt-6 mx-auto block"
        >
          Cancel and sign in instead
        </button>
      </motion.div>
    </div>
  );
}