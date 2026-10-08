import { useEffect, useMemo, useRef, useState } from 'react';
import {
  getBlockSelectedIds,
  subscribeBlockSelection,
} from '../editor/blockSelectionStore';
import { getSettings, subscribeSettings } from '../settings/settingsStore';
import {
  clearDebugLogs,
  debugLog,
  getDebugLogs,
  getSaveDebugState,
  isDebugEnabled,
  subscribeDebug,
  type DebugLogEntry,
  type SaveDebugState,
} from '../storage/debugStore';
import type { DayDocument, ItemKind } from '../types';
import { isDayEmpty } from '../utils/outline';

type Props = {
  activeDate: string;
  activeDoc: DayDocument;
  focusItemId: string | null;
  folderName: string;
  offline: boolean;
  editorNonce: number;
  sidebarDayCount: number;
  docsCacheSize: number;
};

type ItemStats = {
  total: number;
  byKind: Record<ItemKind, number>;
  byStatus: Record<string, number>;
  maxDepth: number;
};

function collectStats(doc: DayDocument): ItemStats {
  const byKind: Record<ItemKind, number> = {
    note: 0,
    project: 0,
    task: 0,
    heading: 0,
  };
  const byStatus: Record<string, number> = {};
  let total = 0;
  let maxDepth = 0;

  const walk = (items: DayDocument['items'], depth: number) => {
    maxDepth = Math.max(maxDepth, depth);
    for (const item of items) {
      total += 1;
      byKind[item.kind] += 1;
      if (item.kind === 'project' || item.kind === 'task') {
        const key = item.status ?? '(none)';
        byStatus[key] = (byStatus[key] ?? 0) + 1;
      }
      walk(item.children, depth + 1);
    }
  };
  walk(doc.items, 1);
  return { total, byKind, byStatus, maxDepth };
}

function formatTime(at: number | null): string {
  if (at == null) return '—';
  const d = new Date(at);
  const base = d.toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  return `${base}.${String(d.getMilliseconds()).padStart(3, '0')}`;
}

function formatLogTime(at: number): string {
  return formatTime(at);
}

function statusEntries(byStatus: Record<string, number>): string {
  const keys = Object.keys(byStatus);
  if (keys.length === 0) return '—';
  return keys.map((k) => `${k}:${byStatus[k]}`).join(' ');
}

