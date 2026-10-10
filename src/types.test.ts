import { describe, expect, it } from 'vitest';
import {
  DAY_DOCUMENT_VERSION,
  isRoleKind,
  normalizeDayDocument,
  normalizeItemKind,
} from './types';

describe('normalizeItemKind', () => {
  it('maps legacy v1 project/task', () => {
    expect(normalizeItemKind('project', 1)).toBe('task');
    expect(normalizeItemKind('task', 1)).toBe('subtask');
  });

  it('keeps v2 kinds', () => {
    expect(normalizeItemKind('task', 2)).toBe('task');
    expect(normalizeItemKind('subtask', 2)).toBe('subtask');
    expect(normalizeItemKind('note', 2)).toBe('note');
    expect(normalizeItemKind('heading', 2)).toBe('heading');
    expect(normalizeItemKind('attachment', 2)).toBe('attachment');
  });

  it('maps stray project even on v2', () => {
    expect(normalizeItemKind('project', 2)).toBe('task');
  });

  it('defaults unknown values to note', () => {
    expect(normalizeItemKind('nope')).toBe('note');
    expect(normalizeItemKind(123)).toBe('note');
  });
});

describe('isRoleKind', () => {
  it('is true for task and subtask only', () => {
    expect(isRoleKind('task')).toBe(true);
    expect(isRoleKind('subtask')).toBe(true);
    expect(isRoleKind('note')).toBe(false);
    expect(isRoleKind('attachment')).toBe(false);
  });
});

describe('normalizeDayDocument', () => {
  it('upgrades version and migrates nested kinds', () => {
    const doc = normalizeDayDocument({
      version: 1,
      date: '2026-05-01',
      items: [
        {
          id: 'p',
          kind: 'project',
          content: [{ type: 'text', text: 'P' }],
          children: [
            {
              id: 't',
              kind: 'task',
              content: [{ type: 'text', text: 'T' }],
              children: [],
            },
          ],
        },
      ],
    });
    expect(doc?.version).toBe(DAY_DOCUMENT_VERSION);
    expect(doc?.items[0].kind).toBe('task');
    expect(doc?.items[0].children[0].kind).toBe('subtask');
  });
});
