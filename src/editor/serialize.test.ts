import { describe, expect, it, beforeEach } from 'vitest';
import { DAY_DOCUMENT_VERSION, normalizeDayDocument } from '../types';
import { editorToDayDocument, $loadDayDocument } from './serialize';
import {
  createOutlineTestEditor,
  dayDoc,
  item,
  resetBlockSelectionStore,
  setupEditor,
  textSeg,
} from './test/harness';

beforeEach(() => {
  resetBlockSelectionStore();
});

describe('serialize round-trip', () => {
  it('preserves nested notes, text, and empty children arrays', () => {
    const doc = dayDoc([
      item('root', 'Hello', [
        item('child', 'World'),
        item('empty', ''),
      ]),
    ]);
    const editor = setupEditor(doc);
    const out = editorToDayDocument(editor, doc.date);
    expect(out.version).toBe(DAY_DOCUMENT_VERSION);
    expect(out.date).toBe(doc.date);
    expect(out.items).toHaveLength(1);
    expect(out.items[0].id).toBe('root');
    expect(out.items[0].content).toEqual(textSeg('Hello'));
    expect(out.items[0].children.map((c) => c.id)).toEqual(['child', 'empty']);
    expect(out.items[0].children[1].content).toEqual(textSeg(''));
  });

  it('preserves task/subtask role fields', () => {
    const doc = dayDoc([
      item('t1', 'Ship it', [item('s1', 'Write tests', [], { kind: 'subtask', status: 'doing' })], {
        kind: 'task',
        status: 'todo',
        deadline: '2026-10-12',
        entities: [],
      }),
    ]);
    const editor = setupEditor(doc);
    const out = editorToDayDocument(editor, doc.date);
    expect(out.items[0].kind).toBe('task');
    expect(out.items[0].status).toBe('todo');
    expect(out.items[0].deadline).toBe('2026-10-12');
    expect(out.items[0].children[0].kind).toBe('subtask');
    expect(out.items[0].children[0].status).toBe('doing');
  });

  it('preserves heading levels', () => {
    const doc = dayDoc([
      item('h', 'Title', [], { kind: 'heading', headingLevel: 2 }),
    ]);
    const editor = setupEditor(doc);
    const out = editorToDayDocument(editor, doc.date);
    expect(out.items[0].kind).toBe('heading');
    expect(out.items[0].headingLevel).toBe(2);
  });

  it('preserves attachment metadata', () => {
    const doc = dayDoc([
      item('f', '', [], {
        kind: 'attachment',
        attachment: {
          path: 'attachments/poster.png',
          mime: 'image/png',
          name: 'poster.png',
          size: 1234,
          displaySize: 'medium',
        },
      }),
    ]);
    const editor = setupEditor(doc);
    const out = editorToDayDocument(editor, doc.date);
    expect(out.items[0].kind).toBe('attachment');
    expect(out.items[0].attachment).toMatchObject({
      path: 'attachments/poster.png',
      mime: 'image/png',
      name: 'poster.png',
      displaySize: 'medium',
    });
  });

  it('preserves bold/italic/underline marks', () => {
    const doc = dayDoc([
      item('x', '', [], {
        content: [
          { type: 'text', text: 'bold', format: { bold: true } },
          { type: 'text', text: ' ' },
          { type: 'text', text: 'ital', format: { italic: true } },
          { type: 'text', text: ' ' },
          { type: 'text', text: 'under', format: { underline: true } },
        ],
      }),
    ]);
    const editor = setupEditor(doc);
    const out = editorToDayDocument(editor, doc.date);
    expect(out.items[0].content).toEqual([
      { type: 'text', text: 'bold', format: { bold: true } },
      { type: 'text', text: ' ' },
      { type: 'text', text: 'ital', format: { italic: true } },
      { type: 'text', text: ' ' },
      { type: 'text', text: 'under', format: { underline: true } },
    ]);
  });

  it('preserves links', () => {
    const doc = dayDoc([
      item('x', '', [], {
        content: [
          { type: 'text', text: 'see ' },
          { type: 'link', url: 'https://example.com', text: 'ex' },
        ],
      }),
    ]);
    const editor = setupEditor(doc);
    const out = editorToDayDocument(editor, doc.date);
    expect(out.items[0].content).toEqual([
      { type: 'text', text: 'see ' },
      { type: 'link', url: 'https://example.com', text: 'ex' },
    ]);
  });

  it('loads an empty document as a single empty note', () => {
    const editor = createOutlineTestEditor();
    editor.update(
      () => {
        $loadDayDocument(dayDoc([]));
      },
      { discrete: true },
    );
    const out = editorToDayDocument(editor, '2026-10-10');
    expect(out.items).toHaveLength(1);
    expect(out.items[0].kind).toBe('note');
    expect(out.items[0].content).toEqual(textSeg(''));
  });

  it('round-trips a deep tree without reordering', () => {
    const doc = dayDoc([
      item('a', 'A', [
        item('a1', 'A1', [item('a1a', 'A1a'), item('a1b', 'A1b')]),
        item('a2', 'A2'),
      ]),
      item('b', 'B'),
    ]);
    const editor = setupEditor(doc);
    const out = editorToDayDocument(editor, doc.date);
    expect(out.items.map((i) => i.id)).toEqual(['a', 'b']);
    expect(out.items[0].children.map((i) => i.id)).toEqual(['a1', 'a2']);
    expect(out.items[0].children[0].children.map((i) => i.id)).toEqual([
      'a1a',
      'a1b',
    ]);
  });
});

describe('normalizeDayDocument', () => {
  it('migrates v1 project/task kinds to task/subtask', () => {
    const normalized = normalizeDayDocument({
      version: 1,
      date: '2026-01-01',
      items: [
        {
          id: 'p',
          kind: 'project' as 'note',
          content: textSeg('P'),
          children: [
            {
              id: 't',
              kind: 'task' as 'note',
              content: textSeg('T'),
              children: [],
            },
          ],
        },
      ],
    });
    expect(normalized?.items[0].kind).toBe('task');
    expect(normalized?.items[0].children[0].kind).toBe('subtask');
    expect(normalized?.version).toBe(DAY_DOCUMENT_VERSION);
  });

  it('rejects invalid documents', () => {
    expect(normalizeDayDocument(null)).toBeNull();
    expect(normalizeDayDocument({ version: 3, date: '2026-01-01' })).toBeNull();
    expect(normalizeDayDocument({ version: 2, date: '' })).toBeNull();
  });
});
