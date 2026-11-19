import { useEffect, useRef } from 'react';
import { AnimatePresence, motion } from 'framer-motion';

/**
 * Modal — accessible modal primitive:
 * - focus trap while open (Tab/Shift+Tab)
 * - Escape closes
 * - focus restored to the previously focused element on close
 * - focus moves into the dialog on open
 * - `role="dialog"` + `aria-modal`
 */
export default function Modal({ isOpen, onClose, title, children, maxWidth = 'max-w-md' }) {
  const panelRef = useRef(null);
  const lastFocused = useRef(null);

  useEffect(() => {
    if (!isOpen) return;
    lastFocused.current = document.activeElement;
    const first = panelRef.current?.querySelector('[autofocus], input, button, a[href], select, textarea');
    first?.focus?.();

    const onKeyDown = (e) => {
      if (e.key === 'Escape') {
        onClose();
        return;
      }
      if (e.key !== 'Tab') return;
      const focusables = panelRef.current?.querySelectorAll('a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled])');
      if (!focusables?.length) return;
      const firstEl = focusables[0];
      const lastEl = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === firstEl) {
        e.preventDefault();
        lastEl.focus();
      } else if (!e.shiftKey && document.activeElement === lastEl) {
        e.preventDefault();
        firstEl.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose]);

  useEffect(() => {
    if (!isOpen) {
      lastFocused.current?.focus?.();
      lastFocused.current = null;
    }
  }, [isOpen]);

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
          onClick={onClose}
        >
          <motion.div
            ref={panelRef}
            initial={{ opacity: 0, y: 16, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.98 }}
            transition={{ type: 'spring', stiffness: 300, damping: 28 }}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label={title || 'Dialog'}
            className={`glass-strong rounded-2xl ${maxWidth} p-6 shadow-glass focus:outline-none cursor-pointer`}
          >
            {title && <h3 className="text-lg font-medium text-slate-100 mb-5">{title}</h3>}
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
