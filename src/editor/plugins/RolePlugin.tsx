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
import type { OutlineItemNode } from '../nodes/OutlineItemNode';
import {
  $getMoveTargets,
  $getNearestProjectParent,
  $getSelectedOutlineItem,
} from '../utils/outlineHelpers';

function $cycleStatus(item: OutlineItemNode): void {
  const statuses = getSettings().statuses;
  if (statuses.length === 0) return;
  const current = item.getStatus() ?? statuses[0].id;
  const idx = statuses.findIndex((s) => s.id === current);
  const next = statuses[(idx >= 0 ? idx + 1 : 0) % statuses.length];
  item.setStatus(next.id);
}

function $promoteOrCycle(item: OutlineItemNode): void {
  const kind = item.getKind();

  if (kind === 'project' || kind === 'task') {
    $cycleStatus(item);
    return;
  }

  // Note / heading → project (or task when nested under a project)
  const underProject = $getNearestProjectParent(item) !== null;
  const status = getDefaultStatusId();
  if (underProject) {
    item.setHeading(null);
    item.setKind('task');
    item.setStatus(status);
  } else {
    item.setHeading(null);
    item.setKind('project');
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
 * ⌘/Ctrl+Enter promotes a note to project/task, or cycles status on
 * project/task items. Capture-phase keydown stops Enter before Lexical's
 * insert-paragraph path.
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
