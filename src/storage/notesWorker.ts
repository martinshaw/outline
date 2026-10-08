import type { DayDocument, SidebarDay } from '../types';
import { buildSidebarFromDocs, isDayEmpty } from '../utils/outline';

const NOTES_DIR = 'notes';
const MANIFEST = 'manifest.json';
const DATE_RE = /^\d{4}-\d{2}-\d{2}\.json$/;

type RequestMessage =
  | { id: number; type: 'setRoot'; handle: FileSystemDirectoryHandle }
  | { id: number; type: 'loadIndex' }
  | { id: number; type: 'loadDay'; date: string }
  | { id: number; type: 'saveDay'; doc: DayDocument }
  | { id: number; type: 'deleteDay'; date: string }
  | { id: number; type: 'parseSidebar'; docs: DayDocument[] };

type ResponseMessage =
  | { id: number; ok: true; result: unknown }
  | { id: number; ok: false; error: string };

let root: FileSystemDirectoryHandle | null = null;

async function getNotesDir(): Promise<FileSystemDirectoryHandle> {
  if (!root) throw new Error('No directory selected');
  return root.getDirectoryHandle(NOTES_DIR, { create: true });
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
    // ignore
  }
}

async function listDayKeys(): Promise<string[]> {
  const notes = await getNotesDir();
  const dates: string[] = [];
  for await (const [name, handle] of notes.entries()) {
    if (handle.kind === 'file' && DATE_RE.test(name)) {
      dates.push(name.replace(/\.json$/, ''));
    }
  }
  dates.sort((a, b) => (a < b ? 1 : a > b ? -1 : 0));
  return dates;
}

async function rebuildManifest(): Promise<void> {
  const notes = await getNotesDir();
  const days = await listDayKeys();
  await writeJsonFile(notes, MANIFEST, { version: 1, days });
}

async function loadDay(date: string): Promise<DayDocument | null> {
  const notes = await getNotesDir();
  const doc = await readJsonFile<DayDocument>(notes, `${date}.json`);
  if (!doc || doc.version !== 1) return null;
  return doc;
}

async function loadIndex(): Promise<{
  days: string[];
  docs: DayDocument[];
  sidebar: SidebarDay[];
}> {
  const days = await listDayKeys();
  const docs: DayDocument[] = [];
  for (const date of days) {
    const doc = await loadDay(date);
    if (doc && !isDayEmpty(doc)) docs.push(doc);
  }
  return { days: docs.map((d) => d.date), docs, sidebar: buildSidebarFromDocs(docs) };
}

async function saveDay(doc: DayDocument): Promise<{
  status: 'saved' | 'deleted';
  sidebar: SidebarDay[];
  days: string[];
}> {
  const notes = await getNotesDir();
  const name = `${doc.date}.json`;
  if (isDayEmpty(doc)) {
    await deleteFile(notes, name);
  } else {
    await writeJsonFile(notes, name, doc);
  }
  await rebuildManifest();
  const index = await loadIndex();
  return {
    status: isDayEmpty(doc) ? 'deleted' : 'saved',
    sidebar: index.sidebar,
    days: index.days,
  };
}

async function deleteDay(date: string): Promise<{
  sidebar: SidebarDay[];
  days: string[];
}> {
  const notes = await getNotesDir();
  await deleteFile(notes, `${date}.json`);
  await rebuildManifest();
  const index = await loadIndex();
  return { sidebar: index.sidebar, days: index.days };
}

async function handleRequest(msg: RequestMessage): Promise<unknown> {
  switch (msg.type) {
    case 'setRoot':
      root = msg.handle;
      return { name: root.name };
    case 'loadIndex':
      return loadIndex();
    case 'loadDay':
      return loadDay(msg.date);
    case 'saveDay':
      return saveDay(msg.doc);
    case 'deleteDay':
      return deleteDay(msg.date);
    case 'parseSidebar':
      return buildSidebarFromDocs(msg.docs);
    default:
      throw new Error('Unknown message');
  }
}

self.onmessage = async (event: MessageEvent<RequestMessage>) => {
  const msg = event.data;
  try {
    const result = await handleRequest(msg);
    const response: ResponseMessage = { id: msg.id, ok: true, result };
    self.postMessage(response);
  } catch (err) {
    const response: ResponseMessage = {
      id: msg.id,
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
    self.postMessage(response);
  }
};

export type {};
