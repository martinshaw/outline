import { isCompleteStatus } from './itemMeta';
import type { OutlineItem } from '../types';

export type SubtaskProgress = { total: number; complete: number };

/** Count descendant subtasks under a task (stops at nested tasks). */
export function countSubtaskProgress(task: OutlineItem): SubtaskProgress {
  let total = 0;
  let complete = 0;
  const walk = (items: OutlineItem[]) => {
    for (const child of items) {
      if (child.kind === 'subtask') {
        total += 1;
        if (isCompleteStatus(child.status)) complete += 1;
      }
      if (child.kind !== 'task' && child.children.length > 0) {
        walk(child.children);
      }
    }
  };
  walk(task.children);
  return { total, complete };
}

export function isAllSubtasksComplete(progress: SubtaskProgress): boolean {
  return progress.total > 0 && progress.complete === progress.total;
}

/** True when progress flipped from incomplete → all complete. */
export function didCompleteAllSubtasks(
  before: SubtaskProgress,
  after: SubtaskProgress,
): boolean {
  return (
    isAllSubtasksComplete(after) && !isAllSubtasksComplete(before)
  );
}

/** Nearest ancestor task for an item id (not the item itself). */
export function findOwningTask(
  items: OutlineItem[],
  itemId: string,
): OutlineItem | null {
  const search = (
    nodes: OutlineItem[],
    taskAncestor: OutlineItem | null,
  ): { found: boolean; task: OutlineItem | null } => {
    for (const node of nodes) {
      if (node.id === itemId) return { found: true, task: taskAncestor };
      const nextTask = node.kind === 'task' ? node : taskAncestor;
      const nested = search(node.children, nextTask);
      if (nested.found) return nested;
    }
    return { found: false, task: null };
  };

  const result = search(items, null);
  return result.found ? result.task : null;
}
