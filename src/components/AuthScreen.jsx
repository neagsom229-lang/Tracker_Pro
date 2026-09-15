import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Gem, ArrowRight, MailCheck, AlertCircle, ArrowLeft } from 'lucide-react';
import toast from 'react-hot-toast';
import { supabase } from '../lib/supabaseClient';

// Simple inline Google "G" mark so we don't pull in a whole icon pack
// just for one brand logo.
function GoogleMark() {
  return (
    <svg width="16" height="16" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3c-1.6 4.6-6 8-11.3 8-6.6 0-12-5.4-12-12s5.4-12 12-12c3 0 5.8 1.1 7.9 3l5.7-5.7C34.6 6.1 29.6 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.7-.4-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.6 15.9 18.9 13 24 13c3 0 5.8 1.1 7.9 3l5.7-5.7C34.6 6.1 29.6 4 24 4 16.3 4 9.6 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.5 0 10.4-1.9 14.3-5.1l-6.6-5.4C29.6 35.4 26.9 36.3 24 36.3c-5.3 0-9.7-3.4-11.3-8.1l-6.6 5.1C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.3-2.2 4.2-4 5.6l6.6 5.4C41.9 35.9 44 30.4 44 24c0-1.3-.1-2.7-.4-3.5z" />
    </svg>
  );
}

/**
 * translateAuthError()
 * --------------------
 * Supabase returns machine-shaped errors ("Invalid login credentials",
 * "Email not confirmed", "AuthApiError: over_email_send_rate_limit").
 * Showing those raw is the single biggest source of "the app looks
 * broken" support tickets at launch, so every error the auth endpoints
 * can realistically return gets mapped here to a sentence a person can
 * act on.
 *
 * We match on `error.code` first (stable, added in supabase-js v2.x) and
 * fall back to message sniffing for older/edge responses.
 *
 * Returns { kind, text } where `kind` drives which UI affordance shows:
 *   'error'       → red inline message
 *   'unconfirmed' → amber message + a "Resend confirmation email" button
 */
export function translateAuthError(error) {
  const code = error?.code || '';
  const status = error?.status;
  const msg = (error?.message || '').toLowerCase();

  if (code === 'email_not_confirmed' || msg.includes('email not confirmed')) {
    return {
      kind: 'unconfirmed',
      text: "This account exists but the email hasn't been confirmed yet. Check your inbox (and spam folder) for the confirmation link.",
    };
  }
  if (code === 'invalid_credentials' || msg.includes('invalid login credentials')) {
    return {
      kind: 'error',
      text: "That email and password don't match an account. Check the password, or use \u201cForgot password?\u201d below.",
    };
  }
  if (code === 'user_already_exists' || msg.includes('already registered') || msg.includes('user already')) {
    return { kind: 'error', text: 'An account with this email already exists — try signing in instead.' };
  }
  if (code === 'weak_password' || msg.includes('password should be')) {
    return { kind: 'error', text: 'Please choose a longer password — at least 8 characters.' };
  }
  if (code === 'validation_failed' || msg.includes('unable to validate email')) {
    return { kind: 'error', text: "That doesn't look like a valid email address." };
  }
  if (code === 'over_email_send_rate_limit' || code === 'over_request_rate_limit' || status === 429 || msg.includes('rate limit')) {
    return { kind: 'error', text: 'Too many attempts. Please wait about a minute and try again.' };
  }
  if (code === 'signup_disabled' || msg.includes('signups not allowed')) {
    return { kind: 'error', text: 'New signups are currently disabled. Please contact support.' };
  }
  if (msg.includes('failed to fetch') || msg.includes('networkerror') || msg.includes('load failed')) {
    return { kind: 'error', text: "Couldn't reach the server. Check your connection and try again." };
  }
  return { kind: 'error', text: error?.message || 'Something went wrong. Please try again.' };
}

// Supabase deliberately does NOT error when you sign up with an email
// that already exists (that would let anyone enumerate your user list).
// Instead it returns a decoy user with an empty `identities` array. This
// is the documented way to detect it client-side.
function isExistingUserSignup(data) {
  return !!data?.user && Array.isArray(data.user.identities) && data.user.identities.length === 0;
}

