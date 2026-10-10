import { describe, expect, it, beforeEach } from 'vitest';
import { unzipSync, strFromU8 } from 'fflate';
import {
  resetBlockSelectionStore,
  setBlockSelectedIds,
} from '../editor/blockSelectionStore';
import { DAY_DOCUMENT_VERSION } from '../types';
import type { DayDocument, OutlineItem } from '../types';
import {
  buildExportDownload,
  collectAttachmentPaths,
  extractSelectedItems,
  itemsForExport,
  serializeExport,
} from './export';

function note(
  id: string,
  text: string,
  children: OutlineItem[] = [],
): OutlineItem {
  return {
    id,
    kind: 'note',
    content: [{ type: 'text', text }],
    children,
  };
}

function attachment(
  id: string,
  path: string,
  name: string,
  mime = 'image/png',
): OutlineItem {
  return {
    id,
    kind: 'attachment',
    content: [],
    children: [],
    attachment: { path, mime, name, size: 12 },
  };
}

const sample: DayDocument = {
  version: DAY_DOCUMENT_VERSION,
  date: '2026-10-10',
  items: [
    note('a', 'A', [note('a1', 'A1'), note('a2', 'A2')]),
    note('b', 'B'),
  ],
};

const withFiles: DayDocument = {
  version: DAY_DOCUMENT_VERSION,
  date: '2026-10-10',
  items: [
    note('a', 'Intro', [
      attachment('img', 'attachments/photo.png', 'photo.png'),
    ]),
    attachment('doc', 'attachments/brief.pdf', 'brief.pdf', 'application/pdf'),
  ],
};

beforeEach(() => {
  resetBlockSelectionStore();
});

describe('extractSelectedItems', () => {
  it('returns top-level selected subtrees without duplicating nested picks', () => {
    const picked = extractSelectedItems(
      sample,
      new Set(['a', 'a1', 'b']),
    );
    expect(picked.map((i) => i.id)).toEqual(['a', 'b']);
    expect(picked[0].children.map((c) => c.id)).toEqual(['a1', 'a2']);
  });

  it('returns nested item alone when only it is selected', () => {
    const picked = extractSelectedItems(sample, new Set(['a1']));
    expect(picked.map((i) => i.id)).toEqual(['a1']);
  });

  it('returns empty when nothing selected', () => {
    expect(extractSelectedItems(sample, new Set())).toEqual([]);
  });
});

describe('itemsForExport / serializeExport', () => {
  it('exports the whole day', () => {
    const items = itemsForExport(sample, 'day');
    expect(items.map((i) => i.id)).toEqual(['a', 'b']);
  });

  it('exports the current block selection', () => {
    setBlockSelectedIds(['b']);
    expect(itemsForExport(sample, 'selection').map((i) => i.id)).toEqual([
      'b',
    ]);
  });

  it('serializes markdown with titles', () => {
    const result = serializeExport(sample, 'day', 'markdown');
    expect(result?.extension).toBe('md');
    expect(result?.content).toContain('# 2026-10-10');
    expect(result?.content).toContain('A');
    expect(result?.content).toContain('A1');
  });

  it('serializes json payload', () => {
    const result = serializeExport(sample, 'day', 'json');
    const parsed = JSON.parse(result!.content) as DayDocument;
    expect(parsed.date).toBe('2026-10-10');
    expect(parsed.items).toHaveLength(2);
  });

  it('returns null for empty selection export', () => {
    expect(serializeExport(sample, 'selection', 'text')).toBeNull();
  });

  it('links attachments in markdown and html', () => {
    const md = serializeExport(withFiles, 'day', 'markdown');
    expect(md?.content).toContain('![photo.png](attachments/photo.png)');
    expect(md?.content).toContain('[brief.pdf](attachments/brief.pdf)');

    const html = serializeExport(withFiles, 'day', 'html');
    expect(html?.content).toContain('src="attachments/photo.png"');
    expect(html?.content).toContain('href="attachments/brief.pdf"');
  });
});

describe('collectAttachmentPaths / buildExportDownload', () => {
  it('collects unique safe attachment paths', () => {
    expect(collectAttachmentPaths(withFiles.items)).toEqual([
      'attachments/photo.png',
      'attachments/brief.pdf',
    ]);
  });

  it('downloads a plain file when there are no attachments', async () => {
    const built = await buildExportDownload(
      sample,
      'day',
      'markdown',
      async () => null,
    );
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    expect(built.filename).toBe('outline-2026-10-10-day.md');
    expect(built.attachmentCount).toBe(0);
    expect(await built.blob.text()).toContain('# 2026-10-10');
  });

  it('zips notes plus an attachments directory', async () => {
    const blobs: Record<string, Blob> = {
      'attachments/photo.png': new Blob([new Uint8Array([1, 2, 3])], {
        type: 'image/png',
      }),
      'attachments/brief.pdf': new Blob([new Uint8Array([9, 8, 7])], {
        type: 'application/pdf',
      }),
    };

    const built = await buildExportDownload(
      withFiles,
      'day',
      'markdown',
      async (path) => blobs[path] ?? null,
    );
    expect(built.ok).toBe(true);
    if (!built.ok) return;

    expect(built.filename).toBe('outline-2026-10-10-day.zip');
    expect(built.attachmentCount).toBe(2);

    const bytes = new Uint8Array(await built.blob.arrayBuffer());
    const files = unzipSync(bytes);
    const names = Object.keys(files).sort();
    expect(names).toEqual([
      'outline-2026-10-10-day/attachments/brief.pdf',
      'outline-2026-10-10-day/attachments/photo.png',
      'outline-2026-10-10-day/notes.md',
    ]);

    const notes = strFromU8(files['outline-2026-10-10-day/notes.md']);
    expect(notes).toContain('![photo.png](attachments/photo.png)');
    expect(files['outline-2026-10-10-day/attachments/photo.png']).toEqual(
      new Uint8Array([1, 2, 3]),
    );
  });

  it('zips only attachments in the selection scope', async () => {
    setBlockSelectedIds(['img']);
    const built = await buildExportDownload(
      withFiles,
      'selection',
      'json',
      async (path) =>
        path === 'attachments/photo.png'
          ? new Blob([new Uint8Array([4])])
          : null,
    );
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    expect(built.filename).toBe('outline-2026-10-10-selection.zip');
    expect(built.attachmentCount).toBe(1);

    const files = unzipSync(new Uint8Array(await built.blob.arrayBuffer()));
    expect(Object.keys(files).sort()).toEqual([
      'outline-2026-10-10-selection/attachments/photo.png',
      'outline-2026-10-10-selection/notes.json',
    ]);
  });
});
