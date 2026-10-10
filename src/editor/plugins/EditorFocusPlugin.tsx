import { useEffect } from 'react';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import {
  $getRoot,
  $isTextNode,
  $createRangeSelection,
  $setSelection,
  COMMAND_PRIORITY_HIGH,
  SELECT_ALL_COMMAND,
} from 'lexical';
import {
  setBlockSelectedIds,
  setBlockSelfOnlyIds,
} from '../blockSelectionStore';
import { $collectOutlineItemsDFS } from '../utils/outlineHelpers';
import { $isOutlineItemNode } from '../nodes/OutlineItemNode';

function isUiChromeTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  return Boolean(
    target.closest(
      [
        'input',
        'textarea',
        'select',
        'button',
        'a',
        '[role="dialog"]',
        '.sidebar',
        '.sidebar-backdrop',
        '.app-hints',
        '.settings-overlay',
        '.shortcuts-overlay',
        '.command-palette-overlay',
        '.debug-overlay',
        '.toast-host',
        '.gate',
        '.outline-status-chip',
        '.outline-status-menu',
        '.outline-meta',
        '.outline-meta-popover',
        '.outline-attachment',
        '.outline-attachment-menu',
        '.outline-attachment-lightbox',
      ].join(','),
    ),
  );
}

/**
 * Select every top-level outline row (block chrome) and the full text range
 * so replace-on-type / copy still work. Avoids Lexical `$selectAll`'s root
 * element selection, which can insert empty paragraph artifacts.
 */
function $selectAllOutline(): boolean {
  const items = $collectOutlineItemsDFS($getRoot());
  if (items.length === 0) return false;

  const topLevel = items.filter((item) => {
    const parent = item.getParent();
    return !$isOutlineItemNode(parent);
  });
  setBlockSelectedIds(topLevel.map((item) => item.getId()));
  setBlockSelfOnlyIds([]);

  const firstItem = items[0];
  const lastItem = items[items.length - 1];
  const start = firstItem.getFirstDescendant() ?? firstItem;
  const end = lastItem.getLastDescendant() ?? lastItem;

  const sel = $createRangeSelection();
  if ($isTextNode(start)) {
    sel.anchor.set(start.getKey(), 0, 'text');
  } else {
    sel.anchor.set(firstItem.getKey(), 0, 'element');
  }
  if ($isTextNode(end)) {
    sel.focus.set(end.getKey(), end.getTextContentSize(), 'text');
  } else {
    sel.focus.set(lastItem.getKey(), lastItem.getChildrenSize(), 'element');
  }
  $setSelection(sel);
  return true;
}

/**
 * Keep the Lexical document focused for editing shortcuts (e.g. ⌘A), except
 * when the user is interacting with menus, sidebar, dialogs, or form fields.
 */
export function EditorFocusPlugin(): null {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    return editor.registerCommand(
      SELECT_ALL_COMMAND,
      (event) => {
        event?.preventDefault();
        editor.update(() => {
          $selectAllOutline();
        });
        return true;
      },
      COMMAND_PRIORITY_HIGH,
    );
  }, [editor]);

  useEffect(() => {
    const onMouseDown = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (isUiChromeTarget(target)) return;
      if (target.closest('.editor-input')) return;
      if (target.closest('.main, .editor-shell')) {
        event.preventDefault();
        editor.focus();
      }
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey)) return;
      if (event.key.toLowerCase() !== 'a') return;
      if (event.altKey || event.shiftKey) return;

      const target = event.target;
      if (target instanceof Element) {
        if (
          target.closest(
            'input, textarea, select, [role="dialog"], .settings-overlay, .shortcuts-overlay, .command-palette-overlay',
          )
        ) {
          return;
        }
      }

      // Stop Lexical's root listener from dispatching SELECT_ALL a second time.
      event.preventDefault();
      event.stopImmediatePropagation();
      editor.focus();
      editor.dispatchCommand(SELECT_ALL_COMMAND, event);
    };

    window.addEventListener('mousedown', onMouseDown, true);
    window.addEventListener('keydown', onKeyDown, true);
    return () => {
      window.removeEventListener('mousedown', onMouseDown, true);
      window.removeEventListener('keydown', onKeyDown, true);
    };
  }, [editor]);

  return null;
}