// A recovery / confirmation link that has expired comes back as an error
// in the URL hash, e.g. #error=access_denied&error_code=otp_expired.
// Without this the user clicks their email link, lands on a plain login
// screen, and has no idea why.
function readLinkErrorFromUrl() {
  const hash = window.location.hash?.startsWith('#') ? window.location.hash.slice(1) : '';
  if (!hash) return null;
  const params = new URLSearchParams(hash);
  const errorCode = params.get('error_code');
  if (!errorCode) return null;
  window.history.replaceState({}, '', window.location.pathname + window.location.search);
  if (errorCode === 'otp_expired' || errorCode === 'access_denied') {
    return 'That link has expired or was already used. Request a new one below.';
  }
  return params.get('error_description') || 'That link could not be used. Please request a new one.';
}

const INPUT_CLASS =
  'w-full bg-obsidian-800/60 border border-white/8 rounded-lg px-3 py-2.5 text-sm text-slate-200 placeholder:text-slate-500 ' +
  'focus:outline-none focus:border-gilt-gold/60 focus:ring-2 focus:ring-gilt-gold/25 transition';

export default function AuthScreen() {
  // 'login' | 'signup' | 'forgot'
  const [mode, setMode] = useState('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [resending, setResending] = useState(false);

  // `feedback` is a single { kind, text } object rather than three
  // separate booleans, so only one message can ever be on screen at once
  // and switching modes clears it in one place.
  const [feedback, setFeedback] = useState(null);

  useEffect(() => {
    const linkError = readLinkErrorFromUrl();
    if (linkError) setFeedback({ kind: 'error', text: linkError });
  }, []);

  const switchMode = (next) => {
    setMode(next);
    setFeedback(null);
    if (next !== 'login') setPassword('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail) return;
    if (mode !== 'forgot' && !password) return;

    setLoading(true);
    setFeedback(null);

    try {
      if (mode === 'login') {
        const { error } = await supabase.auth.signInWithPassword({ email: cleanEmail, password });
        if (error) setFeedback(translateAuthError(error));
        // On success we do nothing: onAuthStateChange in the store picks
        // up the session and App swaps this screen for the dashboard.
      } else if (mode === 'signup') {
        const { data, error } = await supabase.auth.signUp({
          email: cleanEmail,
          password,
          options: { emailRedirectTo: window.location.origin },
        });
        if (error) {
          setFeedback(translateAuthError(error));
        } else if (isExistingUserSignup(data)) {
          setFeedback({
            kind: 'error',
            text: 'An account with this email already exists — try signing in, or reset the password.',
          });
        } else if (data.session) {
          // Email confirmation is turned OFF in this project's Supabase
          // settings, so signUp returned a live session — the store's
          // listener will route them straight into the app.
          toast.success('Welcome to Obsidian!');
        } else {
          setFeedback({
            kind: 'unconfirmed',
            text: `We sent a confirmation link to ${cleanEmail}. Click it, then come back and sign in.`,
          });
        }
      } else {
        // Forgot password. Note the deliberate lack of "no such user"
        // feedback — confirming which emails have accounts is an
        // enumeration leak, so the response is identical either way.
        const { error } = await supabase.auth.resetPasswordForEmail(cleanEmail, {
          redirectTo: `${window.location.origin}/reset-password`,
        });
        if (error) {
          setFeedback(translateAuthError(error));
        } else {
          setFeedback({
            kind: 'unconfirmed',
            text: `If an account exists for ${cleanEmail}, a password reset link is on its way. The link is valid for one hour.`,
          });
        }
      }
    } catch (err) {
      setFeedback(translateAuthError(err));
    } finally {
      setLoading(false);
    }
  };

  const handleResendConfirmation = async () => {
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail) return;
    setResending(true);
    const { error } = await supabase.auth.resend({
      type: 'signup',
      email: cleanEmail,
      options: { emailRedirectTo: window.location.origin },
    });
    setResending(false);
    if (error) setFeedback(translateAuthError(error));
    else toast.success('Confirmation email sent again.');
  };

  const handleGoogle = async () => {
    setGoogleLoading(true);
    setFeedback(null);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin },
    });
    // On success the browser navigates away to Google, so we only ever
    // reach this line on failure.
    if (error) {
      setFeedback(translateAuthError(error));
      setGoogleLoading(false);
    }
  };

  const heading = { login: 'Welcome back', signup: 'Create your account', forgot: 'Reset your password' }[mode];
  const subheading = {
    login: 'Sign in to see where your money goes.',
    signup: 'Start tracking in under a minute.',
    forgot: "Enter your email and we'll send you a reset link.",
  }[mode];
  const submitLabel = { login: 'Sign In', signup: 'Create Account', forgot: 'Send Reset Link' }[mode];

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

        <h1 className="text-2xl font-semibold text-slate-50 mb-1">{heading}</h1>
        <p className="text-sm text-slate-400 mb-6">{subheading}</p>

        {mode !== 'forgot' && (
          <>
            <button
              onClick={handleGoogle}
              disabled={googleLoading || loading}
              className="w-full flex items-center justify-center gap-2 rounded-xl py-2.5 text-sm mb-4 bg-white text-obsidian-950 font-medium hover:brightness-95 transition disabled:opacity-70"
            >
              <GoogleMark /> {googleLoading ? 'Redirecting…' : 'Continue with Google'}
            </button>

            <div className="flex items-center gap-3 mb-4">
              <div className="h-px flex-1 bg-white/8" />
              <span className="text-xs text-slate-500">or</span>
              <div className="h-px flex-1 bg-white/8" />
            </div>
          </>
        )}

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <label htmlFor="auth-email" className="text-xs text-slate-400 mb-1 block">
              Email
            </label>
            <input
              id="auth-email"
              name="email"
              type="email"
              required
              autoComplete="email"
              autoCapitalize="none"
              spellCheck={false}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className={INPUT_CLASS}
            />
          </div>

          {mode !== 'forgot' && (
            <div>
              <div className="flex items-baseline justify-between mb-1">
                <label htmlFor="auth-password" className="text-xs text-slate-400">
                  Password
                </label>
                {mode === 'login' && (
                  <button
                    type="button"
                    onClick={() => switchMode('forgot')}
                    className="text-xs text-slate-400 hover:text-slate-200 underline underline-offset-2"
                  >
                    Forgot password?
                  </button>
                )}
              </div>
              <input
                id="auth-password"
                name="password"
                type="password"
                required
                minLength={8}
                // Tells password managers to offer a saved password on
                // login and to generate/store a new one on signup —
                // without these two values they frequently do neither.
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className={INPUT_CLASS}
              />
              {mode === 'signup' && <p className="text-xs text-slate-500 mt-1">At least 8 characters.</p>}
            </div>
          )}

          {/* aria-live so screen readers announce the error the moment it
              appears rather than silently swapping it in. */}
          <div aria-live="polite">
            {feedback && (
              <div
                className={`flex gap-2 text-xs rounded-lg px-3 py-2.5 ${
                  feedback.kind === 'unconfirmed'
                    ? 'bg-gilt-gold/10 text-gilt-gold border border-gilt-gold/20'
                    : 'bg-expense-soft text-expense border border-expense/20'
                }`}
              >
                {feedback.kind === 'unconfirmed' ? (
                  <MailCheck size={14} className="shrink-0 mt-0.5" />
                ) : (
                  <AlertCircle size={14} className="shrink-0 mt-0.5" />
                )}
                <div className="flex-1">
                  <p className="leading-relaxed">{feedback.text}</p>
                  {feedback.kind === 'unconfirmed' && mode !== 'forgot' && (
                    <button
                      type="button"
                      onClick={handleResendConfirmation}
                      disabled={resending}
                      className="mt-1.5 underline underline-offset-2 hover:opacity-80 disabled:opacity-50"
                    >
                      {resending ? 'Sending…' : 'Resend confirmation email'}
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>

          <button
            type="submit"
            disabled={loading || googleLoading}
            className="gilt-btn rounded-xl py-2.5 text-sm mt-1 flex items-center justify-center gap-2 disabled:opacity-70"
          >
            {loading ? 'Please wait…' : submitLabel}
            {!loading && <ArrowRight size={15} />}
          </button>
        </form>

        {mode === 'forgot' ? (
          <button
            onClick={() => switchMode('login')}
            className="text-xs text-slate-400 hover:text-slate-200 mt-6 mx-auto flex items-center gap-1"
          >
            <ArrowLeft size={12} /> Back to sign in
          </button>
        ) : (
          <p className="text-xs text-slate-500 text-center mt-6">
            {mode === 'login' ? "Don't have an account? " : 'Already have an account? '}
            <button
              onClick={() => switchMode(mode === 'login' ? 'signup' : 'login')}
              className="text-slate-300 hover:text-slate-100 underline underline-offset-2"
            >
              {mode === 'login' ? 'Sign up' : 'Sign in'}
            </button>
          </p>
        )}
      </motion.div>
    </div>
  );
}