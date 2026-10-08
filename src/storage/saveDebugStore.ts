export type SavePhase = 'idle' | 'pending' | 'saving' | 'saved' | 'deleted' | 'error';

export type SaveDebugState = {
  phase: SavePhase;
  date: string | null;
  message: string;
  at: number | null;
  count: number;
  lastError: string | null;
};

type Listener = () => void;

let state: SaveDebugState = {
  phase: 'idle',
  date: null,
  message: 'no saves yet',
  at: null,
  count: 0,
  lastError: null,
};

const listeners = new Set<Listener>();

function emit(): void {
  for (const listener of listeners) listener();
}

export function getSaveDebugState(): SaveDebugState {
  return state;
}

export function subscribeSaveDebug(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function markSavePending(date: string): void {
  state = {
    ...state,
    phase: 'pending',
    date,
    message: `debounce ${date}`,
    lastError: null,
  };
  emit();
}

export function markSaveStart(date: string): void {
  state = {
    ...state,
    phase: 'saving',
    date,
    message: `writing ${date}.json`,
    lastError: null,
  };
  emit();
}

export function markSaveSuccess(
  date: string,
  status: 'saved' | 'deleted',
): void {
  state = {
    phase: status,
    date,
    message: status === 'deleted' ? `deleted ${date}.json` : `wrote ${date}.json`,
    at: Date.now(),
    count: state.count + 1,
    lastError: null,
  };
  emit();
}

export function markSaveError(date: string, error: string): void {
  state = {
    ...state,
    phase: 'error',
    date,
    message: `failed ${date}`,
    at: Date.now(),
    lastError: error,
  };
  emit();
}
