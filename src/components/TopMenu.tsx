import { useEffect, useId, useRef, useState } from 'react';
import type { DayDocument } from '../types';
import {
  downloadExport,
  type ExportFormat,
  type ExportScope,
} from '../utils/export';

type Props = {
  folderName: string;
  offline: boolean;
  activeDoc: DayDocument;
  onInsertTestHierarchy: () => void;
  onChangeFolder: () => void;
  onOpenShortcuts: () => void;
  onOpenSettings: () => void;
  onExportMessage?: (message: string | null) => void;
};

const FORMATS: { format: ExportFormat; label: string }[] = [
  { format: 'json', label: 'JSON' },
  { format: 'yaml', label: 'YAML' },
  { format: 'markdown', label: 'Markdown' },
  { format: 'text', label: 'Text' },
  { format: 'html', label: 'HTML' },
];

export function TopMenu({
  folderName,
  offline,
  activeDoc,
  onInsertTestHierarchy,
  onChangeFolder,
  onOpenShortcuts,
  onOpenSettings,
  onExportMessage,
}: Props) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('mousedown', onPointer);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', onPointer);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const runExport = (scope: ExportScope, format: ExportFormat) => {
    const result = downloadExport(activeDoc, scope, format);
    if (!result.ok) {
      onExportMessage?.(result.reason);
    } else {
      onExportMessage?.(null);
      setOpen(false);
    }
  };

  return (
    <div className="top-menu" ref={rootRef}>
      <button
        type="button"
        className="btn btn--ghost btn--nav top-menu__trigger"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen((v) => !v)}
      >
        Menu
      </button>
      {open && (
        <div className="top-menu__panel" id={menuId} role="menu">
          <div className="top-menu__section">
            <div className="top-menu__label">Workspace</div>
            <div className="top-menu__meta" title={folderName}>
              {folderName}
              {offline ? ' · Offline' : ''}
            </div>
            <button
              type="button"
              className="btn btn--secondary btn--menu btn--block btn--spread"
              role="menuitem"
              onClick={() => {
                onChangeFolder();
                setOpen(false);
              }}
            >
              Change folder
            </button>
            <button
              type="button"
              className="btn btn--secondary btn--menu btn--block btn--spread"
              role="menuitem"
              onClick={() => {
                onInsertTestHierarchy();
                setOpen(false);
              }}
            >
              Insert test hierarchy
            </button>
            <button
              type="button"
              className="btn btn--secondary btn--menu btn--block btn--spread"
              role="menuitem"
              onClick={() => {
                onOpenShortcuts();
                setOpen(false);
              }}
            >
              Keyboard shortcuts
              <span className="top-menu__hint">?</span>
            </button>
            <button
              type="button"
              className="btn btn--secondary btn--menu btn--block btn--spread"
              role="menuitem"
              onClick={() => {
                onOpenSettings();
                setOpen(false);
              }}
            >
              Settings…
            </button>
          </div>

          <div className="top-menu__section">
            <div className="top-menu__label">Export day</div>
            <div className="top-menu__row">
              {FORMATS.map(({ format, label }) => (
                <button
                  key={`day-${format}`}
                  type="button"
                  className="btn btn--secondary btn--md"
                  role="menuitem"
                  onClick={() => runExport('day', format)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="top-menu__section">
            <div className="top-menu__label">Export selection</div>
            <div className="top-menu__row">
              {FORMATS.map(({ format, label }) => (
                <button
                  key={`sel-${format}`}
                  type="button"
                  className="btn btn--secondary btn--md"
                  role="menuitem"
                  onClick={() => runExport('selection', format)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
