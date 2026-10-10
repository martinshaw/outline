import {
  configureEntityPersistence,
  getEntityCatalog,
  hydrateEntities,
} from '../entities/entityStore';
import {
  configureSettingsPersistence,
  getSettings,
  hydrateSettings,
} from '../settings/settingsStore';
import type { DayDocument, SidebarDay } from '../types';
import { buildSidebarFromDocs } from '../utils/outline';
import { isDebugEnabled } from './debugStore';
import {
  getCachedAttachmentUrl,
  revokeAttachmentUrl,
  setCachedAttachmentUrl,
  type AttachmentMeta,
} from './attachments';
import {
  deleteAttachment as fsDeleteAttachment,
  deleteDay as fsDeleteDay,
  getFolderName,
  listDirectoryEntries,
  loadAllDays,
  loadAppSettings,
  loadEntityCatalog,
  loadDay as fsLoadDay,
  readAttachment as fsReadAttachment,
  saveAppSettings,
  saveEntityCatalog,
  saveDay as fsSaveDay,
  writeAttachment as fsWriteAttachment,
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

    const entitiesFromDisk = await loadEntityCatalog(handle);
    hydrateEntities(entitiesFromDisk);
    configureEntityPersistence(async (catalog) => {
      if (this.root) await saveEntityCatalog(this.root, catalog);
    });
    if (!entitiesFromDisk) {
      await saveEntityCatalog(handle, getEntityCatalog());
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

  async writeAttachment(file: File): Promise<AttachmentMeta> {
    return fsWriteAttachment(this.requireRoot(), file);
  }

  async readAttachment(path: string): Promise<Blob | null> {
    return fsReadAttachment(this.requireRoot(), path);
  }

  /** Object URL for preview; cached until revoked. */
  async getAttachmentObjectUrl(path: string): Promise<string | null> {
    const cached = getCachedAttachmentUrl(path);
    if (cached) return cached;
    const blob = await this.readAttachment(path);
    if (!blob) return null;
    const url = URL.createObjectURL(blob);
    setCachedAttachmentUrl(path, url);
    return url;
  }

  async deleteAttachment(path: string): Promise<void> {
    revokeAttachmentUrl(path);
    await fsDeleteAttachment(this.requireRoot(), path);
  }
}

export const notesClient = new NotesClient();
