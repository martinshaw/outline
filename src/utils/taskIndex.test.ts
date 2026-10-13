import { describe, expect, it } from 'vitest';
import { DAY_DOCUMENT_VERSION } from '../types';
import type { DayDocument, OutlineItem } from '../types';
import type { StatusDef } from '../settings/types';
import {
  filterTasks,
  groupTasksByStatus,
  indexTasks,
  resolveColumnStatusId,
  sortTasks,
  type IndexedTask,
  type TaskFilters,
} from './taskIndex';

function task(
  id: string,
  text: string,
  extras: Partial<OutlineItem> = {},
  children: OutlineItem[] = [],
): OutlineItem {
  return {
    id,
    kind: 'task',
    status: extras.status ?? 'todo',
    deadline: extras.deadline ?? null,
    entities: extras.entities ?? [],
    content: [{ type: 'text', text }],
    children,
  };
}

function subtask(
  id: string,
  text: string,
  extras: Partial<OutlineItem> = {},
): OutlineItem {
  return {
    id,
    kind: 'subtask',
    status: extras.status ?? 'todo',
    deadline: extras.deadline ?? null,
    entities: extras.entities ?? [],
    content: [{ type: 'text', text }],
    children: [],
  };
}

const docs: DayDocument[] = [
  {
    version: DAY_DOCUMENT_VERSION,
    date: '2026-10-01',
    items: [
      task('t1', 'Alpha', { status: 'todo', deadline: '2026-10-09' }, [
        subtask('s1', 'Alpha child', { status: 'done' }),
      ]),
    ],
  },
  {
    version: DAY_DOCUMENT_VERSION,
    date: '2026-10-05',
    items: [
      task('t2', 'Beta search', {
        status: 'doing',
        deadline: '2026-12-01',
      }),
    ],
  },
];

const baseFilters = (): TaskFilters => ({
  query: '',
  kind: 'all',
  statuses: [],
  entities: [],
  deadline: 'any',
  hideCompleted: false,
});

describe('indexTasks', () => {
  it('flattens tasks and subtasks with parent info', () => {
    const indexed = indexTasks(docs);
    expect(indexed.map((t) => t.itemId)).toEqual(['t1', 's1', 't2']);
    const child = indexed.find((t) => t.itemId === 's1')!;
    expect(child.kind).toBe('subtask');
    expect(child.parentTaskId).toBe('t1');
    expect(child.parentTaskTitle).toBe('Alpha');
  });
});

describe('filterTasks', () => {
  const indexed = indexTasks(docs);

  it('filters by query against title', () => {
    const hit = filterTasks(indexed, { ...baseFilters(), query: 'search' });
    expect(hit.map((t) => t.itemId)).toEqual(['t2']);
  });

  it('filters by kind', () => {
    const onlySub = filterTasks(indexed, {
      ...baseFilters(),
      kind: 'subtask',
    });
    expect(onlySub.map((t) => t.itemId)).toEqual(['s1']);
  });

  it('filters by status', () => {
    const doing = filterTasks(indexed, {
      ...baseFilters(),
      statuses: ['doing'],
    });
    expect(doing.map((t) => t.itemId)).toEqual(['t2']);
  });

  it('hides completed when requested', () => {
    const open = filterTasks(indexed, {
      ...baseFilters(),
      hideCompleted: true,
    });
    expect(open.map((t) => t.itemId)).toEqual(['t1', 't2']);
  });

  it('filters overdue deadlines', () => {
    const overdue = filterTasks(
      indexed,
      { ...baseFilters(), deadline: 'overdue' },
      new Date(2026, 9, 10),
    );
    expect(overdue.map((t) => t.itemId)).toEqual(['t1']);
  });
});

describe('sortTasks', () => {
  it('sorts by title asc/desc', () => {
    const rows: IndexedTask[] = indexTasks(docs);
    const asc = sortTasks(rows, { key: 'title', dir: 'asc' }).map(
      (t) => t.title,
    );
    expect(asc[0]).toBe('Alpha');
    const desc = sortTasks(rows, { key: 'title', dir: 'desc' }).map(
      (t) => t.title,
    );
    expect(desc[0]).toBe('Beta search');
  });

  it('sorts by date', () => {
    const rows = indexTasks(docs).filter((t) => t.kind === 'task');
    const asc = sortTasks(rows, { key: 'date', dir: 'asc' }).map((t) => t.date);
    expect(asc).toEqual(['2026-10-01', '2026-10-05']);
  });
});

describe('groupTasksByStatus', () => {
  const statuses: StatusDef[] = [
    { id: 'todo', label: 'To do', color: '#3b82f6' },
    { id: 'doing', label: 'Doing', color: '#d97706' },
    { id: 'done', label: 'Done', color: '#16a34a' },
  ];

  it('buckets tasks into configured status columns', () => {
    const indexed = indexTasks(docs);
    const columns = groupTasksByStatus(indexed, statuses);
    expect(columns.map((c) => c.statusId)).toEqual(['todo', 'doing', 'done']);
    expect(columns[0].tasks.map((t) => t.itemId)).toEqual(['t1']);
    expect(columns[1].tasks.map((t) => t.itemId)).toEqual(['t2']);
    expect(columns[2].tasks.map((t) => t.itemId)).toEqual(['s1']);
  });

  it('orders cards in a column by date desc then title', () => {
    const rows: IndexedTask[] = [
      {
        date: '2026-10-01',
        itemId: 'old',
        kind: 'task',
        title: 'Zebra',
        status: 'todo',
        deadline: null,
        entities: [],
        entityLabels: '',
        parentTaskId: null,
        parentTaskTitle: null,
      },
      {
        date: '2026-10-05',
        itemId: 'new',
        kind: 'task',
        title: 'Alpha',
        status: 'todo',
        deadline: null,
        entities: [],
        entityLabels: '',
        parentTaskId: null,
        parentTaskTitle: null,
      },
      {
        date: '2026-10-05',
        itemId: 'new2',
        kind: 'task',
        title: 'Beta',
        status: 'todo',
        deadline: null,
        entities: [],
        entityLabels: '',
        parentTaskId: null,
        parentTaskTitle: null,
      },
    ];
    const [todo] = groupTasksByStatus(rows, statuses);
    expect(todo.tasks.map((t) => t.itemId)).toEqual(['new', 'new2', 'old']);
  });

  it('maps unknown / null status to the first column', () => {
    expect(resolveColumnStatusId(null, statuses)).toBe('todo');
    expect(resolveColumnStatusId('nope', statuses)).toBe('todo');
    const rows: IndexedTask[] = [
      {
        date: '2026-10-01',
        itemId: 'x',
        kind: 'task',
        title: 'Mystery',
        status: null,
        deadline: null,
        entities: [],
        entityLabels: '',
        parentTaskId: null,
        parentTaskTitle: null,
      },
    ];
    const columns = groupTasksByStatus(rows, statuses);
    expect(columns[0].tasks.map((t) => t.itemId)).toEqual(['x']);
    expect(columns[1].tasks).toHaveLength(0);
  });
});
