import { fireTaskCompleteConfetti } from '../../utils/confetti';
import { isCompleteStatus } from '../../utils/itemMeta';
import type { OutlineItemNode } from '../nodes/OutlineItemNode';
import { $getNearestTaskParent } from './outlineHelpers';

/**
 * Set status on a role item; if that finishes every subtask under the
 * owning task, fire confetti after the Lexical update commits.
 */
export function $setStatusMaybeCelebrate(
  item: OutlineItemNode,
  statusId: string,
): void {
  const parentTask =
    item.getKind() === 'subtask' ? $getNearestTaskParent(item) : null;

  if (!parentTask) {
    item.setStatus(statusId);
    return;
  }

  const { total, complete } = parentTask.getSubtaskProgress();
  const wasComplete = isCompleteStatus(item.getStatus());
  const willBeComplete = isCompleteStatus(statusId);

  item.setStatus(statusId);

  if (total <= 0) return;

  let nextComplete = complete;
  if (!wasComplete && willBeComplete) nextComplete += 1;
  else if (wasComplete && !willBeComplete) nextComplete -= 1;

  if (nextComplete === total && complete < total) {
    // Defer past Lexical DOM commit so the canvas paints above the editor.
    window.setTimeout(() => fireTaskCompleteConfetti(), 0);
  }
}
