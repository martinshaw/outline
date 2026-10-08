import { useEffect, useRef } from 'react';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import {
  $getRoot,
  $getSelection,
  $isRangeSelection,
  CLICK_COMMAND,
  COMMAND_PRIORITY_HIGH,
  COMMAND_PRIORITY_LOW,
  KEY_ESCAPE_COMMAND,
} from 'lexical';
import { mergeRegister } from '@lexical/utils';
import {
  clearBlockSelectedIds,
  getBlockSelectedIds,
  setBlockSelectedIds,
  subscribeBlockSelection,
  syncBlockSelectionDom,
} from '../blockSelectionStore';
import {
  $collectOutlineItemsDFS,
  $findOutlineItemById,
  $getOutlineItem,
  $getTopLevelBlockSelection,
  $relocateOutlineItems,
  rangeIdsBetween,
} from '../utils/outlineHelpers';

type DragMode = 'idle' | 'selecting' | 'moving';

type DropHint = {
  id: string;
  place: 'before' | 'after';
};

function findOutlineDom(target: EventTarget | null): HTMLElement | null {
  if (!(target instanceof HTMLElement)) return null;
  return target.closest('.outline-item');
}

function isGutterClick(event: MouseEvent, dom: HTMLElement): boolean {
  if (!(event.target instanceof Element)) return false;
  if (
    event.target.closest('.outline-status-chip') ||
    event.target.closest('.outline-status-menu')
  ) {
    return false;
  }
  const rect = dom.getBoundingClientRect();
  // Leading gutter (kind label + bullet + gap) before chip/text.
  // Bullet/label are CSS pseudo-elements, so hit-test by x only.
  return event.clientX - rect.left < 72;
}

function outlineIdFromTarget(target: EventTarget | null): string | null {
  const dom = findOutlineDom(target);
  return dom?.getAttribute('data-outline-id') ?? null;
}

function readOrderedIds(
  editor: ReturnType<typeof useLexicalComposerContext>[0],
): string[] {
  let ids: string[] = [];
  editor.getEditorState().read(() => {
    ids = $collectOutlineItemsDFS($getRoot()).map((item) => item.getId());
  });
  return ids;
}

function clearDropHint(root: HTMLElement | null): void {
  if (!root) return;
  root
    .querySelectorAll('.outline-item--drop-before, .outline-item--drop-after')
    .forEach((el) => {
      el.classList.remove('outline-item--drop-before', 'outline-item--drop-after');
    });
}

function paintDropHint(root: HTMLElement | null, hint: DropHint | null): void {
  clearDropHint(root);
  if (!root || !hint) return;
  const el = root.querySelector(
    `.outline-item[data-outline-id="${CSS.escape(hint.id)}"]`,
  );
  if (!el) return;
  el.classList.add(
    hint.place === 'before'
      ? 'outline-item--drop-before'
      : 'outline-item--drop-after',
  );
}

function hitTestDrop(
  clientX: number,
  clientY: number,
  root: HTMLElement,
): DropHint | null {
  const el = document.elementFromPoint(clientX, clientY);
  if (!(el instanceof Element) || !root.contains(el)) return null;
  const item = el.closest('.outline-item');
  if (!(item instanceof HTMLElement) || !root.contains(item)) return null;
  const id = item.getAttribute('data-outline-id');
  if (!id) return null;
  const rect = item.getBoundingClientRect();
  const place: 'before' | 'after' =
    clientY < rect.top + rect.height / 2 ? 'before' : 'after';
  return { id, place };
}

function isTypingKey(event: KeyboardEvent): boolean {
  if (event.metaKey || event.ctrlKey || event.isComposing) return false;
  // Keep block selection for indent / reorder / role shortcuts.
  if (event.key === 'Tab') return false;
  if (event.key === 'Escape') return false;
  if (
    event.shiftKey &&
    (event.key === 'ArrowUp' || event.key === 'ArrowDown') &&
    (event.metaKey || event.altKey || event.ctrlKey)
  ) {
    return false;
  }
  if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) return false;

  if (event.key === 'Backspace' || event.key === 'Delete' || event.key === 'Enter') {
    return true;
  }
  return event.key.length === 1;
}

