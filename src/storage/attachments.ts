import { createId } from '../utils/id';

export const ATTACHMENTS_DIR = 'attachments';

/** Display width for image attachments in the outline. */
export type AttachmentDisplaySize = 'small' | 'medium' | 'large' | 'full';

export const ATTACHMENT_DISPLAY_SIZES: {
  id: AttachmentDisplaySize;
  label: string;
}[] = [
  { id: 'small', label: 'Small' },
  { id: 'medium', label: 'Medium' },
  { id: 'large', label: 'Large' },
  { id: 'full', label: 'Full width' },
];

export const DEFAULT_ATTACHMENT_DISPLAY_SIZE: AttachmentDisplaySize = 'medium';

export type AttachmentMeta = {
  /** Workspace-relative path, e.g. `attachments/<uuid>.png`. */
  path: string;
  mime: string;
  /** Original filename from the drop/paste. */
  name: string;
  size: number;
  /** Image layout size; ignored for non-images. */
  displaySize?: AttachmentDisplaySize;
};

export type AttachmentKind = 'image' | 'audio' | 'video' | 'file';

export function normalizeDisplaySize(
  raw: unknown,
): AttachmentDisplaySize {
  if (
    raw === 'small' ||
    raw === 'medium' ||
    raw === 'large' ||
    raw === 'full'
  ) {
    return raw;
  }
  return DEFAULT_ATTACHMENT_DISPLAY_SIZE;
}

const MIME_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/svg+xml': 'svg',
  'image/avif': 'avif',
  'audio/mpeg': 'mp3',
  'audio/mp4': 'm4a',
  'audio/wav': 'wav',
  'audio/ogg': 'ogg',
  'audio/webm': 'weba',
  'video/mp4': 'mp4',
  'video/webm': 'webm',
  'video/ogg': 'ogv',
  'video/quicktime': 'mov',
  'application/pdf': 'pdf',
  'text/plain': 'txt',
  'application/json': 'json',
  'application/zip': 'zip',
};

const urlCache = new Map<string, string>();

export function attachmentKindFromMime(mime: string): AttachmentKind {
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('audio/')) return 'audio';
  if (mime.startsWith('video/')) return 'video';
  return 'file';
}

export function isSafeAttachmentPath(path: string): boolean {
  return /^attachments\/[A-Za-z0-9._-]+$/.test(path);
}

export function normalizeAttachmentMeta(
  raw: unknown,
): AttachmentMeta | null {
  if (!raw || typeof raw !== 'object') return null;
  const rec = raw as Record<string, unknown>;
  const path = typeof rec.path === 'string' ? rec.path.trim() : '';
  if (!isSafeAttachmentPath(path)) return null;
  const mime =
    typeof rec.mime === 'string' && rec.mime.trim()
      ? rec.mime.trim()
      : 'application/octet-stream';
  const name =
    typeof rec.name === 'string' && rec.name.trim()
      ? rec.name.trim().slice(0, 240)
      : path.split('/').pop() ?? 'file';
  const size =
    typeof rec.size === 'number' && Number.isFinite(rec.size) && rec.size >= 0
      ? Math.floor(rec.size)
      : 0;
  const meta: AttachmentMeta = { path, mime, name, size };
  if (mime.startsWith('image/')) {
    meta.displaySize = normalizeDisplaySize(rec.displaySize);
  }
  return meta;
}

function extFromName(name: string): string {
  const base = name.split(/[/\\]/).pop() ?? name;
  const dot = base.lastIndexOf('.');
  if (dot <= 0 || dot === base.length - 1) return '';
  return base
    .slice(dot + 1)
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .slice(0, 8);
}

export function extensionForFile(file: File): string {
  const fromName = extFromName(file.name);
  if (fromName) return fromName;
  const fromMime = MIME_EXT[file.type];
  if (fromMime) return fromMime;
  return 'bin';
}

export function buildAttachmentFilename(file: File): string {
  return `${createId()}.${extensionForFile(file)}`;
}

export function formatAttachmentSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Cached object URL for an attachment path (revoked via `revokeAttachmentUrl`). */
export function getCachedAttachmentUrl(path: string): string | undefined {
  return urlCache.get(path);
}

export function setCachedAttachmentUrl(path: string, url: string): void {
  const prev = urlCache.get(path);
  if (prev && prev !== url) URL.revokeObjectURL(prev);
  urlCache.set(path, url);
}

export function revokeAttachmentUrl(path: string): void {
  const url = urlCache.get(path);
  if (url) {
    URL.revokeObjectURL(url);
    urlCache.delete(path);
  }
}

export function revokeAllAttachmentUrls(): void {
  for (const url of urlCache.values()) URL.revokeObjectURL(url);
  urlCache.clear();
}
