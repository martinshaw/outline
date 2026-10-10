import { zipSync } from 'fflate';
import { resolveEntityLabels } from '../entities/entityStore';
import { getBlockSelectedIds } from '../editor/blockSelectionStore';
import {
  ATTACHMENTS_DIR,
  isSafeAttachmentPath,
} from '../storage/attachments';
import type { DayDocument, InlineSegment, OutlineItem } from '../types';
import { segmentsToPlainText } from './outline';

export type ExportFormat = 'json' | 'yaml' | 'markdown' | 'text' | 'html';
export type ExportScope = 'day' | 'selection';

export type AttachmentReader = (path: string) => Promise<Blob | null>;

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Top-level selected items with their document subtrees (no duplicate nested picks). */
export function extractSelectedItems(
  doc: DayDocument,
  selectedIds: ReadonlySet<string>,
): OutlineItem[] {
  if (selectedIds.size === 0) return [];
  const collect = (items: OutlineItem[]): OutlineItem[] => {
    const out: OutlineItem[] = [];
    for (const item of items) {
      if (selectedIds.has(item.id)) out.push(item);
      else out.push(...collect(item.children));
    }
    return out;
  };
  return collect(doc.items);
}

export function itemsForExport(
  doc: DayDocument,
  scope: ExportScope,
): OutlineItem[] {
  if (scope === 'day') return doc.items;
  return extractSelectedItems(doc, getBlockSelectedIds());
}

/** Workspace-relative attachment paths referenced by the export tree. */
export function collectAttachmentPaths(items: OutlineItem[]): string[] {
  const paths = new Set<string>();
  const walk = (list: OutlineItem[]) => {
    for (const item of list) {
      const path = item.attachment?.path;
      if (
        item.kind === 'attachment' &&
        path &&
        isSafeAttachmentPath(path)
      ) {
        paths.add(path);
      }
      walk(item.children);
    }
  };
  walk(items);
  return [...paths];
}

function segmentsToMarkdown(segments: InlineSegment[]): string {
  return segments
    .map((seg) => {
      if (seg.type === 'link') {
        return `[${seg.text || seg.url}](${seg.url})`;
      }
      let t = seg.text;
      if (seg.format?.bold) t = `**${t}**`;
      if (seg.format?.italic) t = `*${t}*`;
      if (seg.format?.underline) t = `<u>${t}</u>`;
      return t;
    })
    .join('');
}

function segmentsToHtml(segments: InlineSegment[]): string {
  return segments
    .map((seg) => {
      if (seg.type === 'link') {
        return `<a href="${escapeHtml(seg.url)}">${escapeHtml(seg.text || seg.url)}</a>`;
      }
      let t = escapeHtml(seg.text);
      if (seg.format?.bold) t = `<strong>${t}</strong>`;
      if (seg.format?.italic) t = `<em>${t}</em>`;
      if (seg.format?.underline) t = `<u>${t}</u>`;
      return t;
    })
    .join('');
}

function kindPrefix(item: OutlineItem): string {
  if (item.kind === 'task' || item.kind === 'subtask') {
    const status = item.status ? `:${item.status}` : '';
    return `[${item.kind}${status}] `;
  }
  if (item.kind === 'attachment' && item.attachment) {
    const { path, name, mime } = item.attachment;
    if (mime.startsWith('image/')) {
      return `![${name}](${path}) `;
    }
    return `[${name}](${path}) `;
  }
  return '';
}

function metaSuffix(item: OutlineItem): string {
  if (item.kind !== 'task' && item.kind !== 'subtask') return '';
  const bits: string[] = [];
  if (item.deadline) bits.push(`due:${item.deadline}`);
  const entityIds = item.entities ?? item.people;
  if (entityIds?.length) {
    const labels = resolveEntityLabels(entityIds);
    bits.push(`entities:${(labels.length ? labels : entityIds).join('|')}`);
  }
  return bits.length ? ` {${bits.join(' ')}}` : '';
}

function headingMarks(item: OutlineItem): string {
  if (item.kind !== 'heading') return '';
  const level = item.headingLevel && item.headingLevel >= 1 && item.headingLevel <= 6
    ? item.headingLevel
    : 1;
  return `${'#'.repeat(level)} `;
}

