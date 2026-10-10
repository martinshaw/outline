import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { OutlineEditor } from './editor/OutlineEditor';
import { Sidebar } from './sidebar/Sidebar';
import { DebugOverlay } from './components/DebugOverlay';
import { FolderGate } from './components/FolderGate';
import { AppHints } from './components/AppHints';
import { CommandPalette } from './components/CommandPalette';
import { SettingsDialog } from './components/SettingsDialog';
import { SearchDialog } from './components/SearchDialog';
import { ShortcutsDialog } from './components/ShortcutsDialog';
import { TasksDialog } from './components/TasksDialog';
import { ToastHost } from './components/ToastHost';
import { UpdateBanner } from './components/UpdateBanner';
import { showErrorToast } from './components/toastStore';
import { setPwaUiBlocking } from './pwa/updateStore';
import { NotesSearchIndex } from './search/notesIndex';
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
import { fireTaskCompleteConfetti } from './utils/confetti';
import {
  countSubtaskProgress,
  didCompleteAllSubtasks,
  findOwningTask,
} from './utils/subtaskCompletion';
import { setItemStatusInDocument } from './utils/taskIndex';

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
  const [tasksOpen, setTasksOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [developerMode, setDeveloperMode] = useState(
    () => getSettings().developerMode,
  );
  const [docsCache, setDocsCache] = useState<Map<string, DayDocument>>(
    () => new Map(),
  );
  const [searchIndexRevision, setSearchIndexRevision] = useState(0);
  const [isNarrow, setIsNarrow] = useState(
    () =>
      typeof window !== 'undefined' &&
      window.matchMedia('(max-width: 768px)').matches,
  );
  const docsCacheRef = useRef(docsCache);
  const activeDateRef = useRef(activeDate);
  const isNarrowRef = useRef(isNarrow);
  const searchOpenRef = useRef(false);
  const searchIndexRef = useRef(new NotesSearchIndex());
  docsCacheRef.current = docsCache;
  activeDateRef.current = activeDate;
  isNarrowRef.current = isNarrow;

  const bumpSearchIndex = useCallback(() => {
    setSearchIndexRevision((n) => n + 1);
  }, []);

  const syncSearchDay = useCallback(
    (doc: DayDocument) => {
      if (isDayEmpty(doc)) searchIndexRef.current.removeDay(doc.date);
      else searchIndexRef.current.upsertDay(doc);
      // Avoid re-rendering the app on every keystroke when search is closed.
      if (searchOpenRef.current) bumpSearchIndex();
    },
    [bumpSearchIndex],
  );

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
    setPwaUiBlocking(
      paletteOpen ||
        settingsOpen ||
        shortcutsOpen ||
        tasksOpen ||
        searchOpen,
    );
  }, [paletteOpen, settingsOpen, shortcutsOpen, tasksOpen, searchOpen]);

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
        return;
      }

      // ⌘⌥, / Ctrl+Alt+, — use code: modifiers can rewrite event.key.
      if (
        event.code === 'Comma' &&
        (event.metaKey || event.ctrlKey) &&
        event.altKey &&
        !event.shiftKey
      ) {
        event.preventDefault();
        setSettingsOpen((open) => !open);
        return;
      }

      // ⌘⌥T / Ctrl+Alt+T — avoid browser ⌘⇧T (reopen tab) and ⌘⇧K (console).
      // Use code: on macOS ⌥ alone can rewrite event.key (e.g. †).
      if (
        event.code === 'KeyT' &&
        (event.metaKey || event.ctrlKey) &&
        event.altKey &&
        !event.shiftKey
      ) {
        event.preventDefault();
        setTasksOpen((open) => !open);
        return;
      }

      // ⌘⌥F / Ctrl+Alt+F — search all notes (not browser page-find ⌘F).
      if (
        event.code === 'KeyF' &&
        (event.metaKey || event.ctrlKey) &&
        event.altKey &&
        !event.shiftKey
      ) {
        event.preventDefault();
        setSearchOpen((open) => {
          const next = !open;
          searchOpenRef.current = next;
          if (next) bumpSearchIndex();
          return next;
        });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [bumpSearchIndex]);

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
    setFocusItemId(null);
    // Remount the editor even when the date is unchanged — otherwise
    // LoadDocumentPlugin keeps the previous folder's Lexical state.
    setEditorNonce((n) => n + 1);
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

    // Chunked FTS rebuild so large workspaces stay responsive.
    void searchIndexRef.current.rebuildAsync(index.docs).then(() => {
      bumpSearchIndex();
      const stats = searchIndexRef.current.getStats();
      debugLog(
        'info',
        'search',
        'index ready',
        `${stats.documents} blocks · ${stats.terms} terms · ${stats.days} days`,
      );
    });
  }, [bumpSearchIndex]);

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
      syncSearchDay(doc);
    },
    [mergeSidebar, syncSearchDay],
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
        if (result.status === 'deleted') {
          searchIndexRef.current.removeDay(doc.date);
          bumpSearchIndex();
        } else {
          syncSearchDay(doc);
        }
      } catch (e) {
        console.error('Save failed', e);
        const msg = e instanceof Error ? e.message : String(e);
        if (debugOn) markSaveError(doc.date, msg);
        showErrorToast(msg);
      }
    },
    [bumpSearchIndex, gate, mergeSidebar, syncSearchDay],
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
        syncSearchDay(doc);
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
    [collapseSidebarIfNarrow, syncSearchDay],
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
    syncSearchDay(doc);
    setEditorNonce((n) => n + 1);
    debugLog('info', 'dev', 'inserted test hierarchy', doc.date);
    void handleSave(doc);
  }, [handleSave, mergeSidebar, syncSearchDay]);

  const openShortcuts = useCallback(() => setShortcutsOpen(true), []);
  const openSettings = useCallback(() => setSettingsOpen(true), []);
  const openTasks = useCallback(() => setTasksOpen(true), []);
  const openSearch = useCallback(() => {
    searchOpenRef.current = true;
    bumpSearchIndex();
    setSearchOpen(true);
  }, [bumpSearchIndex]);
  const onExportMessage = useCallback((msg: string | null) => {
    if (msg) showErrorToast(msg);
  }, []);
  const onFocusHandled = useCallback(() => setFocusItemId(null), []);

  const changeTaskStatuses = useCallback(
    async (
      updates: readonly { date: string; itemId: string; status: string }[],
    ) => {
      if (updates.length === 0) return;

      const byDate = new Map<string, { itemId: string; status: string }[]>();
      for (const u of updates) {
        const list = byDate.get(u.date);
        if (list) list.push({ itemId: u.itemId, status: u.status });
        else byDate.set(u.date, [{ itemId: u.itemId, status: u.status }]);
      }

      const saves: Promise<void>[] = [];
      let touchActive = false;
      let celebrate = false;

      for (const [date, dayUpdates] of byDate) {
        let doc = docsCacheRef.current.get(date);
        if (!doc) continue;
        let next: DayDocument | null = doc;
        for (const { itemId, status } of dayUpdates) {
          const owning = findOwningTask(next.items, itemId);
          const before = owning ? countSubtaskProgress(owning) : null;
          const updated = setItemStatusInDocument(next, itemId, status);
          if (updated) {
            next = updated;
            if (before && owning) {
              const afterTask = findOwningTask(next.items, itemId);
              if (
                afterTask &&
                didCompleteAllSubtasks(before, countSubtaskProgress(afterTask))
              ) {
                celebrate = true;
              }
            }
          }
        }
        if (!next || next === doc) continue;

        const saved = next;
        setDocsCache((prev) => new Map(prev).set(date, saved));
        setSidebar((prev) => mergeSidebar(saved, prev));
        syncSearchDay(saved);
        if (date === activeDateRef.current) {
          setActiveDoc(saved);
          touchActive = true;
        }
        debugLog(
          'info',
          'tasks',
          'status',
          `${dayUpdates.length} item(s) on ${date}`,
        );
        saves.push(handleSave(saved));
      }

      if (touchActive) setEditorNonce((n) => n + 1);
      if (celebrate) window.setTimeout(() => fireTaskCompleteConfetti(), 0);
      await Promise.all(saves);
    },
    [handleSave, mergeSidebar, syncSearchDay],
  );

  const changeTaskStatus = useCallback(
    async (date: string, itemId: string, status: string) => {
      await changeTaskStatuses([{ date, itemId, status }]);
    },
    [changeTaskStatuses],
  );

  // Prefer live sidebar; if empty, derive from cache once.
  const displaySidebar = useMemo(() => {
    if (sidebar.length > 0) return sidebar;
    return buildSidebarFromDocs([...docsCache.values()]);
  }, [sidebar, docsCache]);

  const taskDocs = useMemo(
    () => [...docsCache.values()],
    [docsCache],
  );

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
      <AppHints
        onOpenPalette={() => setPaletteOpen(true)}
        onOpenShortcuts={openShortcuts}
        onOpenSettings={openSettings}
        onOpenTasks={openTasks}
        onOpenSearch={openSearch}
      />
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
            enabled={!busy}
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
        onOpenTasks={openTasks}
        onOpenSearch={openSearch}
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
      <TasksDialog
        open={tasksOpen}
        onClose={() => setTasksOpen(false)}
        docs={taskDocs}
        onSelectItem={selectItem}
        onChangeStatus={changeTaskStatus}
        onChangeStatuses={changeTaskStatuses}
      />
      <SearchDialog
        open={searchOpen}
        onClose={() => {
          searchOpenRef.current = false;
          setSearchOpen(false);
        }}
        index={searchIndexRef.current}
        indexRevision={searchIndexRevision}
        onSelectItem={selectItem}
      />
    </div>
  );
}
