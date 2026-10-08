export type FontId =
  | 'source-serif'
  | 'literata'
  | 'georgia'
  | 'ibm-plex-sans'
  | 'system-sans'
  | 'ibm-plex-mono'
  | 'jetbrains-mono';

export type ThemeId = 'system' | 'light' | 'dark';

export type BackupMode = 'on-next-day-write' | 'off';

export type StatusDef = {
  id: string;
  label: string;
  color: string;
};

/** Editor font size in rem. Default sits in the middle of the slider range. */
export const FONT_SIZE_MIN = 0.7;
export const FONT_SIZE_MAX = 1.4;
export const FONT_SIZE_STEP = 0.05;
export const FONT_SIZE_DEFAULT = 1.05;

export const DEFAULT_STATUSES: StatusDef[] = [
  { id: 'backlog', label: 'Backlog', color: '#6b7280' },
  { id: 'todo', label: 'To do', color: '#3b82f6' },
  { id: 'in-progress', label: 'In progress', color: '#d97706' },
  { id: 'done', label: 'Done', color: '#16a34a' },
  { id: 'archived', label: 'Archived', color: '#9ca3af' },
];

export type AppSettings = {
  version: 1;
  font: FontId;
  /**
   * When set, overrides the preset `font` with a system font family from
   * the Local Font Access API.
   */
  systemFontFamily: string | null;
  /** Editor font size in rem (see FONT_SIZE_* constants). */
  fontSize: number;
  theme: ThemeId;
  /** Whether the notes sidebar starts collapsed. */
  sidebarCollapsed: boolean;
  /** Configurable project/task statuses (chips + ⌘Enter cycle). */
  statuses: StatusDef[];
  backupMode: BackupMode;
  /** Sibling directory name under the workspace root (letters, numbers, hyphens). */
  backupDirectory: string;
  /** Debounced autosave delay in milliseconds. */
  saveDebounceMs: number;
  /**
   * When true, show the on-screen developer panel and collect debug logs.
   * Off by default (Safari Develop-menu style).
   */
  developerMode: boolean;
};

export const FONT_OPTIONS: {
  id: FontId;
  label: string;
  css: string;
}[] = [
  {
    id: 'source-serif',
    label: 'Source Serif 4',
    css: "'Source Serif 4', Georgia, serif",
  },
  {
    id: 'literata',
    label: 'Literata',
    css: "'Literata', Georgia, serif",
  },
  {
    id: 'georgia',
    label: 'Georgia',
    css: 'Georgia, "Times New Roman", serif',
  },
  {
    id: 'ibm-plex-sans',
    label: 'IBM Plex Sans',
    css: "'IBM Plex Sans', system-ui, sans-serif",
  },
  {
    id: 'system-sans',
    label: 'System sans',
    css: 'system-ui, -apple-system, "Segoe UI", sans-serif',
  },
  {
    id: 'ibm-plex-mono',
    label: 'IBM Plex Mono',
    css: "'IBM Plex Mono', ui-monospace, monospace",
  },
  {
    id: 'jetbrains-mono',
    label: 'JetBrains Mono',
    css: "'JetBrains Mono', ui-monospace, monospace",
  },
];

export const THEME_OPTIONS: { id: ThemeId; label: string }[] = [
  { id: 'system', label: 'System' },
  { id: 'light', label: 'Light' },
  { id: 'dark', label: 'Dark' },
];

export const BACKUP_MODE_OPTIONS: {
  id: BackupMode;
  label: string;
  description: string;
}[] = [
  {
    id: 'on-next-day-write',
    label: 'On next day’s first write',
    description:
      'Notes edited on a calendar day are copied into the backup folder the first time you write today’s note.',
  },
  {
    id: 'off',
    label: 'Off',
    description: 'Do not create backup snapshots. Change log is not updated.',
  },
];

export const SAVE_DEBOUNCE_OPTIONS: { ms: number; label: string }[] = [
  { ms: 250, label: 'Fast (250 ms)' },
  { ms: 400, label: 'Default (400 ms)' },
  { ms: 800, label: 'Relaxed (800 ms)' },
  { ms: 1500, label: 'Slow (1.5 s)' },
];

export const DEFAULT_SETTINGS: AppSettings = {
  version: 1,
  font: 'source-serif',
  systemFontFamily: null,
  fontSize: FONT_SIZE_DEFAULT,
  theme: 'system',
  sidebarCollapsed: true,
  statuses: DEFAULT_STATUSES.map((s) => ({ ...s })),
  backupMode: 'on-next-day-write',
  backupDirectory: 'backups',
  saveDebounceMs: 400,
  developerMode: false,
};
