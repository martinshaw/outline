import { useEffect } from 'react';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import {
  COMMAND_PRIORITY_CRITICAL,
  INSERT_PARAGRAPH_COMMAND,
  KEY_ENTER_COMMAND,
} from 'lexical';
import { mergeRegister } from '@lexical/utils';
import {
  getDefaultStatusId,
  getSettings,
} from '../../settings/settingsStore';
import { isRoleKind } from '../../types';
import type { OutlineItemNode } from '../nodes/OutlineItemNode';
import {
  $getMoveTargets,
  $getNearestTaskParent,
  $getSelectedOutlineItem,
} from '../utils/outlineHelpers';

function $cycleStatusOrDemote(item: OutlineItemNode): void {
  const statuses = getSettings().statuses;
  if (statuses.length === 0) {
    item.setKind('note');
    return;
  }
  const current = item.getStatus() ?? statuses[0].id;
  const idx = statuses.findIndex((s) => s.id === current);
  const nextIdx = idx >= 0 ? idx + 1 : 0;
  // After the last status, clear task/subtask back to a normal note.
  if (nextIdx >= statuses.length) {
    item.setKind('note');
    return;
  }
  item.setStatus(statuses[nextIdx].id);
}

function $promoteOrCycle(item: OutlineItemNode): void {
  const kind = item.getKind();

  // Attachments keep their file payload — don't convert to task/note.
  if (kind === 'attachment') return;

  if (isRoleKind(kind)) {
    $cycleStatusOrDemote(item);
    return;
  }

  // Note / heading → task (or subtask when nested under a task)
  const underTask = $getNearestTaskParent(item) !== null;
  const status = getDefaultStatusId();
  if (underTask) {
    item.setHeading(null);
    item.setKind('subtask');
    item.setStatus(status);
  } else {
    item.setHeading(null);
    item.setKind('task');
    item.setStatus(status);
  }
}

function $toggleRole(): boolean {
  const targets = $getMoveTargets();
  if (targets.length > 0) {
    for (const item of targets) $promoteOrCycle(item);
    return true;
  }
  const item = $getSelectedOutlineItem();
  if (!item) return false;
  $promoteOrCycle(item);
  return true;
}

/**
 * ⌘/Ctrl+Enter promotes a note to task/subtask, cycles status on
 * task/subtask items, then demotes to a note after the last status.
 * Capture-phase keydown stops Enter before Lexical's insert-paragraph path.
 */
export function RolePlugin(): null {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    let cmdEnterPressed = false;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Enter') return;
      if (!(event.metaKey || event.ctrlKey)) return;

      cmdEnterPressed = true;
      event.preventDefault();
      event.stopPropagation();

      editor.update(() => {
        $toggleRole();
      });

      queueMicrotask(() => {
        cmdEnterPressed = false;
      });
    };

    return mergeRegister(
      editor.registerCommand(
        KEY_ENTER_COMMAND,
        (event) => {
          if (!(event?.metaKey || event?.ctrlKey) && !cmdEnterPressed) {
            return false;
          }
          event?.preventDefault();
          return true;
        },
        COMMAND_PRIORITY_CRITICAL,
      ),
      editor.registerCommand(
        INSERT_PARAGRAPH_COMMAND,
        () => cmdEnterPressed,
        COMMAND_PRIORITY_CRITICAL,
      ),
      editor.registerRootListener((root, prev) => {
        if (prev) prev.removeEventListener('keydown', onKeyDown, true);
        if (root) root.addEventListener('keydown', onKeyDown, true);
      }),
    );
  }, [editor]);

  return null;
}
