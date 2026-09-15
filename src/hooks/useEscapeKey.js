import { useEffect } from 'react';

/**
 * Calls `onClose` when Escape is pressed while `isOpen` is true.
 * Both of the app's modals (TransactionModal, UpgradeModal) already let
 * you close by clicking the backdrop or the X button — this adds the
 * third expected way to dismiss a modal, for anyone navigating by
 * keyboard who may not even be able to reach/click the backdrop.
 *
 * The listener is only attached while `isOpen` is true, and removed on
 * every re-run/unmount, so closed modals add zero overhead and there's
 * no risk of a stale handler firing after the modal that owned it is gone.
 */
export function useEscapeKey(isOpen, onClose) {
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose();
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);
}