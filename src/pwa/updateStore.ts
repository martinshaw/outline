type Listener = () => void;

type UpdateFn = (reloadPage?: boolean) => Promise<void>;

/** How long the editor must stay idle (and saves clear) before auto-reload. */
const CALM_MS = 2000;
const SAVE_POLL_MS = 50;

let available = false;
let dismissed = false;
let applying = false;
let saveBusy = false;
let uiBlocking = false;
let lastEditorActivity = 0;
let updateFn: UpdateFn | null = null;
let calmTimer: ReturnType<typeof setTimeout> | null = null;
const listeners = new Set<Listener>();

function notify(): void {
  for (const listener of listeners) listener();
}

function clearCalmTimer(): void {
  if (calmTimer != null) {
    clearTimeout(calmTimer);
    calmTimer = null;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForSaveIdle(): Promise<void> {
  while (saveBusy) {
    await sleep(SAVE_POLL_MS);
  }
}

function scheduleCalmReload(): void {
  clearCalmTimer();
  if (!available || dismissed || applying) return;
  if (saveBusy || uiBlocking) return;

  const idleFor = Date.now() - lastEditorActivity;
  const wait = Math.max(0, CALM_MS - idleFor);

  calmTimer = setTimeout(() => {
    calmTimer = null;
    if (!available || dismissed || applying) return;
    if (saveBusy || uiBlocking) return;
    if (Date.now() - lastEditorActivity < CALM_MS) {
      scheduleCalmReload();
      return;
    }
    void applyPwaUpdateWhenReady();
  }, wait);
}

export function setPwaUpdateFn(fn: UpdateFn): void {
  updateFn = fn;
}

/** Debounce pending or disk write in flight. */
export function setPwaSaveBusy(busy: boolean): void {
  if (saveBusy === busy) return;
  saveBusy = busy;
  notify();
  scheduleCalmReload();
}

/** Settings / shortcuts / command palette open. */
export function setPwaUiBlocking(blocking: boolean): void {
  if (uiBlocking === blocking) return;
  uiBlocking = blocking;
  notify();
  scheduleCalmReload();
}

/** Call on editor dirty updates so we don't reload mid-typing. */
export function touchPwaEditorActivity(): void {
  lastEditorActivity = Date.now();
  scheduleCalmReload();
}

/** Called when a waiting service worker is ready to activate. */
export function notifyPwaUpdateAvailable(): void {
  available = true;
  dismissed = false;
  notify();
  scheduleCalmReload();
}

export function dismissPwaUpdateBanner(): void {
  dismissed = true;
  clearCalmTimer();
  notify();
}

export function isPwaUpdateBannerVisible(): boolean {
  return available && !dismissed;
}

export function isPwaUpdateApplying(): boolean {
  return applying;
}

/** True when an update will auto-apply after a calm stretch. */
export function isPwaUpdateWaitingForCalm(): boolean {
  return available && !dismissed && !applying;
}

export function subscribePwaUpdate(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Activate the waiting worker and reload.
 * Waits for in-flight / debounced saves first; skips UI/typing calm gates
 * (used by the Reload button).
 */
export async function applyPwaUpdateWhenReady(): Promise<void> {
  if (applying) return;
  applying = true;
  clearCalmTimer();
  notify();
  try {
    await waitForSaveIdle();
    if (updateFn) {
      await updateFn(true);
    } else {
      window.location.reload();
    }
  } finally {
    applying = false;
    notify();
  }
}

/** @deprecated prefer applyPwaUpdateWhenReady */
export async function applyPwaUpdate(): Promise<void> {
  return applyPwaUpdateWhenReady();
}

/** Ask the registration to check for a newer worker (no reload). */
export function checkPwaUpdate(): void {
  void updateFn?.(false);
}
