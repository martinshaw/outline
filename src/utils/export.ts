import { resolveEntityLabels } from '../entities/entityStore';
import { getBlockSelectedIds } from '../editor/blockSelectionStore';
import type { DayDocument, InlineSegment, OutlineItem } from '../types';
import { segmentsToPlainText } from './outline';

export type ExportFormat = 'json' | 'yaml' | 'markdown' | 'text' | 'html';
export type ExportScope = 'day' | 'selection';

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
    return `[file:${item.attachment.path}] `;
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
    lines.push(
      `${pad}${kindPrefix(item)}${headingMarks(item)}${body}${metaSuffix(item)}`,
    );
    if (item.children.length) lines.push(toPlainText(item.children, depth + 1));
  }
  return lines.join('\n');
}

function toHtmlList(items: OutlineItem[]): string {
  if (items.length === 0) return '';
  const lis = items
    .map((item) => {
      const body = segmentsToHtml(item.content) || '&nbsp;';
      const kind =
        item.kind !== 'note'
          ? ` data-kind="${escapeHtml(item.kind)}"`
          : '';
      const heading =
        item.kind === 'heading' && item.headingLevel
          ? ` data-heading-level="${item.headingLevel}"`
          : '';
      const kids = toHtmlList(item.children);
      const labeled =
        item.kind === 'heading' && item.headingLevel
          ? `<h${item.headingLevel}>${body}</h${item.headingLevel}>`
          : body;
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

export function downloadExport(
  doc: DayDocument,
  scope: ExportScope,
  format: ExportFormat,
): { ok: true } | { ok: false; reason: string } {
  const result = serializeExport(doc, scope, format);
  if (!result) {
    return { ok: false, reason: 'Nothing selected to export' };
  }

  const scopeLabel = scope === 'day' ? 'day' : 'selection';
  const filename = `outline-${doc.date}-${scopeLabel}.${result.extension}`;
  const blob = new Blob([result.content], { type: `${result.mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
  return { ok: true };
}
