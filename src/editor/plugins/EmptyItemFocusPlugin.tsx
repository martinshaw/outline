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
    // Empty “Deadline · Entities” hint is visual-only for hit-testing: clicks in
    // that band (and past it) should still count as end-of-line.
    if (el.classList.contains('outline-meta--empty')) continue;
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

/** Right edge of Lexical title content only (excludes chip / meta). */
function titleTextRight(itemEl: HTMLElement): number {
  let right = itemEl.getBoundingClientRect().left;
  for (const child of itemEl.children) {
    if (!(child instanceof HTMLElement)) continue;
    if (
      child.classList.contains('outline-meta') ||
      child.classList.contains('outline-subtask-progress') ||
      child.classList.contains('outline-status-chip') ||
      child.classList.contains('outline-flex-break') ||
      child.classList.contains('outline-item') ||
      child.classList.contains('outline-attachment')
    ) {
      continue;
    }
    right = Math.max(right, child.getBoundingClientRect().right);
  }
  return right;
}

/** Vertical band of the title row (chip + text + meta/progress), excluding nested children. */
function titleRowBand(itemEl: HTMLElement): { top: number; bottom: number } {
  const top = itemEl.getBoundingClientRect().top;
  let bottom = top;
  for (const sel of [
    ':scope > .outline-status-chip',
    ':scope > .outline-meta',
    ':scope > .outline-subtask-progress',
  ]) {
    const el = itemEl.querySelector<HTMLElement>(sel);
    if (!el) continue;
    const style = getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden') continue;
    bottom = Math.max(bottom, el.getBoundingClientRect().bottom);
  }
  for (const child of itemEl.children) {
    if (!(child instanceof HTMLElement)) continue;
    if (
      child.classList.contains('outline-meta') ||
      child.classList.contains('outline-subtask-progress') ||
      child.classList.contains('outline-status-chip') ||
      child.classList.contains('outline-flex-break') ||
      child.classList.contains('outline-item') ||
      child.classList.contains('outline-attachment')
    ) {
      continue;
    }
    bottom = Math.max(bottom, child.getBoundingClientRect().bottom);
  }
  const line =
    parseFloat(getComputedStyle(itemEl).lineHeight) ||
    parseFloat(getComputedStyle(itemEl).fontSize) * 1.4 ||
    22;
  // Empty rows still need a clickable title band before nested children.
  bottom = Math.max(bottom, top + line * 1.15);
  // Never extend into the first nested row's title.
  const firstNested = [...itemEl.children].find(
    (ch): ch is HTMLElement =>
      ch instanceof HTMLElement && ch.classList.contains('outline-item'),
  );
  if (firstNested) {
    const nestedTop = firstNested.getBoundingClientRect().top;
    if (nestedTop > top) bottom = Math.min(bottom, nestedTop - 1);
  }
  return { top, bottom };
}

/**
 * Prefer the outline row whose title band contains (x,y), walking up from the
 * innermost hit. Stops nested children from stealing end-of-parent clicks.
 */
function outlineItemForPointer(
  target: Element,
  x: number,
  y: number,
): HTMLElement | null {
  let el = target.closest<HTMLElement>('.outline-item');
  if (!el) return null;

  const chain: HTMLElement[] = [];
  let cur: HTMLElement | null = el;
  while (cur) {
    chain.push(cur);
    cur = cur.parentElement?.closest('.outline-item') ?? null;
  }

  // End-of-line on an ancestor: pointer is past that row's title and still
  // above (or only barely into) the first nested child — don't let the child
  // steal the click (common when caretRangeFromPoint / hit-testing drops down).
  for (let i = chain.length - 1; i >= 0; i--) {
    const item = chain[i];
    const firstNested = [...item.children].find(
      (ch): ch is HTMLElement =>
        ch instanceof HTMLElement && ch.classList.contains('outline-item'),
    );
    if (!firstNested) continue;
    const rowRight = titleRowContentRight(item);
    if (x <= rowRight) continue;
    const { top, bottom } = titleRowBand(item);
    const nestedTop = firstNested.getBoundingClientRect().top;
    if (y >= top && y <= Math.max(bottom, nestedTop) + 2) return item;
  }

  for (const item of chain) {
    const { top, bottom } = titleRowBand(item);
    if (y >= top && y <= bottom + 2) return item;
  }

  // Gap between a parent's title row and its first nested child — still the parent.
  for (const item of chain) {
    const firstNested = [...item.children].find(
      (ch): ch is HTMLElement =>
        ch instanceof HTMLElement && ch.classList.contains('outline-item'),
    );
    if (!firstNested) continue;
    const parentTop = item.getBoundingClientRect().top;
    const nestedTop = firstNested.getBoundingClientRect().top;
    if (y >= parentTop && y < nestedTop) return item;
  }

  return chain[0] ?? null;
}

/**
 * Innermost `.outline-item` for a DOM node — used so caret hits inside nested
 * rows are not treated as title hits on the parent.
 */
function outlineItemOwningNode(node: Node): HTMLElement | null {
  if (node instanceof Element) return node.closest('.outline-item');
  return node.parentElement?.closest('.outline-item') ?? null;
}

