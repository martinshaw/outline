import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  getSettings,
  setSettings,
  subscribeSettings,
} from '../settings/settingsStore';
import type { DayDocument } from '../types';
import {
  FORMAT_TEXT_EVENT,
  type FormatTextMode,
} from '../editor/plugins/FormatCommandPlugin';
import { OPEN_ITEM_META_EVENT } from '../editor/plugins/MetaAttributesPlugin';
import { notesClient } from '../storage/notesClient';
import {
  downloadExport,
  type ExportFormat,
  type ExportScope,
} from '../utils/export';

function runFormatText(mode: FormatTextMode): void {
  queueMicrotask(() => {
    window.dispatchEvent(
      new CustomEvent(FORMAT_TEXT_EVENT, { detail: { mode } }),
    );
  });
}

type Props = {
  open: boolean;
  onClose: () => void;
  folderName: string;
  offline: boolean;
  activeDoc: DayDocument;
  onInsertTestHierarchy: () => void;
  onChangeFolder: () => void;
  onOpenShortcuts: () => void;
  onOpenSettings: () => void;
  onOpenTasks: () => void;
  onOpenSearch: () => void;
  onShowEmptyHints: () => void;
  onExportMessage?: (message: string | null) => void;
};

export type Command = {
  id: string;
  group: string;
  label: string;
  hint?: string;
  keywords?: string;
  run: () => void;
};

const FORMATS: { format: ExportFormat; label: string }[] = [
  { format: 'json', label: 'JSON' },
  { format: 'yaml', label: 'YAML' },
  { format: 'markdown', label: 'Markdown' },
  { format: 'text', label: 'Text' },
  { format: 'html', label: 'HTML' },
];

const isMac =
  typeof navigator !== 'undefined' &&
  /Mac|iPhone|iPad|iPod/i.test(navigator.platform);
const mod = isMac ? '⌘' : 'Ctrl';
const alt = isMac ? '⌥' : 'Alt';

/** Rank a palette command against the filter query (higher is better). */
export function scoreCommand(query: string, command: Command): number {
  const q = query.trim().toLowerCase();
  if (!q) return 1;
  const hay = `${command.label} ${command.group} ${command.keywords ?? ''}`.toLowerCase();
  if (hay.startsWith(q)) return 100;
  if (command.label.toLowerCase().includes(q)) return 80;
  if (hay.includes(q)) return 50;
  const tokens = q.split(/\s+/).filter(Boolean);
  if (tokens.length > 1 && tokens.every((t) => hay.includes(t))) return 40;
  return 0;
}

/** Static metadata for the get-started tips command (tested + used in the palette). */
export const SHOW_EMPTY_HINTS_COMMAND = {
  id: 'empty-hints',
  group: 'Workspace',
  label: 'Show get started hints',
  keywords: 'onboarding tips help empty tutorial intro',
} as const;

function scrollCommandIntoView(list: HTMLElement, el: HTMLElement) {
  const group = el.closest('.command-palette__group');
  const label = group?.querySelector('.command-palette__group-label');
  const firstItem = group?.querySelector('.command-palette__item');
  const lead =
    firstItem === el && label instanceof HTMLElement ? label : el;

  const listTop = list.getBoundingClientRect().top;
  // Content Y relative to the list's scrollable origin.
  const leadTop =
    lead.getBoundingClientRect().top - listTop + list.scrollTop;
  const elBottom =
    el.getBoundingClientRect().bottom - listTop + list.scrollTop;
  const viewTop = list.scrollTop;
  const viewBottom = list.scrollTop + list.clientHeight;

  if (leadTop < viewTop) {
    list.scrollTop = leadTop;
  } else if (elBottom > viewBottom) {
    list.scrollTop = elBottom - list.clientHeight;
  }
}

