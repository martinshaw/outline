export type ToastKind = 'error' | 'info';

export type Toast = {
  id: string;
  kind: ToastKind;
  message: string;
};

type Listener = () => void;

let toasts: Toast[] = [];
const listeners = new Set<Listener>();
let seq = 0;

function emit(): void {
  for (const listener of listeners) listener();
}

export function getToasts(): Toast[] {
  return toasts;
}

export function subscribeToasts(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function showToast(message: string, kind: ToastKind = 'info'): string {
  const id = `toast-${++seq}`;
  toasts = [...toasts, { id, kind, message }];
  emit();
  return id;
}

export function showErrorToast(message: string): string {
  return showToast(message, 'error');
}

export function dismissToast(id: string): void {
  const next = toasts.filter((t) => t.id !== id);
  if (next.length === toasts.length) return;
  toasts = next;
  emit();
}
