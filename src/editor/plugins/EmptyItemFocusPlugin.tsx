import { useEffect } from 'react';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import {
  $getSelection,
  $isRangeSelection,
  $isTextNode,
} from 'lexical';
import {
  $isOutlineItemNode,
  type OutlineItemNode,
} from '../nodes/OutlineItemNode';
import {
  $getContentChildren,
  $outlineItemFromDOM,
} from '../utils/outlineHelpers';

const DRAG_THRESHOLD_PX = 3;

function $selectEndOfItemContent(item: OutlineItemNode): void {
  const content = $getContentChildren(item);
  const last = content[content.length - 1];
  if (last) {
    last.selectEnd();
    return;
  }
  item.selectStart();
}

/** Move only the focus to the end of the item's title (shift-click extend). */
function $focusEndOfItemContent(item: OutlineItemNode): void {
  const content = $getContentChildren(item);
  const last = content[content.length - 1];
  const sel = $getSelection();
  if ($isRangeSelection(sel) && $isTextNode(last)) {
    sel.focus.set(last.getKey(), last.getTextContentSize(), 'text');
    return;
  }
  if ($isRangeSelection(sel) && last) {
    last.selectEnd();
    return;
  }
  $selectEndOfItemContent(item);
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
      child.classList.contains('outline-flex-break') ||
      child.classList.contains('outline-item')
    ) {
      continue;
    }
    right = Math.max(right, child.getBoundingClientRect().right);
  }
  return right;
}

function caretRangeFromPoint(x: number, y: number): Range | null {
  const doc = document as Document & {
    caretRangeFromPoint?: (x: number, y: number) => Range | null;
    caretPositionFromPoint?: (
      x: number,
      y: number,
    ) => { offsetNode: Node; offset: number } | null;
  };
  if (typeof doc.caretRangeFromPoint === 'function') {
    return doc.caretRangeFromPoint(x, y);
  }
  if (typeof doc.caretPositionFromPoint === 'function') {
    const pos = doc.caretPositionFromPoint(x, y);
    if (!pos) return null;
    const range = document.createRange();
    range.setStart(pos.offsetNode, pos.offset);
    range.collapse(true);
    return range;
  }
  return null;
}

/**
 * Extend the native selection focus to the caret under (x, y), keeping the
 * anchor from mousedown. Lexical picks this up via selectionchange.
 */
function extendDomSelectionToPoint(x: number, y: number): void {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return;
  const caret = caretRangeFromPoint(x, y);
  if (!caret) return;
  try {
    sel.extend(caret.startContainer, caret.startOffset);
  } catch {
    const anchorNode = sel.anchorNode;
    if (!anchorNode) return;
    const anchorOffset = sel.anchorOffset;
    const range = document.createRange();
    const a = document.createRange();
    a.setStart(anchorNode, anchorOffset);
    a.collapse(true);
    if (a.compareBoundaryPoints(Range.START_TO_START, caret) <= 0) {
      range.setStart(anchorNode, anchorOffset);
      range.setEnd(caret.startContainer, caret.startOffset);
    } else {
      range.setStart(caret.startContainer, caret.startOffset);
      range.setEnd(anchorNode, anchorOffset);
    }
    sel.removeAllRanges();
    sel.addRange(range);
  }
}

/**
 * Empty outline rows have no text hit-target. Clicks on the row (or gutter)
 * should still place a caret in that item. Clicks / drags in the trailing
 * empty space to the right of the title seed the caret at the end of the
 * line so drag-to-select works the same as starting on the last character.
 */
export function EmptyItemFocusPlugin(): null {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    let dragCleanup: (() => void) | null = null;

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
        target.closest('.outline-meta-popover') ||
        target.closest('.outline-attachment') ||
        target.closest('.outline-attachment-menu') ||
        target.closest('.outline-attachment-lightbox')
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

      const clickRightOfTitle = event.clientX > titleRowContentRight(itemEl);

      let isEmpty = false;
      editor.read(() => {
        const item = $outlineItemFromDOM(itemEl);
        if (!$isOutlineItemNode(item)) return;
        const content = $getContentChildren(item);
        isEmpty =
          content.length === 0 ||
          content.every((n) => n.getTextContent() === '');
      });

      if (!isEmpty && !clickRightOfTitle) return;

      // Empty row: place caret (no text hit target).
      if (isEmpty) {
        event.preventDefault();
        editor.focus();
        editor.update(() => {
          const item = $outlineItemFromDOM(itemEl);
          if (!$isOutlineItemNode(item)) return;
          item.selectStart();
        });
        return;
      }

      // Trailing empty space on a non-empty row: seed caret at end of title.
      // preventDefault is required (no text under the pointer), then extend
      // the selection on drag so users aren't stuck only selecting from glyphs.
      event.preventDefault();
      editor.focus();

      if (event.shiftKey) {
        editor.update(() => {
          const item = $outlineItemFromDOM(itemEl);
          if (!$isOutlineItemNode(item)) return;
          $focusEndOfItemContent(item);
        });
        return;
      }

      editor.update(() => {
        const item = $outlineItemFromDOM(itemEl);
        if (!$isOutlineItemNode(item)) return;
        $selectEndOfItemContent(item);
      });

      dragCleanup?.();
      const startX = event.clientX;
      const startY = event.clientY;
      let dragging = false;

      const onMove = (moveEvent: MouseEvent) => {
        if ((moveEvent.buttons & 1) === 0) {
          cleanup();
          return;
        }
        const dx = moveEvent.clientX - startX;
        const dy = moveEvent.clientY - startY;
        if (
          !dragging &&
          dx * dx + dy * dy < DRAG_THRESHOLD_PX * DRAG_THRESHOLD_PX
        ) {
          return;
        }
        dragging = true;
        extendDomSelectionToPoint(moveEvent.clientX, moveEvent.clientY);
      };

      const cleanup = () => {
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', cleanup);
        dragCleanup = null;
      };

      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', cleanup);
      dragCleanup = cleanup;
    };

    const unregister = editor.registerRootListener((rootEl, prev) => {
      if (prev) prev.removeEventListener('mousedown', onMouseDown);
      if (rootEl) rootEl.addEventListener('mousedown', onMouseDown);
    });

    return () => {
      dragCleanup?.();
      unregister();
    };
  }, [editor]);

  return null;
}