function toMarkdown(items: OutlineItem[], depth = 0): string {
  const pad = '  '.repeat(depth);
  const lines: string[] = [];
  for (const item of items) {
    const body = segmentsToMarkdown(item.content) || '';
    if (item.kind === 'heading') {
      lines.push(`${pad}- ${headingMarks(item)}${body}`);
    } else {
      lines.push(`${pad}- ${kindPrefix(item)}${body}${metaSuffix(item)}`);
    }
    if (item.children.length) lines.push(toMarkdown(item.children, depth + 1));
  }
  return lines.join('\n');
}

function toPlainText(items: OutlineItem[], depth = 0): string {
  const pad = '  '.repeat(depth);
  const lines: string[] = [];
  for (const item of items) {
    const body = segmentsToPlainText(item.content);
    const prefix =
      item.kind === 'attachment' && item.attachment
        ? `[file:${item.attachment.path}] `
        : kindPrefix(item);
    lines.push(
      `${pad}${prefix}${headingMarks(item)}${body}${metaSuffix(item)}`,
    );
    if (item.children.length) lines.push(toPlainText(item.children, depth + 1));
  }
  return lines.join('\n');
}

function attachmentHtml(item: OutlineItem): string {
  const att = item.attachment;
  if (!att) return '';
  const caption = segmentsToHtml(item.content);
  if (att.mime.startsWith('image/')) {
    const img = `<img src="${escapeHtml(att.path)}" alt="${escapeHtml(att.name)}"/>`;
    return caption ? `${img} ${caption}` : img;
  }
  const link = `<a href="${escapeHtml(att.path)}">${escapeHtml(att.name)}</a>`;
  return caption ? `${link} ${caption}` : link;
}

function toHtmlList(items: OutlineItem[]): string {
  if (items.length === 0) return '';
  const lis = items
    .map((item) => {
      const kind =
        item.kind !== 'note'
          ? ` data-kind="${escapeHtml(item.kind)}"`
          : '';
      const heading =
        item.kind === 'heading' && item.headingLevel
          ? ` data-heading-level="${item.headingLevel}"`
          : '';
      const kids = toHtmlList(item.children);
      let labeled: string;
      if (item.kind === 'attachment') {
        labeled = attachmentHtml(item) || '&nbsp;';
      } else if (item.kind === 'heading' && item.headingLevel) {
        const body = segmentsToHtml(item.content) || '&nbsp;';
        labeled = `<h${item.headingLevel}>${body}</h${item.headingLevel}>`;
      } else {
        labeled = segmentsToHtml(item.content) || '&nbsp;';
      }
      return `<li${kind}${heading}>${labeled}${kids}</li>`;
    })
    .join('\n');
  return `<ul>\n${lis}\n</ul>`;
}

function yamlEscape(value: string): string {
  if (value === '') return '""';
  if (/^[\w.@+-]+$/.test(value) && !/^(?:true|false|null|yes|no)$/i.test(value)) {
    return value;
  }
  return JSON.stringify(value);
}

function yamlLines(value: unknown, indent: number): string[] {
  const pad = '  '.repeat(indent);
  if (value === null || value === undefined) return [`${pad}null`];
  if (typeof value === 'boolean' || typeof value === 'number') {
    return [`${pad}${value}`];
  }
  if (typeof value === 'string') return [`${pad}${yamlEscape(value)}`];

  if (Array.isArray(value)) {
    if (value.length === 0) return [`${pad}[]`];
    const lines: string[] = [];
    for (const item of value) {
      if (item !== null && typeof item === 'object' && !Array.isArray(item)) {
        const nested = yamlLines(item, indent + 1);
        const first = nested[0]?.replace(/^\s+/, '') ?? '';
        lines.push(`${pad}- ${first}`);
        for (const line of nested.slice(1)) lines.push(line);
      } else {
        lines.push(`${pad}- ${yamlEscape(String(item))}`);
      }
    }
    return lines;
  }

  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>);
    if (entries.length === 0) return [`${pad}{}`];
    const lines: string[] = [];
    for (const [key, val] of entries) {
      if (val !== null && typeof val === 'object') {
        const nested = yamlLines(val, indent + 1);
        if (
          nested.length === 1 &&
          (nested[0].trim() === '[]' || nested[0].trim() === '{}')
        ) {
          lines.push(`${pad}${key}: ${nested[0].trim()}`);
        } else {
          lines.push(`${pad}${key}:`);
          lines.push(...nested);
        }
      } else if (typeof val === 'string') {
        lines.push(`${pad}${key}: ${yamlEscape(val)}`);
      } else if (typeof val === 'number' || typeof val === 'boolean') {
        lines.push(`${pad}${key}: ${val}`);
      } else {
        lines.push(`${pad}${key}: null`);
      }
    }
    return lines;
  }

  return [`${pad}${yamlEscape(String(value))}`];
}

