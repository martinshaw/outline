import { useEffect, useId, useRef, useState } from 'react';
import {
  listLocalFontFamilies,
  supportsLocalFonts,
} from '../settings/localFonts';
import {
  getSettings,
  resetSettings,
  sanitizeBackupDirectory,
  setSettings,
  subscribeSettings,
} from '../settings/settingsStore';
import {
  BACKUP_MODE_OPTIONS,
  DEFAULT_STATUSES,
  FONT_SIZE_DEFAULT,
  FONT_SIZE_MAX,
  FONT_SIZE_MIN,
  FONT_SIZE_STEP,
  SAVE_DEBOUNCE_OPTIONS,
  THEME_OPTIONS,
  type AppSettings,
  type BackupMode,
  type StatusDef,
  type ThemeId,
} from '../settings/types';
import { FontPicker, type FontPickerValue } from './FontPicker';

type Props = {
  open: boolean;
  onClose: () => void;
};

type SettingsSectionId =
  | 'editor'
  | 'appearance'
  | 'statuses'
  | 'backups'
  | 'saving'
  | 'developer';

const SECTIONS: { id: SettingsSectionId; label: string }[] = [
  { id: 'editor', label: 'Editor' },
  { id: 'appearance', label: 'Appearance' },
  { id: 'statuses', label: 'Statuses' },
  { id: 'backups', label: 'Backups' },
  { id: 'saving', label: 'Saving' },
  { id: 'developer', label: 'Developer' },
];

function fontPickerValue(settings: AppSettings): FontPickerValue {
  if (settings.systemFontFamily) {
    return { kind: 'local', family: settings.systemFontFamily };
  }
  return { kind: 'preset', font: settings.font };
}

