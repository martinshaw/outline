import { get, set, del } from 'idb-keyval';

const HANDLE_KEY = 'outline-notes-directory';

export function supportsDirectoryPicker(): boolean {
  return typeof window !== 'undefined' && 'showDirectoryPicker' in window;
}

export async function loadStoredDirectoryHandle(): Promise<FileSystemDirectoryHandle | null> {
  try {
    const handle = await get<FileSystemDirectoryHandle>(HANDLE_KEY);
    return handle ?? null;
  } catch {
    return null;
  }
}

export async function storeDirectoryHandle(
  handle: FileSystemDirectoryHandle,
): Promise<void> {
  await set(HANDLE_KEY, handle);
}

export async function clearDirectoryHandle(): Promise<void> {
  await del(HANDLE_KEY);
}

export async function pickNotesDirectory(): Promise<FileSystemDirectoryHandle> {
  const handle = await window.showDirectoryPicker({
    id: 'outline-notes',
    mode: 'readwrite',
    startIn: 'documents',
  });
  await storeDirectoryHandle(handle);
  return handle;
}

export async function ensureReadWritePermission(
  handle: FileSystemDirectoryHandle,
): Promise<boolean> {
  const opts = { mode: 'readwrite' as const };
  let state = await handle.queryPermission(opts);
  if (state === 'granted') return true;
  if (state === 'prompt') {
    state = await handle.requestPermission(opts);
  }
  return state === 'granted';
}
