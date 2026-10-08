import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { OutlineEditor } from './editor/OutlineEditor';
import { Sidebar } from './sidebar/Sidebar';
import { DebugOverlay } from './components/DebugOverlay';
import { FolderGate } from './components/FolderGate';
import { CommandPalette } from './components/CommandPalette';
import { CommandPaletteTrigger } from './components/CommandPaletteTrigger';
import { SettingsDialog } from './components/SettingsDialog';
import { ShortcutsDialog } from './components/ShortcutsDialog';
import { ToastHost } from './components/ToastHost';
import { UpdateBanner } from './components/UpdateBanner';
import { showErrorToast } from './components/toastStore';
import { setPwaUiBlocking } from './pwa/updateStore';
import {
  getSettings,
  setSettings,
  subscribeSettings,
} from './settings/settingsStore';
import {
  ensureReadWritePermission,
  loadStoredDirectoryHandle,
  pickNotesDirectory,
  storeDirectoryHandle,
  supportsDirectoryPicker,
} from './storage/directory';
import { notesClient } from './storage/notesClient';
import {
  debugLog,
  isDebugEnabled,
  markSaveError,
  markSaveStart,
  markSaveSuccess,
} from './storage/debugStore';
import type { DayDocument, SidebarDay } from './types';
import { emptyDayDocument, formatDayLabel, todayKey } from './utils/date';
import { createDummyHierarchy } from './utils/dummyHierarchy';
import {
  buildSidebarFromDocs,
  extractSidebarDay,
  isDayEmpty,
  sidebarDaysEqual,
} from './utils/outline';

type GateState =
  | { status: 'loading' }
  | { status: 'need-folder' }
  | { status: 'need-permission'; handle: FileSystemDirectoryHandle }
  | { status: 'ready'; handle: FileSystemDirectoryHandle; folderName: string };