export function DebugOverlay({
  activeDate,
  activeDoc,
  focusItemId,
  folderName,
  offline,
  editorNonce,
  sidebarDayCount,
  docsCacheSize,
}: Props) {
  const [enabled, setEnabled] = useState(() => getSettings().developerMode);
  const [selected, setSelected] = useState(() => [...getBlockSelectedIds()]);
  const [save, setSave] = useState<SaveDebugState>(() => getSaveDebugState());
  const [logs, setLogs] = useState<DebugLogEntry[]>(() => [...getDebugLogs()]);
  const [now, setNow] = useState(() => Date.now());
  const [settingsRev, setSettingsRev] = useState(0);
  const logScrollRef = useRef<HTMLDivElement>(null);
  const prevSelRef = useRef<string>('');

  useEffect(() => {
    return subscribeSettings((next) => {
      setEnabled(next.developerMode);
      setSettingsRev((n) => n + 1);
    });
  }, []);

  useEffect(() => {
    if (!enabled) return;

    const unsubSel = subscribeBlockSelection(() => {
      setSelected([...getBlockSelectedIds()]);
    });
    const unsubDebug = subscribeDebug(() => {
      setSave(getSaveDebugState());
      setLogs([...getDebugLogs()]);
    });
    setSave(getSaveDebugState());
    setLogs([...getDebugLogs()]);
    setSelected([...getBlockSelectedIds()]);

    const tick = window.setInterval(() => setNow(Date.now()), 250);

    return () => {
      unsubSel();
      unsubDebug();
      window.clearInterval(tick);
    };
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;
    const key = selected.slice().sort().join(',');
    if (key === prevSelRef.current) return;
    prevSelRef.current = key;
    debugLog(
      'debug',
      'selection',
      selected.length === 0
        ? 'block selection cleared'
        : `block selection ×${selected.length}`,
      selected.length > 0
        ? selected.map((id) => id.slice(0, 8)).join(' ')
        : undefined,
    );
  }, [enabled, selected]);

  useEffect(() => {
    if (!enabled) return;
    const scroller = logScrollRef.current;
    if (!scroller) return;
    // Newest-first: stick to the top unless the user has scrolled down.
    if (scroller.scrollTop < 48) scroller.scrollTop = 0;
  }, [enabled, logs.length]);

  const stats = useMemo(() => {
    if (!enabled) return null;
    return collectStats(activeDoc);
  }, [enabled, activeDoc]);

  const settingsSnap = useMemo(() => {
    if (!enabled) return null;
    const s = getSettings();
    return {
      theme: s.theme,
      font: s.systemFontFamily ?? s.font,
      fontSize: s.fontSize,
      debounce: s.saveDebounceMs,
      backup: s.backupMode,
      backupDir: s.backupDirectory,
      statuses: s.statuses.length,
    };
  }, [enabled, settingsRev]);

  if (!enabled || !isDebugEnabled() || !stats || !settingsSnap) {
    return null;
  }

  const pendingAge =
    save.phase === 'pending' && save.pendingSince != null
      ? `${Math.max(0, Math.round((now - save.pendingSince) / 100) / 10)}s`
      : null;

  return (
    <aside className="debug-overlay" aria-label="Developer panel">
      <header className="debug-overlay__header">
        <div className="debug-overlay__title">Developer</div>
        <div className="debug-overlay__header-actions">
          <button
            type="button"
            className="debug-overlay__btn"
            onClick={() => clearDebugLogs()}
          >
            Clear log
          </button>
          <button
            type="button"
            className="debug-overlay__btn"
            onClick={() =>
              debugLog('info', 'developer', 'manual ping', `t=${Date.now()}`)
            }
          >
            Ping
          </button>
        </div>
      </header>

      <div className="debug-overlay__body">
        <div className="debug-overlay__stats">
          <section className="debug-overlay__section">
            <h3 className="debug-overlay__h">Session</h3>
            <div>folder · {folderName}</div>
            <div>net · {offline ? 'offline' : 'online'}</div>
            <div>editor nonce · {editorNonce}</div>
            <div>
              cache · {docsCacheSize} day{docsCacheSize === 1 ? '' : 's'}
            </div>
            <div>sidebar · {sidebarDayCount} day rows</div>
          </section>

          <section className="debug-overlay__section">
            <h3 className="debug-overlay__h">Day</h3>
            <div>date · {activeDate}</div>
            <div>
              items · {stats.total}
              {isDayEmpty(activeDoc) ? ' (empty)' : ''}
            </div>
            <div>
              kinds · note {stats.byKind.note} · heading{' '}
              {stats.byKind.heading} · project {stats.byKind.project} · task{' '}
              {stats.byKind.task}
            </div>
            <div>status · {statusEntries(stats.byStatus)}</div>
            <div>depth · {stats.maxDepth}</div>
            <div>
              focus · {focusItemId ? focusItemId.slice(0, 8) : '—'}
              {focusItemId ? `…${focusItemId.slice(-4)}` : ''}
            </div>
            <div>
              block sel · {selected.length}
              {selected.length > 0
                ? `: ${selected.map((id) => id.slice(0, 8)).join(' ')}`
                : ''}
            </div>
          </section>

          <section className="debug-overlay__section">
            <h3 className="debug-overlay__h">Save</h3>
            <div>
              phase · {save.phase}
              {pendingAge ? ` (${pendingAge})` : ''}
            </div>
            <div>msg · {save.message}</div>
            <div>date · {save.date ?? '—'}</div>
            <div>last at · {formatTime(save.at)}</div>
            <div>
              duration ·{' '}
              {save.lastDurationMs != null ? `${save.lastDurationMs}ms` : '—'}
            </div>
            <div>writes · {save.count}</div>
            {save.lastError && (
              <div className="debug-overlay__err">err · {save.lastError}</div>
            )}
          </section>

          <section className="debug-overlay__section">
            <h3 className="debug-overlay__h">Settings</h3>
            <div>theme · {settingsSnap.theme}</div>
            <div>
              font · {settingsSnap.font} @ {settingsSnap.fontSize}rem
            </div>
            <div>debounce · {settingsSnap.debounce}ms</div>
            <div>
              backup · {settingsSnap.backup} / {settingsSnap.backupDir}
            </div>
            <div>statuses · {settingsSnap.statuses}</div>
          </section>
        </div>

        <section className="debug-overlay__log" aria-label="Debug log">
          <h3 className="debug-overlay__h">
            Log <span className="debug-overlay__muted">({logs.length})</span>
          </h3>
          <div className="debug-overlay__log-scroll" ref={logScrollRef}>
            {logs.length === 0 && (
              <div className="debug-overlay__muted">No events yet.</div>
            )}
            {logs.map((entry) => (
              <div
                key={entry.id}
                className={`debug-overlay__log-line debug-overlay__log-line--${entry.level}`}
              >
                <span className="debug-overlay__log-time">
                  {formatLogTime(entry.at)}
                </span>
                <span className="debug-overlay__log-cat">{entry.category}</span>
                <span className="debug-overlay__log-msg">{entry.message}</span>
                {entry.detail && (
                  <span className="debug-overlay__log-detail">
                    {entry.detail}
                  </span>
                )}
              </div>
            ))}
          </div>
        </section>
      </div>
    </aside>
  );
}
