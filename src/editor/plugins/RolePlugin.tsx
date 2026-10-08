import { useEffect } from 'react';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import {
  COMMAND_PRIORITY_CRITICAL,
  INSERT_PARAGRAPH_COMMAND,
  KEY_ENTER_COMMAND,
} from 'lexical';
import { mergeRegister } from '@lexical/utils';
import type { OutlineItemNode } from '../nodes/OutlineItemNode';
import {
  $getMoveTargets,
  $getNearestProjectParent,
  $getSelectedOutlineItem,
} from '../utils/outlineHelpers';

function $toggleItemRole(item: OutlineItemNode): void {
  const underProject = $getNearestProjectParent(item) !== null;
  const kind = item.getKind();

  if (underProject) {
    item.setKind(kind === 'task' ? 'note' : 'task');
  } else if (kind === 'project') {
    item.setKind('note');
  } else {
    item.setKind('project');
  }
}

function $toggleRole(): boolean {
  const targets = $getMoveTargets();
  if (targets.length > 0) {
    for (const item of targets) $toggleItemRole(item);
    return true;
  }
  const item = $getSelectedOutlineItem();
  if (!item) return false;
  $toggleItemRole(item);
  return true;
}

/**
 * ⌘/Ctrl+Enter toggles project/task and must not create a new sibling.
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
          // Already handled in capture keydown; just swallow
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
