import { useCallback, useEffect, useMemo, useState } from 'react';
import { OutlineEditor } from './editor/OutlineEditor';
import { Sidebar } from './sidebar/Sidebar';
import { DebugOverlay } from './components/DebugOverlay';
import { FolderGate } from './components/FolderGate';
import { SettingsDialog } from './components/SettingsDialog';
import { ShortcutsDialog } from './components/ShortcutsDialog';
import { ToastHost } from './components/ToastHost';
import { TopMenu } from './components/TopMenu';
import { showErrorToast } from './components/toastStore';
import {
  getSettings,
  setSettings,
  subscribeSettings,
} from './settings/settingsStore';
import {
  ensureReadWritePermission,
  loadStoredDirectoryHandle,
  pickNotesDirectory,
  supportsDirectoryPicker,
} from './storage/directory';
import { notesClient } from './storage/notesClient';
import {
  markSaveError,
  markSaveStart,
  markSaveSuccess,
} from './storage/saveDebugStore';
import type { DayDocument, SidebarDay } from './types';
import { emptyDayDocument, formatDayLabel, todayKey } from './utils/date';
import { createDummyHierarchy } from './utils/dummyHierarchy';
import { buildSidebarFromDocs, extractSidebarDay, isDayEmpty } from './utils/outline';

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
  const [docsCache, setDocsCache] = useState<Map<string, DayDocument>>(
    () => new Map(),
  );

  useEffect(() => {
    const onOnline = () => setOffline(false);
    const onOffline = () => setOffline(true);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  useEffect(() => {
    return subscribeSettings((next) => {
      setSidebarCollapsed(next.sidebarCollapsed);
    });
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing =
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable);
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
    const granted = await ensureReadWritePermission(handle);
    if (!granted) {
      setGate({ status: 'need-permission', handle });
      return;
    }
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
        const perm = await stored.queryPermission({ mode: 'readwrite' });
        if (perm === 'granted') {
          await bootstrapFolder(stored);
        } else {
          setGate({ status: 'need-permission', handle: stored });
        }
      } catch (e) {
        console.error(e);
        showErrorToast(e instanceof Error ? e.message : String(e));
        setGate({ status: 'need-folder' });
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
      const without = baseSidebar.filter((d) => d.date !== doc.date);
      if (isDayEmpty(doc)) {
        return without.sort((a, b) => (a.date < b.date ? 1 : -1));
      }
      return [...without, extractSidebarDay(doc)].sort((a, b) =>
        a.date < b.date ? 1 : -1,
      );
    },
    [],
  );

  const handleChange = useCallback(
    (doc: DayDocument) => {
      setDocsCache((prev) => {
        const next = new Map(prev);
        if (isDayEmpty(doc) && doc.date !== todayKey()) next.delete(doc.date);
        else next.set(doc.date, doc);
        return next;
      });
      setSidebar((prev) => mergeSidebar(doc, prev));
    },
    [mergeSidebar],
  );

  const handleSave = useCallback(
    async (doc: DayDocument) => {
      if (gate.status !== 'ready') return;
      markSaveStart(doc.date);
      try {
        const result = await notesClient.saveDay(doc);
        markSaveSuccess(doc.date, result.status);
        setSidebar(result.sidebar);
        setDocsCache((prev) => {
          const next = new Map(prev);
          if (result.status === 'deleted') next.delete(doc.date);
          else next.set(doc.date, doc);
          return next;
        });
      } catch (e) {
        console.error('Save failed', e);
        const msg = e instanceof Error ? e.message : String(e);
        markSaveError(doc.date, msg);
        showErrorToast(msg);
      }
    },
    [gate],
  );

  const selectDay = async (date: string) => {
    if (date === activeDate) return;
    // Flush current via cache; disk already debounced
    const cached = docsCache.get(date);
    if (cached) {
      setActiveDate(date);
      setActiveDoc(cached);
      return;
    }
    try {
      const fromDisk = await notesClient.loadDay(date);
      const doc = fromDisk ?? emptyDayDocument(date);
      setDocsCache((prev) => new Map(prev).set(date, doc));
      setActiveDate(date);
      setActiveDoc(doc);
    } catch (e) {
      showErrorToast(e instanceof Error ? e.message : String(e));
    }
  };

  const selectItem = async (date: string, itemId: string) => {
    if (date !== activeDate) {
      await selectDay(date);
    }
    setFocusItemId(itemId);
  };

  const insertDummyHierarchy = () => {
    const doc = createDummyHierarchy(activeDate);
    setActiveDoc(doc);
    setDocsCache((prev) => new Map(prev).set(activeDate, doc));
    setSidebar((prev) => mergeSidebar(doc, prev));
    setEditorNonce((n) => n + 1);
    void handleSave(doc);
  };

  // Ensure today appears selectable even if empty (in editor only; sidebar omits empty)
  const displaySidebar = useMemo(() => {
    // Prefer live sidebar; if cache has more days rebuild
    if (sidebar.length > 0) return sidebar;
    return buildSidebarFromDocs([...docsCache.values()]);
  }, [sidebar, docsCache]);

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
            className="topbar__sidebar-btn"
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
          <TopMenu
            folderName={gate.folderName}
            offline={offline}
            activeDoc={activeDoc}
            onInsertTestHierarchy={insertDummyHierarchy}
            onChangeFolder={openFolder}
            onOpenShortcuts={() => setShortcutsOpen(true)}
            onOpenSettings={() => setSettingsOpen(true)}
            onExportMessage={(msg) => {
              if (msg) showErrorToast(msg);
            }}
          />
        </div>
      </header>
      <div className="app__body">
        <Sidebar
          days={displaySidebar}
          activeDate={activeDate}
          collapsed={sidebarCollapsed}
          onSelectDay={(d) => void selectDay(d)}
          onSelectItem={(d, id) => void selectItem(d, id)}
        />
        <main className="main">
          <h1 className="main__day">{formatDayLabel(activeDate)}</h1>
          <OutlineEditor
            key={`${activeDate}-${editorNonce}`}
            date={activeDate}
            document={activeDoc}
            enabled
            focusItemId={focusItemId}
            onFocusHandled={() => setFocusItemId(null)}
            onSave={handleSave}
            onChange={handleChange}
          />
        </main>
      </div>
      <DebugOverlay
        activeDate={activeDate}
        activeDoc={activeDoc}
        focusItemId={focusItemId}
        folderName={gate.folderName}
        offline={offline}
        editorNonce={editorNonce}
        sidebarDayCount={displaySidebar.length}
      />
      <ToastHost />
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
