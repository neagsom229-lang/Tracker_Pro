import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Bell } from 'lucide-react';
import { useNotifications } from '../hooks/useNotifications';
import { useEscapeKey } from '../hooks/useEscapeKey';

const TYPE_DOT = {
  budget_exceeded: 'bg-expense',
  recurring_due: 'bg-amber-400',
  goal_reached: 'bg-income',
  info: 'bg-slate-500',
};

function timeAgo(iso) {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default function NotificationBell() {
  const { notifications, unreadCount, markNotificationRead, markAllNotificationsRead } = useNotifications();
  const [isOpen, setIsOpen] = useState(false);

  useEscapeKey(isOpen, () => setIsOpen(false));

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen((v) => !v)}
        aria-label={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : 'Notifications'}
        className="relative w-9 h-9 rounded-lg glass flex items-center justify-center text-slate-300 hover:text-slate-100"
      >
        <Bell size={16} />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full bg-expense text-[10px] font-medium text-white flex items-center justify-center">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      <AnimatePresence>
        {isOpen && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
            <motion.div
              initial={{ opacity: 0, y: -8, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -8, scale: 0.97 }}
              transition={{ duration: 0.15 }}
              className="absolute right-0 top-11 z-50 w-80 max-h-96 overflow-y-auto glass-strong rounded-2xl shadow-glass p-2"
            >
              <div className="flex items-center justify-between px-2 py-1.5">
                <span className="text-sm font-medium text-slate-200">Notifications</span>
                {unreadCount > 0 && (
                  <button onClick={markAllNotificationsRead} className="text-xs text-slate-500 hover:text-slate-300">
                    Mark all read
                  </button>
                )}
              </div>

              {notifications.length === 0 && (
                <p className="text-sm text-slate-500 text-center py-8">You're all caught up.</p>
              )}

              {notifications.map((n) => (
                <button
                  key={n.id}
                  onClick={() => !n.read && markNotificationRead(n.id)}
                  className={`w-full text-left flex items-start gap-2 rounded-xl px-2 py-2.5 transition-colors ${
                    n.read ? 'hover:bg-white/5' : 'bg-white/5 hover:bg-white/8'
                  }`}
                >
                  <span className={`w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 ${TYPE_DOT[n.type] || TYPE_DOT.info}`} />
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm text-slate-200">{n.title}</span>
                    <span className="block text-xs text-slate-500 truncate">{n.message}</span>
                  </span>
                  <span className="text-[10px] text-slate-600 shrink-0">{timeAgo(n.createdAt)}</span>
                </button>
              ))}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}