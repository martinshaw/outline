import { describe, expect, it, beforeEach } from 'vitest';
import {
  resetBlockSelectionStore,
  setBlockSelectedIds,
} from '../editor/blockSelectionStore';
import { DAY_DOCUMENT_VERSION } from '../types';
import type { DayDocument, OutlineItem } from '../types';
import {
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

const sample: DayDocument = {
  version: DAY_DOCUMENT_VERSION,
  date: '2026-10-10',
  items: [
    note('a', 'A', [note('a1', 'A1'), note('a2', 'A2')]),
    note('b', 'B'),
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
});
