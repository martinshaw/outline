import type { EntityCatalog } from '../entities/types';
import { getSettings, sanitizeBackupDirectory } from '../settings/settingsStore';
import type { AppSettings } from '../settings/types';
import {
  normalizeDayDocument,
  type DayDocument,
  type NotesManifest,
} from '../types';
import { todayKey } from '../utils/date';
import { isDayEmpty } from '../utils/outline';
import {
  ATTACHMENTS_DIR,
  buildAttachmentFilename,
  isSafeAttachmentPath,
  type AttachmentMeta,
} from './attachments';

const NOTES_DIR = 'notes';
const SETTINGS_FILE = 'settings.json';
const ENTITIES_FILE = 'entities.json';
const MANIFEST = 'manifest.json';
const CHANGE_LOG = 'change-log.json';
const DATE_RE = /^\d{4}-\d{2}-\d{2}\.json$/;

/** Calendar day → note dates that were written that day. Not read by the app UI. */
type ChangeLog = {
  version: 1;
  changedByDay: Record<string, string[]>;
};

async function getNotesDir(
  root: FileSystemDirectoryHandle,
): Promise<FileSystemDirectoryHandle> {
  return root.getDirectoryHandle(NOTES_DIR, { create: true });
}

function backupsDirName(): string {
  return sanitizeBackupDirectory(getSettings().backupDirectory);
}

function backupsEnabled(): boolean {
  return getSettings().backupMode === 'on-next-day-write';
}

async function getBackupsDir(
  root: FileSystemDirectoryHandle,
): Promise<FileSystemDirectoryHandle> {
  return root.getDirectoryHandle(backupsDirName(), { create: true });
}

