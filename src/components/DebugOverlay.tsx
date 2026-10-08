import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  getBlockSelectedIds,
  subscribeBlockSelection,
} from '../editor/blockSelectionStore';
import {
  getSettings,
  setSettings,
  subscribeSettings,
} from '../settings/settingsStore';
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
import { notesClient } from '../storage/notesClient';
import type { FsEntry } from '../storage/fs';
import type { DayDocument, ItemKind, OutlineItem } from '../types';
import { isDayEmpty, itemTitle } from '../utils/outline';

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

type DebugTab = 'overview' | 'nodes' | 'files';

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

function shortId(id: string): string {
  return id.length <= 10 ? id : `${id.slice(0, 6)}…${id.slice(-2)}`;
}

function nodeMeta(item: OutlineItem): string {
  const parts: string[] = [
    item.kind === 'heading' && item.headingLevel != null
      ? `h${item.headingLevel}`
      : item.kind,
  ];
  if (item.status) parts.push(item.status);
  if (item.children.length > 0) parts.push(`×${item.children.length}`);
  return parts.join(' · ');
}

function DocumentNodeRow({
  item,
  depth,
  focusItemId,
  selectedIds,
  expanded,
  onToggle,
}: {
  item: OutlineItem;
  depth: number;
  focusItemId: string | null;
  selectedIds: Set<string>;
  expanded: Set<string>;
  onToggle: (id: string) => void;
}) {
  const hasKids = item.children.length > 0;
  const open = expanded.has(item.id);
  const focused = focusItemId === item.id;
  const blockSel = selectedIds.has(item.id);
  const title = itemTitle(item);

  return (
    <>
      <div
        className={[
          'debug-tree__row',
          focused ? 'debug-tree__row--focus' : '',
          blockSel ? 'debug-tree__row--sel' : '',
        ]
          .filter(Boolean)
          .join(' ')}
        style={{ paddingLeft: `${0.2 + depth * 0.75}rem` }}
      >
        <button
          type="button"
          className="debug-tree__twist"
          disabled={!hasKids}
          aria-expanded={hasKids ? open : undefined}
          onClick={() => hasKids && onToggle(item.id)}
        >
          {hasKids ? (open ? '▾' : '▸') : '·'}
        </button>
        <span className="debug-tree__kind">{nodeMeta(item)}</span>
        <span className="debug-tree__id" title={item.id}>
          {shortId(item.id)}
        </span>
        <span className="debug-tree__label" title={title}>
          {title}
        </span>
      </div>
      {hasKids &&
        open &&
        item.children.map((child) => (
          <DocumentNodeRow
            key={child.id}
            item={child}
            depth={depth + 1}
            focusItemId={focusItemId}
            selectedIds={selectedIds}
            expanded={expanded}
            onToggle={onToggle}
          />
        ))}
    </>
  );
}

function collectExpandableIds(items: OutlineItem[], into: Set<string>) {
  for (const item of items) {
    if (item.children.length > 0) {
      into.add(item.id);
      collectExpandableIds(item.children, into);
    }
  }
}

