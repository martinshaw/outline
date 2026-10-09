import { useEffect } from 'react';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { $getRoot } from 'lexical';
import {
  $isOutlineItemNode,
  type OutlineItemNode,
} from '../nodes/OutlineItemNode';
import {
  $findOutlineItemById,
  $getContentChildren,
} from '../utils/outlineHelpers';

function $selectEndOfItemContent(item: OutlineItemNode): void {
  const content = $getContentChildren(item);
  const last = content[content.length - 1];
  if (last) {
    last.selectEnd();
    return;
  }
  item.selectStart();
}

/** Right edge of title text / tagline on the item's first row. */
function titleRowContentRight(itemEl: HTMLElement): number {
  let right = itemEl.getBoundingClientRect().left;
  for (const sel of [
    ':scope > .outline-status-chip',
    ':scope > .outline-meta',
    ':scope > .outline-subtask-progress',
  ]) {
    const el = itemEl.querySelector<HTMLElement>(sel);
    if (!el) continue;
    const style = getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden') continue;
    right = Math.max(right, el.getBoundingClientRect().right);
  }
  for (const child of itemEl.children) {
    if (!(child instanceof HTMLElement)) continue;
    if (
      child.classList.contains('outline-meta') ||
      child.classList.contains('outline-subtask-progress') ||
      child.classList.contains('outline-status-chip') ||
      child.classList.contains('outline-item')
    ) {
      continue;
    }
    right = Math.max(right, child.getBoundingClientRect().right);
  }
  return right;
}

/**
 * Empty outline rows have no text hit-target. Clicks on the row (or gutter)
 * should still place a caret in that item. Clicks to the right of the
 * deadline/entities tagline place the caret at the end of the title.
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
        target.closest('.outline-status-menu') ||
        target.closest('.outline-meta') ||
        target.closest('.outline-meta-popover')
      ) {
        return;
      }

      const itemEl = target.closest<HTMLElement>('.outline-item');
      if (!itemEl || !root.contains(itemEl)) return;

      // Click landed on real editable content — let Lexical handle it.
      // Bullet/kind label are pseudo-elements (clicks hit .outline-item).
      if (target !== itemEl) {
        const tag = target.tagName;
        if (tag !== 'BR') return;
      }

      const outlineId = itemEl.getAttribute('data-outline-id');
      if (!outlineId) return;

      const clickRightOfTitle = event.clientX > titleRowContentRight(itemEl);

      let isEmpty = false;
      editor.getEditorState().read(() => {
        const item = $findOutlineItemById($getRoot(), outlineId);
        if (!$isOutlineItemNode(item)) return;
        const content = $getContentChildren(item);
        isEmpty =
          content.length === 0 ||
          content.every((n) => n.getTextContent() === '');
      });

      if (!isEmpty && !clickRightOfTitle) return;

      event.preventDefault();
      editor.focus();
      editor.update(() => {
        const item = $findOutlineItemById($getRoot(), outlineId);
        if (!$isOutlineItemNode(item)) return;
        if (clickRightOfTitle) $selectEndOfItemContent(item);
        else item.selectStart();
      });
    };

    return editor.registerRootListener((rootEl, prev) => {
      if (prev) prev.removeEventListener('mousedown', onMouseDown);
      if (rootEl) rootEl.addEventListener('mousedown', onMouseDown);
    });
  }, [editor]);

  return null;
}