async function readJsonFile<T>(
  dir: FileSystemDirectoryHandle,
  name: string,
): Promise<T | null> {
  try {
    const fileHandle = await dir.getFileHandle(name);
    const file = await fileHandle.getFile();
    const text = await file.text();
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

async function writeJsonFile(
  dir: FileSystemDirectoryHandle,
  name: string,
  data: unknown,
): Promise<void> {
  const fileHandle = await dir.getFileHandle(name, { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(JSON.stringify(data, null, 2));
  await writable.close();
}

async function deleteFile(
  dir: FileSystemDirectoryHandle,
  name: string,
): Promise<void> {
  try {
    await dir.removeEntry(name);
  } catch {
    // already gone
  }
}

export async function listDayKeys(
  root: FileSystemDirectoryHandle,
): Promise<string[]> {
  const notes = await getNotesDir(root);
  const dates: string[] = [];
  // Prefer values() — more widely available than entries() on directory handles
  for await (const handle of notes.values()) {
    if (handle.kind === 'file' && DATE_RE.test(handle.name)) {
      dates.push(handle.name.replace(/\.json$/, ''));
    }
  }
  dates.sort((a, b) => (a < b ? 1 : a > b ? -1 : 0));
  return dates;
}

export async function loadDay(
  root: FileSystemDirectoryHandle,
  date: string,
): Promise<DayDocument | null> {
  const notes = await getNotesDir(root);
  const doc = await readJsonFile<DayDocument>(notes, `${date}.json`);
  return normalizeDayDocument(doc);
}

async function readChangeLog(
  root: FileSystemDirectoryHandle,
): Promise<ChangeLog> {
  const backups = await getBackupsDir(root);
  const log = await readJsonFile<ChangeLog>(backups, CHANGE_LOG);
  if (!log || log.version !== 1 || typeof log.changedByDay !== 'object') {
    return { version: 1, changedByDay: {} };
  }
  return log;
}

async function writeChangeLog(
  root: FileSystemDirectoryHandle,
  log: ChangeLog,
): Promise<void> {
  const backups = await getBackupsDir(root);
  await writeJsonFile(backups, CHANGE_LOG, log);
}

/** Remember that `noteDate` was modified on calendar day `calendarDay`. */
async function recordNoteChange(
  root: FileSystemDirectoryHandle,
  noteDate: string,
  calendarDay: string,
): Promise<void> {
  const log = await readChangeLog(root);
  const set = new Set(log.changedByDay[calendarDay] ?? []);
  set.add(noteDate);
  log.changedByDay[calendarDay] = [...set].sort();
  await writeChangeLog(root, log);
}

/**
 * Copy note files changed on `changeDay` into backups/<changeDay>/.
 * Missing files (e.g. emptied/deleted) are skipped.
 */
async function backupChangedNotes(
  root: FileSystemDirectoryHandle,
  changeDay: string,
  noteDates: string[],
): Promise<void> {
  const notes = await getNotesDir(root);
  const backups = await getBackupsDir(root);
  const dayDir = await backups.getDirectoryHandle(changeDay, { create: true });

  for (const noteDate of noteDates) {
    const doc = await readJsonFile<{ version?: number }>(
      notes,
      `${noteDate}.json`,
    );
    const version = typeof doc?.version === 'number' ? doc.version : 0;
    if (!doc || (version !== 1 && version !== 2)) continue;
    await writeJsonFile(dayDir, `${noteDate}.json`, doc);
  }
}

/**
 * When the user starts writing today's note, snapshot every note that was
 * changed on earlier calendar days into backups/<that-day>/.
 */
async function flushPendingBackups(
  root: FileSystemDirectoryHandle,
  today: string,
): Promise<void> {
  const log = await readChangeLog(root);
  const pending = Object.keys(log.changedByDay)
    .filter((day) => day < today)
    .sort();
  if (pending.length === 0) return;

  for (const changeDay of pending) {
    await backupChangedNotes(
      root,
      changeDay,
      log.changedByDay[changeDay] ?? [],
    );
    delete log.changedByDay[changeDay];
  }
  await writeChangeLog(root, log);
}

export async function saveDay(
  root: FileSystemDirectoryHandle,
  doc: DayDocument,
): Promise<'saved' | 'deleted'> {
  const today = todayKey();
  const trackBackups = backupsEnabled();

  // First write on a new calendar day's note → backup prior days' edits
  if (trackBackups && doc.date === today) {
    await flushPendingBackups(root, today);
  }

  const notes = await getNotesDir(root);
  const name = `${doc.date}.json`;

  if (isDayEmpty(doc)) {
    await deleteFile(notes, name);
    await rebuildManifest(root);
    if (trackBackups) await recordNoteChange(root, doc.date, today);
    return 'deleted';
  }

  await writeJsonFile(notes, name, doc);
  await rebuildManifest(root);
  if (trackBackups) await recordNoteChange(root, doc.date, today);
  return 'saved';
}

export async function deleteDay(
  root: FileSystemDirectoryHandle,
  date: string,
): Promise<void> {
  const notes = await getNotesDir(root);
  await deleteFile(notes, `${date}.json`);
  await rebuildManifest(root);
  if (backupsEnabled()) await recordNoteChange(root, date, todayKey());
}

export async function loadAllDays(
  root: FileSystemDirectoryHandle,
): Promise<DayDocument[]> {
  const dates = await listDayKeys(root);
  const docs: DayDocument[] = [];
  for (const date of dates) {
    const doc = await loadDay(root, date);
    if (doc && !isDayEmpty(doc)) docs.push(doc);
  }
  return docs;
}

async function rebuildManifest(root: FileSystemDirectoryHandle): Promise<void> {
  const notes = await getNotesDir(root);
  const days = await listDayKeys(root);
  const manifest: NotesManifest = { version: 1, days };
  await writeJsonFile(notes, MANIFEST, manifest);
}

export async function getFolderName(
  handle: FileSystemDirectoryHandle,
): Promise<string> {
  return handle.name;
}

/** App preferences at the workspace root (sibling of notes/). */
export async function loadAppSettings(
  root: FileSystemDirectoryHandle,
): Promise<Partial<AppSettings> | null> {
  return readJsonFile<Partial<AppSettings>>(root, SETTINGS_FILE);
}

export async function saveAppSettings(
  root: FileSystemDirectoryHandle,
  settings: AppSettings,
): Promise<void> {
  await writeJsonFile(root, SETTINGS_FILE, settings);
}

/** Workspace entity catalog at the root (sibling of notes/). */
export async function loadEntityCatalog(
  root: FileSystemDirectoryHandle,
): Promise<Partial<EntityCatalog> | null> {
  return readJsonFile<Partial<EntityCatalog>>(root, ENTITIES_FILE);
}

export async function saveEntityCatalog(
  root: FileSystemDirectoryHandle,
  catalog: EntityCatalog,
): Promise<void> {
  await writeJsonFile(root, ENTITIES_FILE, catalog);
}

async function getAttachmentsDir(
  root: FileSystemDirectoryHandle,
): Promise<FileSystemDirectoryHandle> {
  return root.getDirectoryHandle(ATTACHMENTS_DIR, { create: true });
}

/** Persist a dropped/pasted file under `attachments/` and return metadata. */
export async function writeAttachment(
  root: FileSystemDirectoryHandle,
  file: File,
): Promise<AttachmentMeta> {
  const dir = await getAttachmentsDir(root);
  const filename = buildAttachmentFilename(file);
  const path = `${ATTACHMENTS_DIR}/${filename}`;
  const handle = await dir.getFileHandle(filename, { create: true });
  const writable = await handle.createWritable();
  await writable.write(file);
  await writable.close();
  return {
    path,
    mime: file.type || 'application/octet-stream',
    name: file.name || filename,
    size: file.size,
  };
}

/** Read an attachment blob by workspace-relative path. */
export async function readAttachment(
  root: FileSystemDirectoryHandle,
  path: string,
): Promise<Blob | null> {
  if (!isSafeAttachmentPath(path)) return null;
  const filename = path.slice(ATTACHMENTS_DIR.length + 1);
  try {
    const dir = await getAttachmentsDir(root);
    const handle = await dir.getFileHandle(filename);
    return await handle.getFile();
  } catch {
    return null;
  }
}

export async function deleteAttachment(
  root: FileSystemDirectoryHandle,
  path: string,
): Promise<void> {
  if (!isSafeAttachmentPath(path)) return;
  const filename = path.slice(ATTACHMENTS_DIR.length + 1);
  try {
    const dir = await getAttachmentsDir(root);
    await dir.removeEntry(filename);
  } catch {
    // already gone
  }
}

export type FsEntry = {
  name: string;
  kind: 'file' | 'directory';
};

/** List immediate children of a directory under the workspace root. */
export async function listDirectoryEntries(
  root: FileSystemDirectoryHandle,
  path: string[] = [],
): Promise<FsEntry[]> {
  let dir = root;
  for (const segment of path) {
    dir = await dir.getDirectoryHandle(segment);
  }
  const entries: FsEntry[] = [];
  for await (const handle of dir.values()) {
    entries.push({ name: handle.name, kind: handle.kind });
  }
  entries.sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === 'directory' ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
  return entries;
}