export default function App() {
  const supportsFs = useMemo(() => supportsDirectoryPicker(), []);
  const [gate, setGate] = useState<GateState>({ status: 'loading' });
  const [offline, setOffline] = useState(!navigator.onLine);
  const [activeDate, setActiveDate] = useState(todayKey());
  const [activeDoc, setActiveDoc] = useState<DayDocument>(() =>
    emptyDayDocument(todayKey()),
  );
  const [sidebar, setSidebar] = useState<SidebarDay[]>([]);
  const [focusItemId, setFocusItemId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [editorNonce, setEditorNonce] = useState(0);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(
    () => getSettings().sidebarCollapsed,
  );
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [developerMode, setDeveloperMode] = useState(
    () => getSettings().developerMode,
  );
  const [docsCache, setDocsCache] = useState<Map<string, DayDocument>>(
    () => new Map(),
  );
  const [isNarrow, setIsNarrow] = useState(
    () =>
      typeof window !== 'undefined' &&
      window.matchMedia('(max-width: 768px)').matches,
  );
  const docsCacheRef = useRef(docsCache);
  const activeDateRef = useRef(activeDate);
  const isNarrowRef = useRef(isNarrow);
  docsCacheRef.current = docsCache;
  activeDateRef.current = activeDate;
  isNarrowRef.current = isNarrow;

  useEffect(() => {
    const onOnline = () => {
      setOffline(false);
      debugLog('info', 'net', 'online');
    };
    const onOffline = () => {
      setOffline(true);
      debugLog('warn', 'net', 'offline');
    };
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 768px)');
    const onChange = () => {
      const narrow = mq.matches;
      setIsNarrow(narrow);
      // Phone-width: start with the editor; open nav via the menu button.
      if (narrow) setSettings({ sidebarCollapsed: true });
    };
    onChange();
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  useEffect(() => {
    return subscribeSettings((next) => {
      setSidebarCollapsed(next.sidebarCollapsed);
      setDeveloperMode(next.developerMode);
    });
  }, []);

  const collapseSidebarIfNarrow = useCallback(() => {
    if (isNarrowRef.current) setSettings({ sidebarCollapsed: true });
  }, []);

  useEffect(() => {
    setPwaUiBlocking(paletteOpen || settingsOpen || shortcutsOpen);
  }, [paletteOpen, settingsOpen, shortcutsOpen]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing =
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable);

      if (
        (event.key === 'p' || event.key === 'P') &&
        (event.metaKey || event.ctrlKey) &&
        !event.altKey &&
        !event.shiftKey
      ) {
        event.preventDefault();
        setPaletteOpen((open) => !open);
        return;
      }

      if (event.key === '?' && !event.metaKey && !event.ctrlKey && !event.altKey) {
        if (typing) return;
        event.preventDefault();
        setShortcutsOpen(true);
        return;
      }
      if (
        (event.key === '/' || event.code === 'Slash') &&
        (event.metaKey || event.ctrlKey) &&
        !event.altKey
      ) {
        event.preventDefault();
        setShortcutsOpen(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const bootstrapFolder = useCallback(async (handle: FileSystemDirectoryHandle) => {
    const t0 = performance.now();
    const granted = await ensureReadWritePermission(handle);
    if (!granted) {
      debugLog('warn', 'fs', 'permission denied', handle.name);
      setGate({ status: 'need-permission', handle });
      return;
    }
    // Keep IndexedDB in sync so “Allow on every visit” restores this folder.
    await storeDirectoryHandle(handle);
    await notesClient.setRoot(handle);
    const index = await notesClient.loadIndex();
    const cache = new Map<string, DayDocument>();
    for (const doc of index.docs) cache.set(doc.date, doc);
    setDocsCache(cache);
    setSidebar(index.sidebar);

    const today = todayKey();
    const todayDoc = cache.get(today) ?? emptyDayDocument(today);
    setActiveDate(today);
    setActiveDoc(todayDoc);
    setGate({ status: 'ready', handle, folderName: handle.name });
    // Folder settings may reopen the sidebar; keep phones on the editor.
    if (
      isNarrowRef.current ||
      window.matchMedia('(max-width: 768px)').matches
    ) {
      setSettings({ sidebarCollapsed: true });
    }
    debugLog(
      'info',
      'fs',
      `workspace ready · ${handle.name}`,
      `${index.docs.length} days · ${Math.round(performance.now() - t0)}ms`,
    );
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!supportsFs) {
        setGate({ status: 'need-folder' });
        return;
      }
      try {
        const stored = await loadStoredDirectoryHandle();
        if (cancelled) return;
        if (!stored) {
          setGate({ status: 'need-folder' });
          return;
        }
        // Always try the last folder first. If the user chose “Allow on every
        // visit”, permission is already granted and we enter the app. Otherwise
        // requestPermission may show Chrome’s dialog, or we fall back to the gate.
        debugLog('info', 'fs', 'restoring last folder', stored.name);
        await bootstrapFolder(stored);
      } catch (e) {
        console.error(e);
        showErrorToast(e instanceof Error ? e.message : String(e));
        if (!cancelled) setGate({ status: 'need-folder' });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [supportsFs, bootstrapFolder]);

  const openFolder = async () => {
    setBusy(true);
    try {
      const handle = await pickNotesDirectory();
      await bootstrapFolder(handle);
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return;
      console.error('Open folder failed', e);
      showErrorToast(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const grantPermission = async () => {
    if (gate.status !== 'need-permission') return;
    setBusy(true);
    try {
      await bootstrapFolder(gate.handle);
    } catch (e) {
      console.error('Grant permission failed', e);
      showErrorToast(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const mergeSidebar = useCallback(
    (doc: DayDocument, baseSidebar: SidebarDay[]) => {
      const existing = baseSidebar.find((d) => d.date === doc.date);
      if (isDayEmpty(doc)) {
        if (!existing) return baseSidebar;
        return baseSidebar
          .filter((d) => d.date !== doc.date)
          .sort((a, b) => (a.date < b.date ? 1 : -1));
      }
      const nextDay = extractSidebarDay(doc);
      if (existing && sidebarDaysEqual(existing, nextDay)) {
        return baseSidebar;
      }
      const without = existing
        ? baseSidebar.filter((d) => d.date !== doc.date)
        : baseSidebar;
      return [...without, nextDay].sort((a, b) =>
        a.date < b.date ? 1 : -1,
      );
    },
    [],
  );

  const handleChange = useCallback(
    (doc: DayDocument) => {
      setDocsCache((prev) => {
        const empty = isDayEmpty(doc);
        if (empty && doc.date !== todayKey()) {
          if (!prev.has(doc.date)) return prev;
          const next = new Map(prev);
          next.delete(doc.date);
          return next;
        }
        const prevDoc = prev.get(doc.date);
        if (prevDoc === doc) return prev;
        const next = new Map(prev);
        next.set(doc.date, doc);
        return next;
      });
      setSidebar((prev) => mergeSidebar(doc, prev));
    },
    [mergeSidebar],
  );

  const handleSave = useCallback(
    async (doc: DayDocument) => {
      if (gate.status !== 'ready') return;
      const debugOn = isDebugEnabled();
      if (debugOn) markSaveStart(doc.date);
      try {
        const result = await notesClient.saveDay(doc);
        if (debugOn) markSaveSuccess(doc.date, result.status);
        setSidebar((prev) => mergeSidebar(doc, prev));
        setDocsCache((prev) => {
          const next = new Map(prev);
          if (result.status === 'deleted') next.delete(doc.date);
          else next.set(doc.date, doc);
          return next;
        });
      } catch (e) {
        console.error('Save failed', e);
        const msg = e instanceof Error ? e.message : String(e);
        if (debugOn) markSaveError(doc.date, msg);
        showErrorToast(msg);
      }
    },
    [gate, mergeSidebar],
  );

  const selectDay = useCallback(
    async (date: string) => {
      if (date === activeDateRef.current) {
        collapseSidebarIfNarrow();
        return;
      }
      // Flush current via cache; disk already debounced
      const cached = docsCacheRef.current.get(date);
      if (cached) {
        debugLog('info', 'nav', `day ${date}`, 'from cache');
        setActiveDate(date);
        setActiveDoc(cached);
        collapseSidebarIfNarrow();
        return;
      }
      try {
        const t0 = performance.now();
        const fromDisk = await notesClient.loadDay(date);
        const doc = fromDisk ?? emptyDayDocument(date);
        setDocsCache((prev) => new Map(prev).set(date, doc));
        setActiveDate(date);
        setActiveDoc(doc);
        debugLog(
          'info',
          'nav',
          `day ${date}`,
          `${fromDisk ? 'from disk' : 'empty'} · ${Math.round(performance.now() - t0)}ms`,
        );
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        debugLog('error', 'nav', `day ${date} failed`, msg);
        showErrorToast(msg);
      }
      collapseSidebarIfNarrow();
    },
    [collapseSidebarIfNarrow],
  );

  const selectItem = useCallback(
    async (date: string, itemId: string) => {
      if (date !== activeDateRef.current) {
        await selectDay(date);
      }
      setFocusItemId(itemId);
      debugLog('debug', 'nav', 'focus item', itemId.slice(0, 8));
      collapseSidebarIfNarrow();
    },
    [collapseSidebarIfNarrow, selectDay],
  );

  const insertDummyHierarchy = useCallback(() => {
    const date = activeDateRef.current;
    const doc = createDummyHierarchy(date);
    setActiveDoc(doc);
    setDocsCache((prev) => new Map(prev).set(date, doc));
    setSidebar((prev) => mergeSidebar(doc, prev));
    setEditorNonce((n) => n + 1);
    debugLog('info', 'dev', 'inserted test hierarchy', doc.date);
    void handleSave(doc);
  }, [handleSave, mergeSidebar]);

  const openShortcuts = useCallback(() => setShortcutsOpen(true), []);
  const openSettings = useCallback(() => setSettingsOpen(true), []);
  const onExportMessage = useCallback((msg: string | null) => {
    if (msg) showErrorToast(msg);
  }, []);
  const onFocusHandled = useCallback(() => setFocusItemId(null), []);

  // Prefer live sidebar; if empty, derive from cache once.
  const displaySidebar = useMemo(() => {
    if (sidebar.length > 0) return sidebar;
    return buildSidebarFromDocs([...docsCache.values()]);
  }, [sidebar, docsCache]);

  const liveDoc = docsCache.get(activeDate) ?? activeDoc;

  if (gate.status === 'loading') {
    return (
      <div className="gate">
        <p className="gate__copy">Loading…</p>
      </div>
    );
  }

  if (gate.status !== 'ready') {
    return (
      <>
        <FolderGate
          supportsFs={supportsFs}
          folderName={
            gate.status === 'need-permission' ? gate.handle.name : null
          }
          needsPermission={gate.status === 'need-permission'}
          offline={offline}
          busy={busy}
          onOpenFolder={openFolder}
          onGrantPermission={grantPermission}
        />
        <UpdateBanner />
        <ToastHost />
      </>
    );
  }

  return (
    <div
      className={
        sidebarCollapsed ? 'app app--sidebar-collapsed' : 'app'
      }
    >
      <header className="topbar">
        <div className="topbar__left">
          <button
            type="button"
            className="btn btn--ghost btn--icon-sm"
            onClick={() =>
              setSettings({ sidebarCollapsed: !getSettings().sidebarCollapsed })
            }
            aria-expanded={!sidebarCollapsed}
            aria-label={
              sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'
            }
            title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {sidebarCollapsed ? '☰' : '☰'}
          </button>
          <div className="topbar__brand">Outline</div>
        </div>
        <div className="topbar__meta">
          {offline && <span className="topbar__offline">Offline</span>}
          <CommandPaletteTrigger onOpen={() => setPaletteOpen(true)} />
        </div>
      </header>
      <div className="app__body">
        {!sidebarCollapsed && isNarrow && (
          <button
            type="button"
            className="sidebar-backdrop"
            aria-label="Close notes navigation"
            onClick={() => setSettings({ sidebarCollapsed: true })}
          />
        )}
        <Sidebar
          days={displaySidebar}
          activeDate={activeDate}
          collapsed={sidebarCollapsed}
          onSelectDay={selectDay}
          onSelectItem={selectItem}
        />
        <main className="main">
          <h1 className="main__day">{formatDayLabel(activeDate)}</h1>
          <OutlineEditor
            key={`${activeDate}-${editorNonce}`}
            date={activeDate}
            document={activeDoc}
            enabled
            focusItemId={focusItemId}
            onFocusHandled={onFocusHandled}
            onSave={handleSave}
            onChange={handleChange}
          />
        </main>
      </div>
      {developerMode && (
        <DebugOverlay
          activeDate={activeDate}
          activeDoc={liveDoc}
          focusItemId={focusItemId}
          folderName={gate.folderName}
          offline={offline}
          editorNonce={editorNonce}
          sidebarDayCount={displaySidebar.length}
          docsCacheSize={docsCache.size}
        />
      )}
      <UpdateBanner />
      <ToastHost />
      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        folderName={gate.folderName}
        offline={offline}
        activeDoc={liveDoc}
        onInsertTestHierarchy={insertDummyHierarchy}
        onChangeFolder={openFolder}
        onOpenShortcuts={openShortcuts}
        onOpenSettings={openSettings}
        onExportMessage={onExportMessage}
      />
      <ShortcutsDialog
        open={shortcutsOpen}
        onClose={() => setShortcutsOpen(false)}
      />
      <SettingsDialog
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
      />
    </div>
  );
}
