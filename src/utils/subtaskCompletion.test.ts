import { describe, expect, it } from 'vitest';
import type { OutlineItem } from '../types';
import {
  countSubtaskProgress,
  didCompleteAllSubtasks,
  findOwningTask,
} from './subtaskCompletion';

function item(
  partial: Partial<OutlineItem> & Pick<OutlineItem, 'id' | 'kind'>,
): OutlineItem {
  return {
    id: partial.id,
    kind: partial.kind,
    status: partial.status ?? null,
    headingLevel: partial.headingLevel ?? null,
    deadline: partial.deadline ?? null,
    entities: partial.entities ?? [],
    attachment: partial.attachment ?? null,
    content: partial.content ?? [{ type: 'text', text: '' }],
    children: partial.children ?? [],
  };
}

describe('countSubtaskProgress', () => {
  it('counts subtasks and stops at nested tasks', () => {
    const task = item({
      id: 't1',
      kind: 'task',
      children: [
        item({ id: 's1', kind: 'subtask', status: 'done' }),
        item({ id: 's2', kind: 'subtask', status: 'todo' }),
        item({
          id: 'n1',
          kind: 'note',
          children: [item({ id: 's3', kind: 'subtask', status: 'done' })],
        }),
        item({
          id: 't2',
          kind: 'task',
          children: [item({ id: 's4', kind: 'subtask', status: 'done' })],
        }),
      ],
    });
    expect(countSubtaskProgress(task)).toEqual({ total: 3, complete: 2 });
  });
});

describe('didCompleteAllSubtasks', () => {
  it('detects the incomplete → complete transition', () => {
    expect(
      didCompleteAllSubtasks(
        { total: 2, complete: 1 },
        { total: 2, complete: 2 },
      ),
    ).toBe(true);
    expect(
      didCompleteAllSubtasks(
        { total: 2, complete: 2 },
        { total: 2, complete: 2 },
      ),
    ).toBe(false);
    expect(
      didCompleteAllSubtasks(
        { total: 0, complete: 0 },
        { total: 0, complete: 0 },
      ),
    ).toBe(false);
  });
});

describe('findOwningTask', () => {
  it('returns the nearest ancestor task', () => {
    const tree = [
      item({
        id: 't1',
        kind: 'task',
        children: [
          item({ id: 's1', kind: 'subtask' }),
          item({
            id: 'n1',
            kind: 'note',
            children: [item({ id: 's2', kind: 'subtask' })],
          }),
        ],
      }),
    ];
    expect(findOwningTask(tree, 's1')?.id).toBe('t1');
    expect(findOwningTask(tree, 's2')?.id).toBe('t1');
    expect(findOwningTask(tree, 't1')).toBeNull();
  });
});