export function CommandPalette({
  open,
  onClose,
  folderName,
  offline,
  activeDoc,
  onInsertTestHierarchy,
  onChangeFolder,
  onOpenShortcuts,
  onOpenSettings,
  onOpenTasks,
  onOpenSearch,
  onShowEmptyHints,
  onExportMessage,
}: Props) {
  const titleId = useId();
  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const keyboardNavRef = useRef(false);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const [developerMode, setDeveloperMode] = useState(
    () => getSettings().developerMode,
  );
  const [sidebarCollapsed, setSidebarCollapsed] = useState(
    () => getSettings().sidebarCollapsed,
  );

  useEffect(() => {
    return subscribeSettings((next) => {
      setDeveloperMode(next.developerMode);
      setSidebarCollapsed(next.sidebarCollapsed);
    });
  }, []);


  const runExport = useCallback(
    (scope: ExportScope, format: ExportFormat) => {
      void (async () => {
        const result = await downloadExport(
          activeDoc,
          scope,
          format,
          (path) => notesClient.readAttachment(path),
        );
        if (!result.ok) {
          onExportMessage?.(result.reason);
          return;
        }
        onExportMessage?.(null);
        onClose();
      })();
    },
    [activeDoc, onClose, onExportMessage],
  );

  const commands = useMemo<Command[]>(() => {
    const run = (fn: () => void): (() => void) => () => {
      fn();
      onClose();
    };

    const list: Command[] = [
      {
        id: 'toggle-sidebar',
        group: 'Workspace',
        label: sidebarCollapsed
          ? 'Show notes sidebar'
          : 'Hide notes sidebar',
        keywords: 'sidebar navigation drawer notes list',
        run: () => {
          setSettings({
            sidebarCollapsed: !getSettings().sidebarCollapsed,
          });
          onClose();
        },
      },
      {
        id: 'change-folder',
        group: 'Workspace',
        label: 'Change folder',
        keywords: 'directory workspace open',
        run: run(onChangeFolder),
      },
      ...(developerMode
        ? [
            {
              id: 'insert-test',
              group: 'Workspace',
              label: 'Insert test hierarchy',
              keywords: 'dummy fixture sample',
              run: run(onInsertTestHierarchy),
            } satisfies Command,
          ]
        : []),
      {
        id: 'tasks',
        group: 'Workspace',
        label: 'Manage tasks',
        hint: `${mod}${alt}T`,
        keywords: 'task subtask table filter status deadline board',
        run: run(onOpenTasks),
      },
      {
        id: 'search',
        group: 'Workspace',
        label: 'Search notes',
        hint: `${mod}${alt}F`,
        keywords: 'find full text query filter items blocks',
        run: run(onOpenSearch),
      },
      {
        id: 'shortcuts',
        group: 'Workspace',
        label: 'Keyboard shortcuts',
        hint: '?',
        keywords: 'help keymap',
        run: run(onOpenShortcuts),
      },
      {
        ...SHOW_EMPTY_HINTS_COMMAND,
        run: run(onShowEmptyHints),
      },
      {
        id: 'settings',
        group: 'Workspace',
        label: 'Settings',
        hint: `${mod}${alt},`,
        keywords: 'preferences theme font',
        run: run(onOpenSettings),
      },
      {
        id: 'edit-item-meta',
        group: 'Workspace',
        label: 'Edit deadline & entities',
        hint: `${mod}${alt}A`,
        keywords: 'attributes meta due date entities people links',
        run: () => {
          onClose();
          queueMicrotask(() => {
            window.dispatchEvent(new CustomEvent(OPEN_ITEM_META_EVENT));
          });
        },
      },
      {
        id: 'toggle-debug',
        group: 'Workspace',
        label: developerMode
          ? 'Hide developer panel'
          : 'Show developer panel',
        keywords: 'debug developer overlay inspect',
        run: () => {
          setSettings({ developerMode: !getSettings().developerMode });
          onClose();
        },
      },
      {
        id: 'format-bold',
        group: 'Formatting',
        label: 'Bold',
        hint: `${mod}B`,
        keywords: 'strong weight emphasis',
        run: () => {
          onClose();
          runFormatText('bold');
        },
      },
      {
        id: 'format-italic',
        group: 'Formatting',
        label: 'Italic',
        hint: `${mod}I`,
        keywords: 'emphasis oblique',
        run: () => {
          onClose();
          runFormatText('italic');
        },
      },
      {
        id: 'format-underline',
        group: 'Formatting',
        label: 'Underline',
        hint: `${mod}U`,
        keywords: 'underscore',
        run: () => {
          onClose();
          runFormatText('underline');
        },
      },
      {
        id: 'format-clear',
        group: 'Formatting',
        label: 'Clear text formatting',
        keywords: 'remove bold italic underline plain unstyled',
        run: () => {
          onClose();
          runFormatText('clear');
        },
      },
      {
        id: 'format-remove-link',
        group: 'Formatting',
        label: 'Remove link',
        keywords: 'unlink hyperlink url',
        run: () => {
          onClose();
          runFormatText('remove-link');
        },
      },
    ];

    for (const { format, label } of FORMATS) {
      list.push({
        id: `export-day-${format}`,
        group: 'Export day',
        label: `Export day as ${label}`,
        keywords: `download ${format} day`,
        run: () => runExport('day', format),
      });
    }
    for (const { format, label } of FORMATS) {
      list.push({
        id: `export-sel-${format}`,
        group: 'Export selection',
        label: `Export selection as ${label}`,
        keywords: `download ${format} items blocks selected`,
        run: () => runExport('selection', format),
      });
    }
    return list;
  }, [
    developerMode,
    onChangeFolder,
    onClose,
    onInsertTestHierarchy,
    onOpenSettings,
    onOpenShortcuts,
    onOpenTasks,
    onOpenSearch,
    onShowEmptyHints,
    runExport,
    sidebarCollapsed,
  ]);

  const filtered = useMemo(() => {
    const scored = commands
      .map((command, order) => ({
        command,
        score: scoreCommand(query, command),
        order,
      }))
      .filter((row) => row.score > 0)
      // Keep definition order on ties so flat indices match grouped render order.
      .sort((a, b) => b.score - a.score || a.order - b.order);
    return scored.map((row) => row.command);
  }, [commands, query]);

  const groups = useMemo(() => {
    const order: string[] = [];
    const map = new Map<string, Command[]>();
    for (const command of filtered) {
      if (!map.has(command.group)) {
        map.set(command.group, []);
        order.push(command.group);
      }
      map.get(command.group)!.push(command);
    }
    return order.map((group) => ({ group, items: map.get(group)! }));
  }, [filtered]);

  // Visual order (grouped). Must be what keyboard / Enter use — not a
  // separately sorted flat list that can diverge from the DOM.
  const visibleCommands = useMemo(
    () => groups.flatMap((g) => g.items),
    [groups],
  );

  useEffect(() => {
    if (!open) {
      setQuery('');
      setActiveIndex(0);
      return;
    }
    setActiveIndex(0);
    keyboardNavRef.current = false;
    const id = requestAnimationFrame(() => inputRef.current?.focus());
    return () => cancelAnimationFrame(id);
  }, [open]);

  useEffect(() => {
    setActiveIndex(0);
    keyboardNavRef.current = false;
  }, [query]);

  useEffect(() => {
    if (!open) return;
    if (activeIndex >= visibleCommands.length) {
      setActiveIndex(Math.max(0, visibleCommands.length - 1));
    }
  }, [activeIndex, open, visibleCommands.length]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        keyboardNavRef.current = true;
        setActiveIndex((i) =>
          visibleCommands.length === 0 ? 0 : (i + 1) % visibleCommands.length,
        );
        return;
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault();
        keyboardNavRef.current = true;
        setActiveIndex((i) =>
          visibleCommands.length === 0
            ? 0
            : (i - 1 + visibleCommands.length) % visibleCommands.length,
        );
        return;
      }
      if (event.key === 'Enter') {
        event.preventDefault();
        visibleCommands[activeIndex]?.run();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [activeIndex, onClose, open, visibleCommands]);

  useEffect(() => {
    if (!open || !keyboardNavRef.current) return;
    const id = visibleCommands[activeIndex]?.id;
    if (!id) return;
    const el = document.getElementById(`command-item-${id}`);
    const list = listRef.current;
    if (!(el instanceof HTMLElement) || !list) return;
    scrollCommandIntoView(list, el);
  }, [activeIndex, open, visibleCommands]);

  if (!open) return null;

  let flatIndex = -1;

  return (
    <div
      className="command-palette-overlay"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className="command-palette"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <h2 id={titleId} className="command-palette__sr-only">
          Command palette
        </h2>
        <div className="command-palette__search">
          <input
            ref={inputRef}
            type="search"
            className="command-palette__input"
            placeholder="Type a command…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={
              visibleCommands[activeIndex]
                ? `command-item-${visibleCommands[activeIndex].id}`
                : undefined
            }
            autoComplete="off"
            spellCheck={false}
          />
          <kbd className="command-palette__esc">esc</kbd>
        </div>
        <div
          ref={listRef}
          className="command-palette__list"
          id={listId}
          role="listbox"
        >
          {groups.length === 0 ? (
            <div className="command-palette__empty">No matching commands</div>
          ) : (
            groups.map(({ group, items }) => (
              <div key={group} className="command-palette__group" role="group">
                <div
                  className="command-palette__group-label"
                  title={
                    group === 'Workspace'
                      ? `${folderName}${offline ? ' · Offline' : ''}`
                      : group
                  }
                >
                  <span className="command-palette__group-name">{group}</span>
                  {group === 'Workspace' ? (
                    <span className="command-palette__group-caption">
                      {' '}
                      — {folderName}
                      {offline ? ' · Offline' : ''}
                    </span>
                  ) : null}
                </div>
                {items.map((command) => {
                  flatIndex += 1;
                  const index = flatIndex;
                  const active = index === activeIndex;
                  return (
                    <button
                      key={command.id}
                      id={`command-item-${command.id}`}
                      type="button"
                      role="option"
                      aria-selected={active}
                      className={
                        active
                          ? 'command-palette__item command-palette__item--active'
                          : 'command-palette__item'
                      }
                      onMouseMove={() => {
                        if (activeIndex === index) return;
                        keyboardNavRef.current = false;
                        setActiveIndex(index);
                      }}
                      onClick={() => command.run()}
                    >
                      <span className="command-palette__item-label">
                        {command.label}
                      </span>
                      {command.hint ? (
                        <kbd className="command-palette__item-hint">
                          {command.hint}
                        </kbd>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>
        <div className="command-palette__footer">
          <span>
            <kbd>↑</kbd>
            <kbd>↓</kbd> navigate
          </span>
          <span>
            <kbd>↵</kbd> run
          </span>
          <span>
            <kbd>{mod}</kbd>
            <kbd>P</kbd> toggle
          </span>
        </div>
      </div>
    </div>
  );
}