function toYaml(doc: DayDocument): string {
  return `${yamlLines(doc, 0).join('\n')}\n`;
}

export function serializeExport(
  doc: DayDocument,
  scope: ExportScope,
  format: ExportFormat,
): { content: string; mime: string; extension: string } | null {
  const items = itemsForExport(doc, scope);
  if (scope === 'selection' && items.length === 0) return null;

  const payloadDoc: DayDocument = {
    version: doc.version,
    date: doc.date,
    items,
  };

  switch (format) {
    case 'json':
      return {
        content: JSON.stringify(payloadDoc, null, 2),
        mime: 'application/json',
        extension: 'json',
      };
    case 'yaml':
      return {
        content: toYaml(payloadDoc),
        mime: 'text/yaml',
        extension: 'yml',
      };
    case 'markdown':
      return {
        content: `# ${doc.date}\n\n${toMarkdown(items)}\n`,
        mime: 'text/markdown',
        extension: 'md',
      };
    case 'text':
      return {
        content: `${doc.date}\n\n${toPlainText(items)}\n`,
        mime: 'text/plain',
        extension: 'txt',
      };
    case 'html':
      return {
        content: `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<title>${escapeHtml(doc.date)}</title>
</head>
<body>
<h1>${escapeHtml(doc.date)}</h1>
${toHtmlList(items)}
</body>
</html>
`,
        mime: 'text/html',
        extension: 'html',
      };
  }
}

function triggerDownload(filename: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

async function blobToUint8Array(blob: Blob): Promise<Uint8Array> {
  return new Uint8Array(await blob.arrayBuffer());
}

/**
 * Build the downloadable export. When the note tree references attachments,
 * returns a zip: `{name}/notes.{ext}` plus `{name}/attachments/…`.
 */
export async function buildExportDownload(
  doc: DayDocument,
  scope: ExportScope,
  format: ExportFormat,
  readAttachment: AttachmentReader,
): Promise<
  | { ok: true; filename: string; blob: Blob; attachmentCount: number }
  | { ok: false; reason: string }
> {
  const result = serializeExport(doc, scope, format);
  if (!result) {
    return { ok: false, reason: 'Nothing selected to export' };
  }

  const items = itemsForExport(doc, scope);
  const paths = collectAttachmentPaths(items);
  const scopeLabel = scope === 'day' ? 'day' : 'selection';
  const baseName = `outline-${doc.date}-${scopeLabel}`;

  if (paths.length === 0) {
    return {
      ok: true,
      filename: `${baseName}.${result.extension}`,
      blob: new Blob([result.content], {
        type: `${result.mime};charset=utf-8`,
      }),
      attachmentCount: 0,
    };
  }

  const files: Record<string, Uint8Array> = {
    [`${baseName}/notes.${result.extension}`]: new TextEncoder().encode(
      result.content,
    ),
  };

  let attachmentCount = 0;
  for (const path of paths) {
    const blob = await readAttachment(path);
    if (!blob) continue;
    // Keep workspace-relative path under the export folder
    // e.g. outline-…/attachments/uuid.png
    const zipPath = `${baseName}/${path}`;
    if (!zipPath.startsWith(`${baseName}/${ATTACHMENTS_DIR}/`)) continue;
    files[zipPath] = await blobToUint8Array(blob);
    attachmentCount += 1;
  }

  const zipped = zipSync(files, { level: 6 });
  // Copy into a fresh ArrayBuffer-backed view — Blob rejects SharedArrayBuffer.
  const bytes = new Uint8Array(zipped.byteLength);
  bytes.set(zipped);
  return {
    ok: true,
    filename: `${baseName}.zip`,
    blob: new Blob([bytes], { type: 'application/zip' }),
    attachmentCount,
  };
}

export async function downloadExport(
  doc: DayDocument,
  scope: ExportScope,
  format: ExportFormat,
  readAttachment: AttachmentReader,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const built = await buildExportDownload(
    doc,
    scope,
    format,
    readAttachment,
  );
  if (!built.ok) return built;
  triggerDownload(built.filename, built.blob);
  return { ok: true };
}
