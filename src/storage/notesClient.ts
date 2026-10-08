import {
  configureSettingsPersistence,
  getSettings,
  hydrateSettings,
} from '../settings/settingsStore';
import type { DayDocument, SidebarDay } from '../types';
import { buildSidebarFromDocs } from '../utils/outline';
import { isDebugEnabled } from './debugStore';
import {
  deleteDay as fsDeleteDay,
  getFolderName,
  listDirectoryEntries,
  loadAllDays,
  loadAppSettings,
  loadDay as fsLoadDay,
  saveAppSettings,
  saveDay as fsSaveDay,
  type FsEntry,
} from './fs';

/**
 * Notes repository. File System Access I/O runs on the main thread
 * (directory handles are unreliable inside dedicated workers in Chrome).
 * Heavy JSON/index work can still be moved to a worker later.
 */
class NotesClient {
  private root: FileSystemDirectoryHandle | null = null;

  async setRoot(handle: FileSystemDirectoryHandle): Promise<{ name: string }> {
    this.root = handle;

    const fromDisk = await loadAppSettings(handle);
    hydrateSettings(fromDisk);
    configureSettingsPersistence(async (settings) => {
      if (this.root) await saveAppSettings(this.root, settings);
    });
    // Ensure settings.json exists in the workspace
    if (!fromDisk) {
      await saveAppSettings(handle, getSettings());
    }

    return { name: await getFolderName(handle) };
  }

  isReady(): boolean {
    return this.root !== null;
  }

  private requireRoot(): FileSystemDirectoryHandle {
    if (!this.root) throw new Error('No directory selected');
    return this.root;
  }

  async loadIndex(): Promise<{
    days: string[];
    docs: DayDocument[];
    sidebar: SidebarDay[];
  }> {
    const docs = await loadAllDays(this.requireRoot());
    return {
      days: docs.map((d) => d.date),
      docs,
      sidebar: buildSidebarFromDocs(docs),
    };
  }

  async loadDay(date: string): Promise<DayDocument | null> {
    return fsLoadDay(this.requireRoot(), date);
  }

  async saveDay(doc: DayDocument): Promise<{
    status: 'saved' | 'deleted';
  }> {
    // Do not reload the whole workspace after each save — callers merge the
    // sidebar from the in-memory cache / saved doc.
    const status = await fsSaveDay(this.requireRoot(), doc);
    return { status };
  }

  async deleteDay(date: string): Promise<void> {
    await fsDeleteDay(this.requireRoot(), date);
  }

  async parseSidebar(docs: DayDocument[]): Promise<SidebarDay[]> {
    return buildSidebarFromDocs(docs);
  }

  /** Debug panel only — no-ops when developer mode is off. */
  async listDirectory(path: string[] = []): Promise<FsEntry[]> {
    if (!isDebugEnabled()) return [];
    return listDirectoryEntries(this.requireRoot(), path);
  }
}

export const notesClient = new NotesClient();
