import { useEffect, useState } from 'react';
import {
  dismissToast,
  getToasts,
  subscribeToasts,
  type Toast,
} from './toastStore';

const AUTO_DISMISS_MS = 4500;

function ToastItem({ toast }: { toast: Toast }) {
  useEffect(() => {
    const timer = window.setTimeout(() => dismissToast(toast.id), AUTO_DISMISS_MS);
    return () => window.clearTimeout(timer);
  }, [toast.id]);

  return (
    <div
      className={
        toast.kind === 'error' ? 'toast toast--error' : 'toast toast--info'
      }
      role={toast.kind === 'error' ? 'alert' : 'status'}
    >
      <p className="toast__message">{toast.message}</p>
      <button
        type="button"
        className="toast__dismiss"
        aria-label="Dismiss"
        onClick={() => dismissToast(toast.id)}
      >
        ×
      </button>
    </div>
  );
}

export function ToastHost() {
  const [toasts, setToasts] = useState<Toast[]>(() => getToasts());

  useEffect(() => {
    return subscribeToasts(() => setToasts(getToasts()));
  }, []);

  if (toasts.length === 0) return null;

  return (
    <div className="toast-host" aria-live="polite">
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} />
      ))}
    </div>
  );
}
