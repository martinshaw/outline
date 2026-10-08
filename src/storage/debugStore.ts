import { getSettings, subscribeSettings } from '../settings/settingsStore';

export type SavePhase =
  | 'idle'
  | 'pending'
  | 'saving'
  | 'saved'
  | 'deleted'
  | 'error';

export type DebugLogLevel = 'debug' | 'info' | 'warn' | 'error';

export type DebugLogEntry = {
  id: number;
  at: number;
  level: DebugLogLevel;
  category: string;
  message: string;
  detail?: string;
};

export type SaveDebugState = {
  phase: SavePhase;
  date: string | null;
  message: string;
  at: number | null;
  count: number;
  lastError: string | null;
  lastDurationMs: number | null;
  pendingSince: number | null;
  saveStartedAt: number | null;
};

const MAX_LOGS = 300;

type Listener = () => void;

const IDLE_SAVE: SaveDebugState = {
  phase: 'idle',
  date: null,
  message: 'no saves yet',
  at: null,
  count: 0,
  lastError: null,
  lastDurationMs: null,
  pendingSince: null,
  saveStartedAt: null,
};

let save: SaveDebugState = { ...IDLE_SAVE };
let logs: DebugLogEntry[] = [];
let nextLogId = 1;
const listeners = new Set<Listener>();

/** Source of truth: settings checkbox for the developer panel. */
function isOn(): boolean {
  return getSettings().developerMode === true;
}

function emit(): void {
  if (!isOn()) return;
  for (const listener of listeners) listener();
}

function resetState(): void {
  save = { ...IDLE_SAVE };
  logs = [];
  // Listeners may still be subscribed while the panel unmounts — notify once.
  for (const listener of listeners) listener();
}

function pushLog(
  level: DebugLogLevel,
  category: string,
  message: string,
  detail?: string,
): void {
  if (!isOn()) return;
  // Newest first so the panel always shows the latest at the top.
  logs.unshift({
    id: nextLogId++,
    at: Date.now(),
    level,
    category,
    message,
    detail,
  });
  if (logs.length > MAX_LOGS) {
    logs.length = MAX_LOGS;
  }
  emit();
}

/** Whether the developer panel is collecting data. */
export function isDebugEnabled(): boolean {
  return isOn();
}

export function getSaveDebugState(): SaveDebugState {
  return save;
}

export function getDebugLogs(): readonly DebugLogEntry[] {
  return logs;
}

export function subscribeDebug(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** @deprecated use subscribeDebug */
export function subscribeSaveDebug(listener: Listener): () => void {
  return subscribeDebug(listener);
}

export function clearDebugLogs(): void {
  if (!isOn()) return;
  logs = [];
  pushLog('info', 'developer', 'log cleared');
}

export function debugLog(
  level: DebugLogLevel,
  category: string,
  message: string,
  detail?: string,
): void {
  if (!isOn()) return;
  pushLog(level, category, message, detail);
}

export function markSavePending(date: string): void {
  if (!isOn()) return;
  const now = Date.now();
  const alreadyPending = save.phase === 'pending' && save.date === date;
  save = {
    ...save,
    phase: 'pending',
    date,
    message: `debounce ${date}`,
    pendingSince: alreadyPending ? save.pendingSince : now,
    lastError: null,
  };
  // Avoid log spam while typing — one pending line per debounce window.
  if (!alreadyPending) {
    pushLog(
      'debug',
      'save',
      `pending ${date}`,
      `debounce ${getSettings().saveDebounceMs}ms`,
    );
  } else {
    emit();
  }
}

export function markSaveStart(date: string): void {
  if (!isOn()) return;
  const now = Date.now();
  const waitMs =
    save.pendingSince != null ? Math.round(now - save.pendingSince) : null;
  save = {
    ...save,
    phase: 'saving',
    date,
    message: `writing ${date}.json`,
    saveStartedAt: now,
    lastError: null,
  };
  pushLog(
    'info',
    'save',
    `start ${date}.json`,
    waitMs != null ? `after ${waitMs}ms debounce` : undefined,
  );
}

export function markSaveSuccess(
  date: string,
  status: 'saved' | 'deleted',
): void {
  if (!isOn()) return;
  const now = Date.now();
  const durationMs =
    save.saveStartedAt != null ? Math.round(now - save.saveStartedAt) : null;
  save = {
    phase: status,
    date,
    message:
      status === 'deleted' ? `deleted ${date}.json` : `wrote ${date}.json`,
    at: now,
    count: save.count + 1,
    lastError: null,
    lastDurationMs: durationMs,
    pendingSince: null,
    saveStartedAt: null,
  };
  pushLog(
    'info',
    'save',
    status === 'deleted' ? `deleted ${date}.json` : `wrote ${date}.json`,
    durationMs != null ? `${durationMs}ms · #${save.count}` : `#${save.count}`,
  );
}

export function markSaveError(date: string, error: string): void {
  if (!isOn()) return;
  const now = Date.now();
  const durationMs =
    save.saveStartedAt != null ? Math.round(now - save.saveStartedAt) : null;
  save = {
    ...save,
    phase: 'error',
    date,
    message: `failed ${date}`,
    at: now,
    lastError: error,
    lastDurationMs: durationMs,
    pendingSince: null,
    saveStartedAt: null,
  };
  pushLog('error', 'save', `failed ${date}`, error);
}

let wasOn = isOn();
subscribeSettings((settings) => {
  const next = settings.developerMode === true;
  if (next && !wasOn) {
    wasOn = true;
    pushLog('info', 'developer', 'Developer panel enabled');
  } else if (!next && wasOn) {
    wasOn = false;
    resetState();
  }
});