/** True when `node` is title content of `itemEl`, not a nested outline row. */
function isOwnTitleContent(itemEl: HTMLElement, node: Node): boolean {
  return outlineItemOwningNode(node) === itemEl;
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

function isBrNode(node: Node | null): boolean {
  return node instanceof HTMLBRElement || (node instanceof Element && node.tagName === 'BR');
}

/** True when the caret is at the end of a text node (common for gutter hits). */
function isCaretAtTextEnd(range: Range): boolean {
  const node = range.startContainer;
  if (node.nodeType !== Node.TEXT_NODE) return false;
  return range.startOffset >= (node.textContent?.length ?? 0);
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

      const itemEl = outlineItemForPointer(target, event.clientX, event.clientY);
      if (!itemEl || !root.contains(itemEl)) return;

      const { top: bandTop, bottom: bandBottom } = titleRowBand(itemEl);
      const inTitleBand =
        event.clientY >= bandTop && event.clientY <= bandBottom + 2;
      const textRight = titleTextRight(itemEl);
      const nearOrPastTextEnd = event.clientX >= textRight - 4;
      const clickRightOfTitle = event.clientX > titleRowContentRight(itemEl);

      // End-of-line / trailing gutter (including past empty Deadline · Entities
      // hints): always seed caret at end. caretRangeFromPoint often still
      // resolves into title text or the wrapped “next line”, which is why
      // Lexical alone places the caret wrong here.
      //
      // Clicks that land on real glyphs (textCaret) still win unless the
      // pointer is clearly past the title/chip/filled-meta box.
      if (inTitleBand && (nearOrPastTextEnd || clickRightOfTitle)) {
        const endCaret = caretRangeFromPoint(event.clientX, event.clientY);
        const textCaretUnderPointer = Boolean(
          endCaret &&
            isOwnTitleContent(itemEl, endCaret.startContainer) &&
            !isBrNode(endCaret.startContainer) &&
            (endCaret.startContainer.nodeType === Node.TEXT_NODE ||
              (endCaret.startContainer instanceof Element &&
                endCaret.startContainer.closest('[data-lexical-text="true"]'))),
        );

        // Past title/chip/filled-meta: force end unless the pointer is clearly
        // mid-glyph (flex-shrunk hit target). Gutter hits often resolve to the
        // text end — or into a nested child's text (same parent.contains) —
        // treat those as end-of-line for this row.
        const forceEnd = clickRightOfTitle
          ? !textCaretUnderPointer ||
            (endCaret !== null && isCaretAtTextEnd(endCaret))
          : !textCaretUnderPointer;
        if (forceEnd) {
          let isEmpty = false;
          editor.read(() => {
            const item = $outlineItemFromDOM(itemEl);
            if (!$isOutlineItemNode(item)) return;
            const content = $getContentChildren(item);
            isEmpty =
              content.length === 0 ||
              content.every((n) => n.getTextContent() === '');
          });

          event.preventDefault();
          editor.focus();
          if (event.shiftKey && !isEmpty) {
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
            if (isEmpty) item.selectStart();
            else $selectEndOfItemContent(item);
          });

          if (isEmpty) return;

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
          return;
        }
      }

      // Click landed on real editable content — let Lexical handle it.
      // Bullet/kind label are pseudo-elements (clicks hit .outline-item).
      if (target !== itemEl) {
        const tag = target.tagName;
        if (tag !== 'BR' && !target.classList.contains('outline-flex-break')) {
          // Hit-testing often lands on a nested row when clicking the parent's
          // end-of-line gutter; keep going so we can still place the caret.
          const nestedHit = target.closest('.outline-item');
          const nestedUnderParent =
            nestedHit &&
            nestedHit !== itemEl &&
            itemEl.contains(nestedHit);
          if (!nestedUnderParent) return;
        }
      }

      // Flex-shrunk title spans can be narrower than the painted glyphs, so a
      // click on “text” still hits the row. If a caret resolves into this row's
      // own title text, never steal — native drag-select must win. Nested
      // children's text must not count (end-of-parent gutter maps there).
      const caretUnderPointer = caretRangeFromPoint(
        event.clientX,
        event.clientY,
      );
      if (
        caretUnderPointer &&
        isOwnTitleContent(itemEl, caretUnderPointer.startContainer) &&
        !isBrNode(caretUnderPointer.startContainer) &&
        (caretUnderPointer.startContainer.nodeType === Node.TEXT_NODE ||
          (caretUnderPointer.startContainer instanceof Element &&
            caretUnderPointer.startContainer.closest(
              '[data-lexical-text="true"]',
            )))
      ) {
        return;
      }

      // Gutter click whose caret landed in a nested row → still end of this row.
      if (
        inTitleBand &&
        (nearOrPastTextEnd || clickRightOfTitle) &&
        caretUnderPointer &&
        itemEl.contains(caretUnderPointer.startContainer) &&
        !isOwnTitleContent(itemEl, caretUnderPointer.startContainer)
      ) {
        event.preventDefault();
        editor.focus();
        editor.update(() => {
          const item = $outlineItemFromDOM(itemEl);
          if (!$isOutlineItemNode(item)) return;
          $selectEndOfItemContent(item);
        });
        return;
      }

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