/**
 * Block multi-select via an external id store + DOM classes.
 * Gutter drag selects; text ranges also select their items for dragging.
 * Typing clears the block selection.
 */
export function BlockSelectionPlugin(): null {
  const [editor] = useLexicalComposerContext();
  const mode = useRef<DragMode>('idle');
  const dragAnchorId = useRef<string | null>(null);
  const dropHint = useRef<DropHint | null>(null);
  const raf = useRef<number | null>(null);
  const pendingToId = useRef<string | null>(null);
  const startXY = useRef<{ x: number; y: number } | null>(null);
  const movedFar = useRef(false);

  useEffect(() => {
    const paint = () => syncBlockSelectionDom(editor.getRootElement());

    const syncFromTextSelection = () => {
      editor.getEditorState().read(() => {
        const selection = $getSelection();
        if (!$isRangeSelection(selection) || selection.isCollapsed()) return;
        const anchorItem = $getOutlineItem(selection.anchor.getNode());
        const focusItem = $getOutlineItem(selection.focus.getNode());
        if (!anchorItem || !focusItem) return;
        const ordered = $collectOutlineItemsDFS($getRoot()).map((item) =>
          item.getId(),
        );
        setBlockSelectedIds(
          rangeIdsBetween(ordered, anchorItem.getId(), focusItem.getId()),
        );
      });
    };

    const unsub = subscribeBlockSelection(paint);
    const removeUpdate = editor.registerUpdateListener(({ tags }) => {
      queueMicrotask(() => {
        paint();
        if (
          tags.has('historic') ||
          tags.has('load') ||
          tags.has('block-selection')
        ) {
          return;
        }
        syncFromTextSelection();
      });
    });
    paint();

    return () => {
      unsub();
      removeUpdate();
    };
  }, [editor]);

  useEffect(() => {
    const setDraggingClass = (on: boolean) => {
      const root = editor.getRootElement();
      root?.classList.toggle('block-dragging', on);
      root?.classList.toggle('block-moving', on && mode.current === 'moving');
    };

    const applyRange = (fromId: string, toId: string) => {
      const ordered = readOrderedIds(editor);
      setBlockSelectedIds(rangeIdsBetween(ordered, fromId, toId));
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (!isTypingKey(event)) return;
      if (getBlockSelectedIds().size === 0) return;
      clearBlockSelectedIds();
    };

    const onMouseDown = (event: MouseEvent) => {
      if (event.button !== 0) return;
      const dom = findOutlineDom(event.target);
      if (!dom) return;

      const id = outlineIdFromTarget(event.target);
      if (!id) return;

      const selected = getBlockSelectedIds();
      const inSelection = selected.has(id);
      const gutter = isGutterClick(event, dom);

      // Relocate: gutter (or Alt) on an already-selected block
      if (
        inSelection &&
        selected.size > 0 &&
        !event.shiftKey &&
        (gutter || event.altKey)
      ) {
        event.preventDefault();
        mode.current = 'moving';
        dragAnchorId.current = id;
        startXY.current = { x: event.clientX, y: event.clientY };
        movedFar.current = false;
        dropHint.current = null;
        setDraggingClass(true);
        return;
      }

      if (!gutter && !event.altKey) return;

      event.preventDefault();
      mode.current = 'selecting';
      startXY.current = { x: event.clientX, y: event.clientY };
      movedFar.current = false;
      setDraggingClass(true);

      if (event.shiftKey) {
        const existing = [...selected];
        const anchor = existing[0] ?? id;
        dragAnchorId.current = anchor;
        applyRange(anchor, id);
      } else {
        dragAnchorId.current = id;
        setBlockSelectedIds([id]);
      }
    };

    const flushSelectPending = () => {
      raf.current = null;
      if (mode.current !== 'selecting') return;
      const toId = pendingToId.current;
      const fromId = dragAnchorId.current;
      if (!toId || !fromId) return;
      applyRange(fromId, toId);
    };

    const flushMovePending = () => {
      raf.current = null;
      if (mode.current !== 'moving') return;
      const root = editor.getRootElement();
      if (!root || !dropHint.current) return;
      paintDropHint(root, dropHint.current);
    };

    const onMouseMove = (event: MouseEvent) => {
      if (mode.current === 'idle') return;
      event.preventDefault();

      if (startXY.current && !movedFar.current) {
        const dx = event.clientX - startXY.current.x;
        const dy = event.clientY - startXY.current.y;
        if (dx * dx + dy * dy > 36) movedFar.current = true;
      }

      if (mode.current === 'selecting') {
        const currentId = outlineIdFromTarget(event.target);
        if (!currentId) return;
        pendingToId.current = currentId;
        if (raf.current == null) {
          raf.current = requestAnimationFrame(flushSelectPending);
        }
        return;
      }

      if (mode.current === 'moving') {
        const root = editor.getRootElement();
        if (!root) return;
        dropHint.current = hitTestDrop(event.clientX, event.clientY, root);
        if (raf.current == null) {
          raf.current = requestAnimationFrame(flushMovePending);
        }
      }
    };

    const finishMove = () => {
      const hint = dropHint.current;
      const root = editor.getRootElement();
      clearDropHint(root);
      dropHint.current = null;

      if (!hint || !movedFar.current) return;

      editor.update(() => {
        const dropTarget = $findOutlineItemById($getRoot(), hint.id);
        if (!dropTarget) return;
        const targets = $getTopLevelBlockSelection($getRoot());
        if (!$relocateOutlineItems(targets, dropTarget, hint.place)) return;
        setBlockSelectedIds(targets.map((t) => t.getId()));
      });
    };

    const onMouseUp = () => {
      if (mode.current === 'moving') {
        if (raf.current != null) {
          cancelAnimationFrame(raf.current);
          raf.current = null;
        }
        finishMove();
      } else if (mode.current === 'selecting') {
        if (raf.current != null) {
          cancelAnimationFrame(raf.current);
          raf.current = null;
          flushSelectPending();
        }
      }

      mode.current = 'idle';
      dragAnchorId.current = null;
      pendingToId.current = null;
      startXY.current = null;
      movedFar.current = false;
      setDraggingClass(false);
      clearDropHint(editor.getRootElement());
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);

    return mergeRegister(
      editor.registerRootListener((root, prev) => {
        if (prev) {
          prev.removeEventListener('mousedown', onMouseDown);
          prev.removeEventListener('keydown', onKeyDown);
        }
        if (root) {
          root.addEventListener('mousedown', onMouseDown);
          root.addEventListener('keydown', onKeyDown);
        }
      }),
      editor.registerCommand(
        CLICK_COMMAND,
        (event: MouseEvent) => {
          const dom = findOutlineDom(event.target);
          if (!dom) return false;

          if (isGutterClick(event, dom) || event.altKey) {
            return true;
          }

          if (event.detail === 3) {
            event.preventDefault();
            const id = outlineIdFromTarget(event.target);
            if (id) setBlockSelectedIds([id]);
            return true;
          }

          // Keep block selection from text ranges until the user types (or Esc).
          return false;
        },
        COMMAND_PRIORITY_LOW,
      ),
      editor.registerCommand(
        KEY_ESCAPE_COMMAND,
        () => {
          clearBlockSelectedIds();
          clearDropHint(editor.getRootElement());
          return true;
        },
        COMMAND_PRIORITY_HIGH,
      ),
      () => {
        window.removeEventListener('mousemove', onMouseMove);
        window.removeEventListener('mouseup', onMouseUp);
        if (raf.current != null) cancelAnimationFrame(raf.current);
        clearDropHint(editor.getRootElement());
      },
    );
  }, [editor]);

  return null;
}