export function SettingsDialog({ open, onClose }: Props) {
  const titleId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);
  const onCloseRef = useRef(onClose);
  const wasOpenRef = useRef(false);
  const [settings, setLocal] = useState<AppSettings>(() => getSettings());
  const [backupDirDraft, setBackupDirDraft] = useState(settings.backupDirectory);
  const [localFamilies, setLocalFamilies] = useState<string[]>([]);
  const [localStatus, setLocalStatus] = useState<string | null>(null);
  const [localBusy, setLocalBusy] = useState(false);
  const [section, setSection] = useState<SettingsSectionId>('editor');

  const localFontsOk = supportsLocalFonts();
  const sectionLabel =
    SECTIONS.find((s) => s.id === section)?.label ?? 'Settings';

  onCloseRef.current = onClose;

  useEffect(() => {
    return subscribeSettings((next) => {
      setLocal(next);
      setBackupDirDraft(next.backupDirectory);
    });
  }, []);

  useEffect(() => {
    if (!open) {
      wasOpenRef.current = false;
      return;
    }

    // Only reset tab/focus when the dialog opens — not when parent re-renders
    // after a setting change (onClose identity often changes every render).
    if (!wasOpenRef.current) {
      wasOpenRef.current = true;
      const latest = getSettings();
      setLocal(latest);
      setBackupDirDraft(latest.backupDirectory);
      setLocalStatus(null);
      setSection('editor');
      closeRef.current?.focus();
    }

    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onCloseRef.current();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [open]);

  if (!open) return null;

  const backupMeta = BACKUP_MODE_OPTIONS.find((o) => o.id === settings.backupMode);

  const commitBackupDir = () => {
    const next = sanitizeBackupDirectory(backupDirDraft);
    setBackupDirDraft(next);
    if (next !== settings.backupDirectory) {
      setSettings({ backupDirectory: next });
    }
  };

  const loadSystemFonts = async () => {
    if (!localFontsOk) {
      setLocalStatus('System fonts require desktop Chrome or Edge.');
      return;
    }
    setLocalBusy(true);
    setLocalStatus(null);
    try {
      const families = await listLocalFontFamilies();
      setLocalFamilies(families);
      if (families.length === 0) {
        setLocalStatus('No local fonts were returned.');
      } else {
        setLocalStatus(
          `${families.length} system fonts added — pick one from the list.`,
        );
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setLocalStatus(
        msg.includes('NotAllowed') || msg.includes('denied')
          ? 'Permission to read local fonts was denied.'
          : msg,
      );
    } finally {
      setLocalBusy(false);
    }
  };

  const onFontPicked = (next: FontPickerValue) => {
    if (next.kind === 'preset') {
      setSettings({ font: next.font, systemFontFamily: null });
      return;
    }
    setSettings({ systemFontFamily: next.family });
  };

  const updateStatus = (index: number, patch: Partial<StatusDef>) => {
    const next = settings.statuses.map((s, i) =>
      i === index ? { ...s, ...patch } : s,
    );
    setSettings({ statuses: next });
  };

  const removeStatus = (index: number) => {
    if (settings.statuses.length <= 1) return;
    setSettings({
      statuses: settings.statuses.filter((_, i) => i !== index),
    });
  };

  const addStatus = () => {
    const n = settings.statuses.length + 1;
    setSettings({
      statuses: [
        ...settings.statuses,
        { id: `status-${n}`, label: `Status ${n}`, color: '#6b7280' },
      ],
    });
  };

  return (
    <div className="settings-overlay" role="presentation" onMouseDown={onClose}>
      <div
        className="settings-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <header className="settings-dialog__header">
          <h2 id={titleId} className="settings-dialog__title">
            Settings
          </h2>
          <button
            ref={closeRef}
            type="button"
            className="btn btn--ghost btn--icon"
            aria-label="Close"
            onClick={onClose}
          >
            ×
          </button>
        </header>

        <div className="settings-dialog__layout">
          <nav className="settings-nav" aria-label="Settings sections">
            <ul className="settings-nav__list">
              {SECTIONS.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    className={
                      section === item.id
                        ? 'btn btn--ghost btn--rail btn--block btn--start btn--active'
                        : 'btn btn--ghost btn--rail btn--block btn--start'
                    }
                    aria-current={section === item.id ? 'page' : undefined}
                    onClick={() => setSection(item.id)}
                  >
                    {item.label}
                  </button>
                </li>
              ))}
            </ul>
            <button
              type="button"
              className="btn btn--danger btn--sm btn--block btn--start"
              onClick={() => {
                resetSettings();
                setLocalFamilies([]);
                setLocalStatus(null);
              }}
            >
              Reset to defaults
            </button>
          </nav>

          <div className="settings-dialog__panel">
            <h3 className="settings-dialog__panel-title">{sectionLabel}</h3>

            {section === 'editor' && (
              <section className="settings-section" aria-label="Editor">
                <div className="settings-field">
                  <span className="settings-field__label">Font</span>
                  <FontPicker
                    value={fontPickerValue(settings)}
                    localFamilies={localFamilies}
                    localFontsOk={localFontsOk}
                    localBusy={localBusy}
                    onChange={onFontPicked}
                    onAddSystemFonts={() => void loadSystemFonts()}
                  />
                  <p className="settings-field__hint">
                    {localFontsOk
                      ? 'Type to search. Choose Add system fonts… to grant access and list installed fonts.'
                      : 'Built-in fonts only — Local Font Access needs desktop Chrome or Edge.'}
                  </p>
                  {localStatus && (
                    <p className="settings-field__hint" role="status">
                      {localStatus}
                    </p>
                  )}
                </div>

                <label className="settings-field">
                  <span className="settings-field__label">
                    Size
                    <span className="settings-field__value">
                      {settings.fontSize.toFixed(2)}rem
                      {settings.fontSize === FONT_SIZE_DEFAULT
                        ? ' · default'
                        : ''}
                    </span>
                  </span>
                  <input
                    className="settings-field__slider"
                    type="range"
                    min={FONT_SIZE_MIN}
                    max={FONT_SIZE_MAX}
                    step={FONT_SIZE_STEP}
                    value={settings.fontSize}
                    onChange={(e) =>
                      setSettings({ fontSize: Number(e.target.value) })
                    }
                  />
                  <span className="settings-field__slider-ends" aria-hidden="true">
                    <span>Smaller</span>
                    <span>Larger</span>
                  </span>
                </label>

                <p
                  className="settings-preview"
                  style={{
                    fontFamily: 'var(--editor-font-family)',
                    fontSize: 'var(--editor-font-size)',
                  }}
                >
                  The quick brown fox jumps over the lazy dog.
                </p>
              </section>
            )}

            {section === 'appearance' && (
              <section className="settings-section" aria-label="Appearance">
                <label className="settings-field">
                  <span className="settings-field__label">Theme</span>
                  <select
                    className="settings-field__control"
                    value={settings.theme}
                    onChange={(e) =>
                      setSettings({ theme: e.target.value as ThemeId })
                    }
                  >
                    {THEME_OPTIONS.map((opt) => (
                      <option key={opt.id} value={opt.id}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="settings-field settings-field--row">
                  <span className="settings-field__label">Collapse sidebar</span>
                  <input
                    type="checkbox"
                    className="settings-field__checkbox"
                    checked={settings.sidebarCollapsed}
                    onChange={(e) =>
                      setSettings({ sidebarCollapsed: e.target.checked })
                    }
                  />
                </label>
              </section>
            )}

            {section === 'statuses' && (
              <section className="settings-section" aria-label="Statuses">
                <p className="settings-field__hint">
                  Used for project and task chips. ⌘/Ctrl+Enter cycles through
                  this list. First status is the default for new projects/tasks.
                </p>
                <ul className="settings-status-list">
                  {settings.statuses.map((status, index) => (
                    <li key={status.id} className="settings-status-row">
                      <input
                        type="color"
                        className="settings-status-row__color"
                        value={
                          /^#[0-9a-fA-F]{6}$/.test(status.color)
                            ? status.color
                            : '#6b7280'
                        }
                        aria-label={`Color for ${status.label}`}
                        onChange={(e) =>
                          updateStatus(index, { color: e.target.value })
                        }
                      />
                      <input
                        className="settings-field__control settings-status-row__label"
                        type="text"
                        value={status.label}
                        aria-label="Status label"
                        onChange={(e) =>
                          updateStatus(index, { label: e.target.value })
                        }
                      />
                      <button
                        type="button"
                        className="btn btn--danger btn--icon-sm"
                        disabled={settings.statuses.length <= 1}
                        aria-label={`Remove ${status.label}`}
                        onClick={() => removeStatus(index)}
                      >
                        ×
                      </button>
                    </li>
                  ))}
                </ul>
                <div className="settings-status-actions">
                  <button
                    type="button"
                    className="btn btn--secondary btn--md"
                    onClick={addStatus}
                  >
                    Add status
                  </button>
                  <button
                    type="button"
                    className="btn btn--secondary btn--md"
                    onClick={() =>
                      setSettings({
                        statuses: DEFAULT_STATUSES.map((s) => ({ ...s })),
                      })
                    }
                  >
                    Reset list
                  </button>
                </div>
              </section>
            )}

            {section === 'backups' && (
              <section className="settings-section" aria-label="Backups">
                <label className="settings-field">
                  <span className="settings-field__label">When to backup</span>
                  <select
                    className="settings-field__control"
                    value={settings.backupMode}
                    onChange={(e) =>
                      setSettings({
                        backupMode: e.target.value as BackupMode,
                      })
                    }
                  >
                    {BACKUP_MODE_OPTIONS.map((opt) => (
                      <option key={opt.id} value={opt.id}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </label>
                {backupMeta && (
                  <p className="settings-field__hint">{backupMeta.description}</p>
                )}

                <label className="settings-field">
                  <span className="settings-field__label">Backup folder name</span>
                  <input
                    className="settings-field__control"
                    type="text"
                    value={backupDirDraft}
                    disabled={settings.backupMode === 'off'}
                    spellCheck={false}
                    autoComplete="off"
                    onChange={(e) => setBackupDirDraft(e.target.value)}
                    onBlur={commitBackupDir}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        commitBackupDir();
                      }
                    }}
                  />
                </label>
                <p className="settings-field__hint">
                  Sibling of <code>notes/</code> in your workspace folder. Letters,
                  numbers, dots, underscores, and hyphens only.
                </p>
              </section>
            )}

            {section === 'saving' && (
              <section className="settings-section" aria-label="Saving">
                <label className="settings-field">
                  <span className="settings-field__label">Autosave delay</span>
                  <select
                    className="settings-field__control"
                    value={settings.saveDebounceMs}
                    onChange={(e) =>
                      setSettings({ saveDebounceMs: Number(e.target.value) })
                    }
                  >
                    {SAVE_DEBOUNCE_OPTIONS.map((opt) => (
                      <option key={opt.ms} value={opt.ms}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </label>
              </section>
            )}

            {section === 'developer' && (
              <section
                className="settings-section settings-section--with-footer"
                aria-label="Developer"
              >
                <div className="settings-section__body">
                  <p className="settings-field__hint">
                    Tools for diagnosing saves, selection, and editor
                    performance. Nothing is collected or shown until you turn
                    the panel on — similar to Safari’s Develop menu.
                  </p>
                  <p className="settings-field__hint">
                    When enabled, a panel appears at the bottom-right with live
                    stats and an event log (saves, navigation, network, editor
                    updates). Turn it off to stop logging and hide the panel.
                  </p>
                </div>
                <label className="settings-field settings-field--row settings-field--footer">
                  <span className="settings-field__label">
                    Show developer panel
                  </span>
                  <input
                    type="checkbox"
                    className="settings-field__checkbox"
                    checked={settings.developerMode}
                    onChange={(e) =>
                      setSettings({ developerMode: e.target.checked })
                    }
                  />
                </label>
              </section>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
