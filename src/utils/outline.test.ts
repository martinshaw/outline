import { describe, expect, it } from 'vitest';
import { DAY_DOCUMENT_VERSION } from '../types';
import type { DayDocument, OutlineItem } from '../types';
import {
  buildSidebarFromDocs,
  extractSidebarDay,
  isDayEmpty,
  itemTitle,
  segmentsToPlainText,
  sidebarDaysEqual,
} from './outline';

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

function task(
  id: string,
  text: string,
  children: OutlineItem[] = [],
): OutlineItem {
  return {
    id,
    kind: 'task',
    status: 'todo',
    content: [{ type: 'text', text }],
    children,
  };
}

function subtask(id: string, text: string): OutlineItem {
  return {
    id,
    kind: 'subtask',
    status: 'todo',
    content: [{ type: 'text', text }],
    children: [],
  };
}

function doc(date: string, items: OutlineItem[]): DayDocument {
  return { version: DAY_DOCUMENT_VERSION, date, items };
}

describe('segmentsToPlainText / itemTitle', () => {
  it('joins text and link segments', () => {
    expect(
      segmentsToPlainText([
        { type: 'text', text: 'hi ' },
        { type: 'link', url: 'https://x.test', text: 'there' },
      ]),
    ).toBe('hi there');
  });

  it('uses attachment name when text is empty', () => {
    expect(
      itemTitle({
        id: 'f',
        kind: 'attachment',
        content: [{ type: 'text', text: '  ' }],
        children: [],
        attachment: {
          path: 'attachments/a.png',
          mime: 'image/png',
          name: 'a.png',
          size: 1,
        },
      }),
    ).toBe('a.png');
  });

  it('falls back to Untitled', () => {
    expect(itemTitle(note('x', '   '))).toBe('Untitled');
  });
});

describe('isDayEmpty', () => {
  it('is true for blank notes only', () => {
    expect(isDayEmpty(doc('2026-01-01', [note('a', ''), note('b', '  ')]))).toBe(
      true,
    );
  });

  it('is false when any note has text', () => {
    expect(isDayEmpty(doc('2026-01-01', [note('a', 'x')]))).toBe(false);
  });

  it('is false when an attachment has a path', () => {
    expect(
      isDayEmpty(
        doc('2026-01-01', [
          {
            id: 'f',
            kind: 'attachment',
            content: [{ type: 'text', text: '' }],
            children: [],
            attachment: {
              path: 'attachments/x.png',
              mime: 'image/png',
              name: 'x.png',
              size: 10,
            },
          },
        ]),
      ),
    ).toBe(false);
  });
});

describe('extractSidebarDay / buildSidebarFromDocs', () => {
  it('collects tasks and nested subtasks', () => {
    const day = extractSidebarDay(
      doc('2026-03-15', [
        note('n', 'ignore'),
        task('t1', 'Parent', [
          subtask('s1', 'One'),
          note('mid', 'skip', [subtask('s2', 'Two')]),
        ]),
      ]),
    );
    expect(day.date).toBe('2026-03-15');
    expect(day.tasks).toEqual([
      {
        id: 't1',
        title: 'Parent',
        subtasks: [
          { id: 's1', title: 'One' },
          { id: 's2', title: 'Two' },
        ],
      },
    ]);
  });

  it('filters empty days and sorts newest first', () => {
    const sidebar = buildSidebarFromDocs([
      doc('2026-01-01', [note('a', 'old')]),
      doc('2026-01-03', [note('b', '')]),
      doc('2026-01-02', [task('t', 'mid')]),
    ]);
    expect(sidebar.map((d) => d.date)).toEqual(['2026-01-02', '2026-01-01']);
  });
});

describe('sidebarDaysEqual', () => {
  it('compares structure deeply', () => {
    const a = extractSidebarDay(doc('2026-01-01', [task('t', 'T', [subtask('s', 'S')])]));
    const b = extractSidebarDay(doc('2026-01-01', [task('t', 'T', [subtask('s', 'S')])]));
    const c = extractSidebarDay(doc('2026-01-01', [task('t', 'T', [subtask('s', 'X')])]));
    expect(sidebarDaysEqual(a, b)).toBe(true);
    expect(sidebarDaysEqual(a, c)).toBe(false);
  });
});
