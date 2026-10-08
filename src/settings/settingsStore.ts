import {
  ensureLocalFontLoaded,
  localFontCss,
} from './localFonts';
import {
  DEFAULT_SETTINGS,
  FONT_OPTIONS,
  FONT_SIZE_DEFAULT,
  FONT_SIZE_MAX,
  FONT_SIZE_MIN,
  FONT_SIZE_STEP,
  type AppSettings,
  type BackupMode,
  type FontId,
  type ThemeId,
} from './types';

const LEGACY_STORAGE_KEY = 'outline.settings.v1';

/** Migrate legacy named sizes from earlier settings versions. */
const LEGACY_FONT_SIZE: Record<string, number> = {
  sm: 0.95,
  md: FONT_SIZE_DEFAULT,
  lg: 1.2,
  xl: 1.35,
};

type Listener = (settings: AppSettings) => void;
type PersistFn = (settings: AppSettings) => Promise<void>;

let current: AppSettings = { ...DEFAULT_SETTINGS };
const listeners = new Set<Listener>();
let persistFn: PersistFn | null = null;
let persistTimer: ReturnType<typeof setTimeout> | null = null;

function isFontId(v: unknown): v is FontId {
  return FONT_OPTIONS.some((o) => o.id === v);
}

function isThemeId(v: unknown): v is ThemeId {
  return v === 'system' || v === 'light' || v === 'dark';
}

function isBackupMode(v: unknown): v is BackupMode {
  return v === 'on-next-day-write' || v === 'off';
}

/** Safe subdirectory name for File System Access. */
export function sanitizeBackupDirectory(name: string): string {
  const cleaned = name
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
  return cleaned || DEFAULT_SETTINGS.backupDirectory;
}

function normalizeSystemFontFamily(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value !== 'string') return null;
  const trimmed = value.trim().slice(0, 120);
  return trimmed || null;
}

export function clampFontSize(value: number): number {
  const stepped = Math.round(value / FONT_SIZE_STEP) * FONT_SIZE_STEP;
  const clamped = Math.min(FONT_SIZE_MAX, Math.max(FONT_SIZE_MIN, stepped));
  return Math.round(clamped * 100) / 100;
}

function normalizeFontSize(value: unknown): number {
  if (typeof value === 'string' && value in LEGACY_FONT_SIZE) {
    return LEGACY_FONT_SIZE[value];
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return clampFontSize(value);
  }
  return FONT_SIZE_DEFAULT;
}

export function normalizeSettings(
  partial: Partial<AppSettings> | null | undefined,
): AppSettings {
  const base = { ...DEFAULT_SETTINGS };
  if (!partial || typeof partial !== 'object') return base;

  if (isFontId(partial.font)) base.font = partial.font;
  if ('systemFontFamily' in partial) {
    base.systemFontFamily = normalizeSystemFontFamily(partial.systemFontFamily);
  }
  if ('fontSize' in partial) base.fontSize = normalizeFontSize(partial.fontSize);
  if (isThemeId(partial.theme)) base.theme = partial.theme;
  if (typeof partial.sidebarCollapsed === 'boolean') {
    base.sidebarCollapsed = partial.sidebarCollapsed;
  }
  if (isBackupMode(partial.backupMode)) base.backupMode = partial.backupMode;
  if (typeof partial.backupDirectory === 'string') {
    base.backupDirectory = sanitizeBackupDirectory(partial.backupDirectory);
  }
  if (
    typeof partial.saveDebounceMs === 'number' &&
    Number.isFinite(partial.saveDebounceMs) &&
    partial.saveDebounceMs >= 100 &&
    partial.saveDebounceMs <= 5000
  ) {
    base.saveDebounceMs = Math.round(partial.saveDebounceMs);
  }
  return base;
}

function clearLegacyBrowserStorage(): void {
  try {
    localStorage.removeItem(LEGACY_STORAGE_KEY);
  } catch {
    // ignore
  }
}

function schedulePersist(settings: AppSettings): void {
  if (!persistFn) return;
  if (persistTimer) clearTimeout(persistTimer);
  const snapshot = settings;
  persistTimer = setTimeout(() => {
    persistTimer = null;
    void persistFn?.(snapshot).catch((err) => {
      console.error('Failed to save settings.json', err);
    });
  }, 200);
}

export function getSettings(): AppSettings {
  return current;
}

export function subscribeSettings(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function cssForSettings(settings: AppSettings): string {
  if (settings.systemFontFamily) {
    return localFontCss(settings.systemFontFamily);
  }
  return (
    FONT_OPTIONS.find((o) => o.id === settings.font)?.css ?? FONT_OPTIONS[0].css
  );
}

export function applySettingsToDom(settings: AppSettings = current): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  const fontCss = cssForSettings(settings);

  root.style.setProperty('--font-display', fontCss);
  root.style.setProperty('--editor-font-family', fontCss);
  root.style.setProperty('--editor-font-size', `${settings.fontSize}rem`);

  if (settings.theme === 'system') {
    root.removeAttribute('data-theme');
  } else {
    root.setAttribute('data-theme', settings.theme);
  }

  if (settings.systemFontFamily) {
    void ensureLocalFontLoaded(settings.systemFontFamily);
  }
}

function publish(settings: AppSettings, writeDisk: boolean): void {
  current = settings;
  applySettingsToDom(current);
  for (const listener of listeners) listener(current);
  if (writeDisk) schedulePersist(current);
}

export function setSettings(patch: Partial<AppSettings>): AppSettings {
  publish(normalizeSettings({ ...current, ...patch }), true);
  return current;
}

export function resetSettings(): AppSettings {
  publish({ ...DEFAULT_SETTINGS }, true);
  return current;
}

/** Replace in-memory settings from disk (does not re-write unless missing). */
export function hydrateSettings(
  partial: Partial<AppSettings> | null | undefined,
): AppSettings {
  publish(normalizeSettings(partial), false);
  return current;
}

/** Wire File System Access persistence for the workspace folder. */
export function configureSettingsPersistence(save: PersistFn | null): void {
  persistFn = save;
}

/** Call once at app boot — defaults only until a folder is opened. */
export function initSettings(): AppSettings {
  clearLegacyBrowserStorage();
  current = { ...DEFAULT_SETTINGS };
  applySettingsToDom(current);
  return current;
}
