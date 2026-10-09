import type { DayDocument, OutlineItem } from '../types';

export type EntityOccurrence = {
  date: string;
  itemId: string;
  kind: OutlineItem['kind'];
};

/**
 * Find tasks/subtasks across day docs that reference a workspace entity.
 * Foundation for “related by shared entity” views.
 */
export function findEntityOccurrences(
  docs: Iterable<DayDocument>,
  entityId: string,
): EntityOccurrence[] {
  const out: EntityOccurrence[] = [];

  const walk = (date: string, item: OutlineItem) => {
    if (item.kind === 'task' || item.kind === 'subtask') {
      const refs = item.entities ?? item.people ?? [];
      if (refs.includes(entityId)) {
        out.push({ date, itemId: item.id, kind: item.kind });
      }
    }
    for (const child of item.children) walk(date, child);
  };

  for (const doc of docs) {
    for (const item of doc.items) walk(doc.date, item);
  }
  return out;
}
