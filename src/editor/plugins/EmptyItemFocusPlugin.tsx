import { useEffect } from 'react';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { $getRoot } from 'lexical';
import { $isOutlineItemNode } from '../nodes/OutlineItemNode';
import {
  $findOutlineItemById,
  $getContentChildren,
} from '../utils/outlineHelpers';

/**
 * Empty outline rows have no text hit-target. Clicks on the row (or gutter)
 * should still place a caret in that item.
 */
export function EmptyItemFocusPlugin(): null {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    const onMouseDown = (event: MouseEvent) => {
      if (event.button !== 0) return;
      const root = editor.getRootElement();
      if (!root) return;
      const target = event.target;
      if (!(target instanceof Element) || !root.contains(target)) return;
      if (
        target.closest('.outline-status-chip') ||
        target.closest('.outline-status-menu')
      ) {
        return;
      }

      const itemEl = target.closest<HTMLElement>('.outline-item');
      if (!itemEl || !root.contains(itemEl)) return;

      // Click landed on real editable content — let Lexical handle it.
      if (
        target !== itemEl &&
        !target.classList.contains('outline-bullet') &&
        !target.classList.contains('outline-item')
      ) {
        const tag = target.tagName;
        if (tag !== 'BR') return;
      }

      const outlineId = itemEl.getAttribute('data-outline-id');
      if (!outlineId) return;

      let shouldFocus = false;
      editor.getEditorState().read(() => {
        const item = $findOutlineItemById($getRoot(), outlineId);
        if (!$isOutlineItemNode(item)) return;
        const content = $getContentChildren(item);
        shouldFocus =
          content.length === 0 ||
          content.every((n) => n.getTextContent() === '');
      });
      if (!shouldFocus) return;

      event.preventDefault();
      editor.focus();
      editor.update(() => {
        const item = $findOutlineItemById($getRoot(), outlineId);
        if ($isOutlineItemNode(item)) item.selectStart();
      });
    };

    return editor.registerRootListener((rootEl, prev) => {
      if (prev) prev.removeEventListener('mousedown', onMouseDown);
      if (rootEl) rootEl.addEventListener('mousedown', onMouseDown);
    });
  }, [editor]);

  return null;
}
