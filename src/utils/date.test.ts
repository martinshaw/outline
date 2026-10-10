import { describe, expect, it } from 'vitest';
import { emptyDayDocument, formatDayLabel, todayKey } from './date';
import { DAY_DOCUMENT_VERSION } from '../types';

describe('todayKey', () => {
  it('formats local YYYY-MM-DD', () => {
    expect(todayKey(new Date(2026, 0, 5))).toBe('2026-01-05');
    expect(todayKey(new Date(2026, 11, 31))).toBe('2026-12-31');
  });
});

describe('formatDayLabel', () => {
  it('returns a non-empty label for a date key', () => {
    const label = formatDayLabel('2026-10-10');
    expect(label.length).toBeGreaterThan(3);
    expect(label).toMatch(/2026|Oct|October|10/);
  });
});

describe('emptyDayDocument', () => {
  it('creates a v2 doc with no items', () => {
    const doc = emptyDayDocument('2026-10-10');
    expect(doc.version).toBe(DAY_DOCUMENT_VERSION);
    expect(doc.date).toBe('2026-10-10');
    expect(doc.items).toEqual([]);
  });
});
