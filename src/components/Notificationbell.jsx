import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Bell, PiggyBank, Repeat, Target, Landmark, Info, CheckCheck } from 'lucide-react';
import { useNotifications } from '../hooks/useNotifications';
import { useEscapeKey } from '../hooks/useEscapeKey';

const TYPE_ICONS = {
  budget: PiggyBank,
  recurring: Repeat,
  goal: Target,
  debt: Landmark,
  system: Info,
};

const TYPE_COLORS = {
  budget: 'text-expense',
  recurring: 'text-amber-400',
  goal: 'text-income',
  debt: 'text-gilt-purple',
  system: 'text-slate-400',
};

function relativeTime(iso) {
  const diff = Date.now() - new Date(iso).getTime();
  const minutes = Math.round(diff / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export default function NotificationBell() {
  const { notifications, unreadCount, markNotificationRead, markAllNotificationsRead } = useNotifications();
  const [open, setOpen] = useState(false);
  const containerRef = useRef(null);

  useEscapeKey(open, () => setOpen(false));

  // Click-outside to dismiss. Listening on mousedown rather than click
  // so the panel closes before any button underneath receives its own
  // click, which otherwise causes a visible flash of the panel closing
  // and the underlying action firing in the same frame.
  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  return (
    <div ref={containerRef} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : 'Notifications'}
        aria-expanded={open}
        aria-haspopup="true"
        className="relative p-2.5 rounded-xl border border-white/8 text-slate-400 hover:text-slate-100 hover:bg-white/5 transition-colors"
      >
        <Bell size={17} />
        {unreadCount > 0 && (
          <motion.span
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-expense text-[10px] font-semibold text-obsidian-950 flex items-center justify-center"
          >
            {unreadCount > 9 ? '9+' : unreadCount}
          </motion.span>
        )}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }}
            transition={{ duration: 0.15 }}
            role="dialog"
            aria-label="Notifications"
            // Anchored right and width-capped to the viewport so it can't
            // overflow the screen edge on a 375px phone.
            className="absolute right-0 top-full mt-2 w-[min(20rem,calc(100vw-2.5rem))] glass-strong rounded-2xl shadow-glass border border-white/8 z-40 overflow-hidden"
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/5">
              <span className="text-sm font-medium text-slate-100">Notifications</span>
              {unreadCount > 0 && (
                <button
                  onClick={markAllNotificationsRead}
                  className="text-xs text-slate-400 hover:text-slate-100 flex items-center gap-1 transition-colors"
                >
                  <CheckCheck size={12} /> Mark all read
                </button>
              )}
            </div>

            <div className="max-h-80 overflow-y-auto overscroll-contain">
              {notifications.length === 0 ? (
                <p className="text-sm text-slate-500 px-4 py-8 text-center">
                  Nothing yet. We'll let you know about budgets, bills and goals.
                </p>
              ) : (
                notifications.map((n) => {
                  const Icon = TYPE_ICONS[n.type] || Info;
                  return (
                    <button
                      key={n.id}
                      onClick={() => !n.read && markNotificationRead(n.id)}
                      className={`w-full text-left flex gap-3 px-4 py-3 border-b border-white/5 last:border-0 transition-colors hover:bg-white/5 ${
                        n.read ? 'opacity-60' : ''
                      }`}
                    >
                      <Icon size={15} className={`shrink-0 mt-0.5 ${TYPE_COLORS[n.type] || 'text-slate-400'}`} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-sm text-slate-100 font-medium leading-snug">{n.title}</p>
                          {!n.read && <span className="w-1.5 h-1.5 rounded-full bg-gilt-gold shrink-0 mt-1.5" />}
                        </div>
                        <p className="text-xs text-slate-400 mt-0.5 leading-relaxed">{n.message}</p>
                        <p className="text-[11px] text-slate-600 mt-1">{relativeTime(n.createdAt)}</p>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}