function DocumentNodesPanel({
  doc,
  focusItemId,
  selected,
}: {
  doc: DayDocument;
  focusItemId: string | null;
  selected: string[];
}) {
  const [expanded, setExpanded] = useState<Set<string>>(() => {
    if (!isDebugEnabled()) return new Set();
    const next = new Set<string>();
    collectExpandableIds(doc.items, next);
    return next;
  });
  const selectedIds = useMemo(() => new Set(selected), [selected]);

  const onToggle = useCallback((id: string) => {
    if (!isDebugEnabled()) return;
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  if (!isDebugEnabled()) return null;

  return (
    <section className="debug-overlay__panel" aria-label="Document nodes">
      <div className="debug-overlay__panel-bar">
        <h3 className="debug-overlay__h">
          Nodes{' '}
          <span className="debug-overlay__muted">
            ({doc.date} · {doc.items.length} root)
          </span>
        </h3>
        <div className="debug-overlay__header-actions">
          <button
            type="button"
            className="btn btn--secondary btn--sm"
            onClick={() => {
              if (!isDebugEnabled()) return;
              const next = new Set<string>();
              collectExpandableIds(doc.items, next);
              setExpanded(next);
            }}
          >
            Expand
          </button>
          <button
            type="button"
            className="btn btn--secondary btn--sm"
            onClick={() => setExpanded(new Set())}
          >
            Collapse
          </button>
        </div>
      </div>
      <div className="debug-tree">
        {doc.items.length === 0 && (
          <div className="debug-overlay__muted">No outline items.</div>
        )}
        {doc.items.map((item) => (
          <DocumentNodeRow
            key={item.id}
            item={item}
            depth={0}
            focusItemId={focusItemId}
            selectedIds={selectedIds}
            expanded={expanded}
            onToggle={onToggle}
          />
        ))}
      </div>
    </section>
  );
}

function pathKey(path: string[]): string {
  return path.join('/');
}

function FileTreeBranch({
  path,
  folderName,
  expanded,
  cache,
  loading,
  errors,
  onToggle,
}: {
  path: string[];
  folderName: string;
  expanded: Set<string>;
  cache: Map<string, FsEntry[]>;
  loading: Set<string>;
  errors: Map<string, string>;
  onToggle: (path: string[]) => void;
}) {
  const key = pathKey(path);
  const entries = cache.get(key);
  const err = errors.get(key);
  const busy = loading.has(key);
  const label = path.length === 0 ? folderName || '(workspace)' : path[path.length - 1];
  const open = expanded.has(key);
  const depth = path.length;

  return (
    <>
      <div
        className="debug-tree__row"
        style={{ paddingLeft: `${0.2 + depth * 0.75}rem` }}
      >
        <button
          type="button"
          className="debug-tree__twist"
          aria-expanded={open}
          onClick={() => onToggle(path)}
        >
          {open ? '▾' : '▸'}
        </button>
        <span className="debug-tree__kind">dir</span>
        <span className="debug-tree__label" title={key || folderName}>
          {label}/
        </span>
      </div>
      {open && (
        <>
          {busy && !entries && (
            <div
              className="debug-overlay__muted"
              style={{ paddingLeft: `${0.95 + depth * 0.75}rem` }}
            >
              Loading…
            </div>
          )}
          {err && (
            <div
              className="debug-overlay__err"
              style={{ paddingLeft: `${0.95 + depth * 0.75}rem` }}
            >
              {err}
            </div>
          )}
          {entries?.map((entry) =>
            entry.kind === 'directory' ? (
              <FileTreeBranch
                key={`${key}/${entry.name}`}
                path={[...path, entry.name]}
                folderName={folderName}
                expanded={expanded}
                cache={cache}
                loading={loading}
                errors={errors}
                onToggle={onToggle}
              />
            ) : (
              <div
                key={`${key}/${entry.name}`}
                className="debug-tree__row"
                style={{
                  paddingLeft: `${0.2 + (depth + 1) * 0.75}rem`,
                }}
              >
                <span className="debug-tree__twist debug-tree__twist--leaf">
                  ·
                </span>
                <span className="debug-tree__kind">file</span>
                <span className="debug-tree__label" title={entry.name}>
                  {entry.name}
                </span>
              </div>
            ),
          )}
        </>
      )}
    </>
  );
}

function FilesPanel({ folderName }: { folderName: string }) {
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(['']));
  const [cache, setCache] = useState<Map<string, FsEntry[]>>(() => new Map());
  const [loading, setLoading] = useState<Set<string>>(() => new Set());
  const [errors, setErrors] = useState<Map<string, string>>(() => new Map());
  const [rev, setRev] = useState(0);

  const loadPath = useCallback(async (path: string[]) => {
    if (!isDebugEnabled()) return;
    const key = pathKey(path);
    setLoading((prev) => new Set(prev).add(key));
    setErrors((prev) => {
      const next = new Map(prev);
      next.delete(key);
      return next;
    });
    try {
      const entries = await notesClient.listDirectory(path);
      if (!isDebugEnabled()) return;
      setCache((prev) => {
        const next = new Map(prev);
        next.set(key, entries);
        return next;
      });
    } catch (e) {
      if (!isDebugEnabled()) return;
      const msg = e instanceof Error ? e.message : String(e);
      setErrors((prev) => new Map(prev).set(key, msg));
    } finally {
      setLoading((prev) => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    }
  }, []);

  useEffect(() => {
    if (!isDebugEnabled()) return;
    void loadPath([]);
  }, [loadPath, rev]);

  const onToggle = useCallback(
    (path: string[]) => {
      if (!isDebugEnabled()) return;
      const key = pathKey(path);
      setExpanded((prev) => {
        const next = new Set(prev);
        if (next.has(key)) {
          next.delete(key);
          return next;
        }
        next.add(key);
        return next;
      });
      if (!cache.has(key) && !loading.has(key)) {
        void loadPath(path);
      }
    },
    [cache, loadPath, loading],
  );

  if (!isDebugEnabled()) return null;

  return (
    <section className="debug-overlay__panel" aria-label="File structure">
      <div className="debug-overlay__panel-bar">
        <h3 className="debug-overlay__h">
          Files <span className="debug-overlay__muted">({folderName})</span>
        </h3>
        <button
          type="button"
          className="btn btn--secondary btn--sm"
          onClick={() => {
            if (!isDebugEnabled()) return;
            setCache(new Map());
            setErrors(new Map());
            setExpanded(new Set(['']));
            setRev((n) => n + 1);
          }}
        >
          Refresh
        </button>
      </div>
      <div className="debug-tree">
        <FileTreeBranch
          path={[]}
          folderName={folderName}
          expanded={expanded}
          cache={cache}
          loading={loading}
          errors={errors}
          onToggle={onToggle}
        />
      </div>
    </section>
  );
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
  const [tab, setTab] = useState<DebugTab>('overview');
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

    // Pending-age clock only matters on Overview.
    let tick: number | undefined;
    if (tab === 'overview') {
      tick = window.setInterval(() => setNow(Date.now()), 250);
    }

    return () => {
      unsubSel();
      unsubDebug();
      if (tick != null) window.clearInterval(tick);
    };
  }, [enabled, tab]);

  useEffect(() => {
    if (!enabled || (tab !== 'overview' && tab !== 'nodes')) return;
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
  }, [enabled, selected, tab]);

  useEffect(() => {
    if (!enabled || tab !== 'overview') return;
    const scroller = logScrollRef.current;
    if (!scroller) return;
    // Newest-first: stick to the top unless the user has scrolled down.
    if (scroller.scrollTop < 48) scroller.scrollTop = 0;
  }, [enabled, logs.length, tab]);

  const stats = useMemo(() => {
    if (!enabled || tab !== 'overview') return null;
    return collectStats(activeDoc);
  }, [enabled, tab, activeDoc]);

  const settingsSnap = useMemo(() => {
    if (!enabled || tab !== 'overview') return null;
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
  }, [enabled, tab, settingsRev]);

  if (!enabled || !isDebugEnabled()) {
    return null;
  }

  const pendingAge =
    tab === 'overview' &&
    save.phase === 'pending' &&
    save.pendingSince != null
      ? `${Math.max(0, Math.round((now - save.pendingSince) / 100) / 10)}s`
      : null;

  return (
    <aside className="debug-overlay" aria-label="Developer panel">
      <header className="debug-overlay__header">
        <div className="debug-overlay__title">Developer</div>
        <div className="debug-overlay__header-actions">
          {tab === 'overview' && (
            <>
              <button
                type="button"
                className="btn btn--secondary btn--sm"
                onClick={() => clearDebugLogs()}
              >
                Clear log
              </button>
              <button
                type="button"
                className="btn btn--secondary btn--sm"
                onClick={() =>
                  debugLog('info', 'developer', 'manual ping', `t=${Date.now()}`)
                }
              >
                Ping
              </button>
            </>
          )}
          <button
            type="button"
            className="btn btn--ghost btn--sm"
            aria-label="Close developer panel"
            title="Close developer panel"
            onClick={() => setSettings({ developerMode: false })}
          >
            ×
          </button>
        </div>
      </header>

      <nav className="debug-overlay__tabs" aria-label="Developer panels">
        {(
          [
            ['overview', 'Overview'],
            ['nodes', 'Nodes'],
            ['files', 'Files'],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            className={
              tab === id
                ? 'debug-overlay__tab debug-overlay__tab--active'
                : 'debug-overlay__tab'
            }
            aria-selected={tab === id}
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
      </nav>

      <div className="debug-overlay__body">
        {tab === 'overview' && stats && settingsSnap && (
          <>
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
                  {save.lastDurationMs != null
                    ? `${save.lastDurationMs}ms`
                    : '—'}
                </div>
                <div>writes · {save.count}</div>
                {save.lastError && (
                  <div className="debug-overlay__err">
                    err · {save.lastError}
                  </div>
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
                Log{' '}
                <span className="debug-overlay__muted">({logs.length})</span>
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
                    <span className="debug-overlay__log-cat">
                      {entry.category}
                    </span>
                    <span className="debug-overlay__log-msg">
                      {entry.message}
                    </span>
                    {entry.detail && (
                      <span className="debug-overlay__log-detail">
                        {entry.detail}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </section>
          </>
        )}

        {tab === 'nodes' && (
          <DocumentNodesPanel
            key={activeDoc.date}
            doc={activeDoc}
            focusItemId={focusItemId}
            selected={selected}
          />
        )}

        {tab === 'files' && <FilesPanel folderName={folderName} />}
      </div>
    </aside>
  );
}
