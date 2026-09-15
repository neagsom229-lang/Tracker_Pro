import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Download, X, Share } from 'lucide-react';

/**
 * InstallPrompt
 * -------------
 * Two very different jobs behind one banner.
 *
 * On Chrome/Edge/Android the browser fires `beforeinstallprompt`, we keep
 * the event, and calling .prompt() on it opens the real native install
 * dialog. That's the good path.
 *
 * On iOS Safari there is no such event and no programmatic install at
 * all — Add to Home Screen is a manual Share-sheet action. Showing a
 * button that can't do anything would be worse than showing nothing, so
 * iOS gets instructions instead of a button.
 *
 * DISMISSAL IS REMEMBERED IN localStorage BY DESIGN. Everything else in
 * this app stores state in Postgres, but "I don't want to install this"
 * is a property of the device, not the account: a user who installed on
 * their phone should still be prompted on their laptop, and someone who
 * dismissed it on a shared machine shouldn't have that follow them.
 */

const DISMISS_KEY = 'obsidian:install-dismissed';
const DISMISS_DAYS = 30;

function isStandalone() {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    // iOS reports installed status on navigator, not via display-mode.
    window.navigator.standalone === true
  );
}

function isIOS() {
  return /iphone|ipad|ipod/i.test(window.navigator.userAgent) && !window.MSStream;
}

function wasRecentlyDismissed() {
  try {
    const raw = window.localStorage.getItem(DISMISS_KEY);
    if (!raw) return false;
    return Date.now() - Number(raw) < DISMISS_DAYS * 86_400_000;
  } catch {
    // Private mode / storage disabled. Treat as "not dismissed" rather
    // than crashing the banner.
    return false;
  }
}

export default function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [visible, setVisible] = useState(false);
  const [showIOSHelp, setShowIOSHelp] = useState(false);

  useEffect(() => {
    if (isStandalone() || wasRecentlyDismissed()) return;

    if (isIOS()) {
      // Delay so this isn't the first thing a brand-new user sees.
      const timer = setTimeout(() => {
        setShowIOSHelp(true);
        setVisible(true);
      }, 20_000);
      return () => clearTimeout(timer);
    }

    const handler = (e) => {
      // Suppress Chrome's own mini-infobar so we control placement.
      e.preventDefault();
      setDeferredPrompt(e);
      setVisible(true);
    };

    window.addEventListener('beforeinstallprompt', handler);
    window.addEventListener('appinstalled', () => setVisible(false));
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const dismiss = () => {
    setVisible(false);
    try {
      window.localStorage.setItem(DISMISS_KEY, String(Date.now()));
    } catch {
      /* storage unavailable — the banner just reappears next session */
    }
  };

  const install = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    // The event is single-use; Chrome will fire a fresh one if the user
    // declines and becomes eligible again later.
    setDeferredPrompt(null);
    setVisible(false);
    if (outcome === 'dismissed') dismiss();
  };

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 20 }}
          role="dialog"
          aria-label="Install Obsidian"
          // Sits above the mobile nav on phones and bottom-right on
          // desktop, clear of the safe-area inset either way.
          className="fixed z-40 glass-strong rounded-2xl shadow-glass border border-white/10 p-4
                     left-4 right-4 bottom-[calc(4.5rem+env(safe-area-inset-bottom))]
                     md:left-auto md:right-6 md:bottom-6 md:w-80"
        >
          <button
            onClick={dismiss}
            aria-label="Dismiss install prompt"
            className="absolute top-3 right-3 text-slate-500 hover:text-slate-200 transition-colors"
          >
            <X size={15} />
          </button>

          <div className="flex items-start gap-3 pr-6">
            <div className="w-9 h-9 rounded-xl bg-gilt-gradient flex items-center justify-center shrink-0">
              <Download size={16} className="text-obsidian-950" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium text-slate-100">Install Obsidian</p>
              {showIOSHelp ? (
                <p className="text-xs text-slate-400 mt-1 leading-relaxed flex items-center gap-1 flex-wrap">
                  Tap <Share size={12} className="inline text-slate-300" /> then
                  <span className="text-slate-300">Add to Home Screen</span> for full-screen access.
                </p>
              ) : (
                <>
                  <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                    Add it to your home screen for full-screen access and faster launches.
                  </p>
                  <button onClick={install} className="gilt-btn rounded-lg px-3 py-1.5 text-xs mt-3">
                    Install
                  </button>
                </>
              )}
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}