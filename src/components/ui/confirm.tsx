import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useRef, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { Button } from './index';

// In-app confirmation. window.confirm() is unavailable in some hosts (it
// returns false without showing anything), so destructive actions use this.
type Ask = { message: string; confirmLabel: string; resolve: (ok: boolean) => void } | null;

let current: Ask = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export function confirmAction(message: string, confirmLabel = 'Elimina'): Promise<boolean> {
  current?.resolve(false);
  return new Promise((resolve) => {
    current = { message, confirmLabel, resolve };
    emit();
  });
}

function answer(ok: boolean) {
  const c = current;
  current = null;
  emit();
  c?.resolve(ok);
}

export function ConfirmHost() {
  const ask = useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => current,
  );
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!ask) return;
    cancelRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        answer(false);
      }
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [ask]);

  return createPortal(
    <AnimatePresence>
      {ask && (
        <div className="fixed inset-0 z-[60] flex items-end justify-center p-4 sm:items-center">
          <motion.div className="absolute inset-0 bg-[#1b150c]/40" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => answer(false)} />
          <motion.div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="confirm-message"
            className="relative w-full max-w-sm rounded-2xl border border-line bg-bg p-5 shadow-pop"
            initial={{ opacity: 0, y: 16, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.98 }}
            transition={{ type: 'spring', bounce: 0, duration: 0.3 }}
          >
            <p id="confirm-message" className="text-[15px] leading-relaxed text-ink">
              {ask.message}
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <Button ref={cancelRef} variant="ghost" onClick={() => answer(false)}>
                Annulla
              </Button>
              <Button variant="primary" className="bg-na text-white" onClick={() => answer(true)}>
                {ask.confirmLabel}
              </Button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
