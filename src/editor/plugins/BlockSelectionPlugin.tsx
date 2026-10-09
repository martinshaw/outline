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
  disposeBlockDragHandles,
  getBlockSelectedIds,
  refreshBlockSelectionChrome,
  setBlockSelectedIds,
  subscribeBlockSelection,
  syncBlockDragHandles,
  syncBlockSelectionDom,
} from '../blockSelectionStore';
import {
  $clampBlockSelectionRange,
  $collectOutlineItemsDFS,
  $findOutlineItemById,
  $getOutlineItem,
  $getTopLevelBlockSelection,
  $relocateOutlineItems,
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

function findDragHandle(target: EventTarget | null): HTMLElement | null {
  if (!(target instanceof Element)) return null;
  return target.closest('.outline-block-handle');
}

function isGutterClick(event: MouseEvent, dom: HTMLElement): boolean {
  if (!(event.target instanceof Element)) return false;
  if (
    event.target.closest('.outline-status-chip') ||
    event.target.closest('.outline-status-menu') ||
    event.target.closest('.outline-meta') ||
    event.target.closest('.outline-meta-popover') ||
    event.target.closest('.outline-block-handle')
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
 * Gutter drag selects; a high-contrast handle moves the selection.
 * Click anywhere else clears the block selection.
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
    let paintRaf: number | null = null;
    let textSyncRaf: number | null = null;
    let lastTextSelKey = '';

    const paint = () => {
      const root = editor.getRootElement();
      syncBlockSelectionDom(root);
      syncBlockDragHandles(root);
    };

    const schedulePaint = () => {
      if (paintRaf != null) return;
      paintRaf = requestAnimationFrame(() => {
        paintRaf = null;
        paint();
      });
    };

    const syncFromTextSelection = () => {
      editor.getEditorState().read(() => {
        const selection = $getSelection();
        if (!$isRangeSelection(selection) || selection.isCollapsed()) {
          lastTextSelKey = '';
          return;
        }
        const anchorItem = $getOutlineItem(selection.anchor.getNode());
        const focusItem = $getOutlineItem(selection.focus.getNode());
        if (!anchorItem || !focusItem) return;

        // Skip identical selection points (Lexical fires many updates while dragging).
        const selKey = `${selection.anchor.key}:${selection.anchor.offset}:${selection.focus.key}:${selection.focus.offset}`;
        if (selKey === lastTextSelKey) return;
        lastTextSelKey = selKey;

        const ordered = $collectOutlineItemsDFS($getRoot());
        setBlockSelectedIds(
          $clampBlockSelectionRange(
            ordered,
            anchorItem.getId(),
            focusItem.getId(),
          ),
        );
      });
    };

    const scheduleTextSync = () => {
      if (textSyncRaf != null) return;
      textSyncRaf = requestAnimationFrame(() => {
        textSyncRaf = null;
        syncFromTextSelection();
      });
    };

    // Paint only when the block-selection id set changes — not on every keystroke.
    const unsub = subscribeBlockSelection(schedulePaint);

    let handleRaf: number | null = null;
    const scheduleHandleRefresh = () => {
      if (getBlockSelectedIds().size === 0) return;
      if (handleRaf != null) return;
      handleRaf = requestAnimationFrame(() => {
        handleRaf = null;
        syncBlockDragHandles(editor.getRootElement());
      });
    };

    const removeUpdate = editor.registerUpdateListener(({ tags }) => {
      if (tags.has('historic') || tags.has('load')) return;
      // Relocate / indent keep the same ids — still need handle geometry.
      if (tags.has('block-selection')) {
        scheduleHandleRefresh();
        return;
      }
      scheduleTextSync();
      scheduleHandleRefresh();
    });

    const root = editor.getRootElement();
    const shell = root?.closest('.editor-shell');
    const main = root?.closest('.main');
    const onScrollOrResize = () => {
      if (getBlockSelectedIds().size === 0) return;
      if (paintRaf != null) return;
      paintRaf = requestAnimationFrame(() => {
        paintRaf = null;
        syncBlockDragHandles(editor.getRootElement());
      });
    };
    shell?.addEventListener('scroll', onScrollOrResize, true);
    main?.addEventListener('scroll', onScrollOrResize, { passive: true });
    window.addEventListener('resize', onScrollOrResize);

    paint();

    return () => {
      unsub();
      removeUpdate();
      if (paintRaf != null) cancelAnimationFrame(paintRaf);
      if (textSyncRaf != null) cancelAnimationFrame(textSyncRaf);
      if (handleRaf != null) cancelAnimationFrame(handleRaf);
      shell?.removeEventListener('scroll', onScrollOrResize, true);
      main?.removeEventListener('scroll', onScrollOrResize);
      window.removeEventListener('resize', onScrollOrResize);
      disposeBlockDragHandles();
    };
  }, [editor]);

  useEffect(() => {
    const setDraggingClass = (on: boolean) => {
      const root = editor.getRootElement();
      root?.classList.toggle('block-dragging', on);
      root?.classList.toggle('block-moving', on && mode.current === 'moving');
    };

    const applyRange = (fromId: string, toId: string) => {
      let ids: string[] = [fromId];
      editor.getEditorState().read(() => {
        const ordered = $collectOutlineItemsDFS($getRoot());
        ids = $clampBlockSelectionRange(ordered, fromId, toId);
      });
      setBlockSelectedIds(ids);
    };

    const beginMove = (id: string, event: MouseEvent) => {
      event.preventDefault();
      mode.current = 'moving';
      dragAnchorId.current = id;
      startXY.current = { x: event.clientX, y: event.clientY };
      movedFar.current = false;
      dropHint.current = null;
      setDraggingClass(true);
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (!isTypingKey(event)) return;
      if (getBlockSelectedIds().size === 0) return;
      clearBlockSelectedIds();
    };

    const onMouseDown = (event: MouseEvent) => {
      if (event.button !== 0) return;
      // Handles live outside contenteditable; see onWindowMouseDown.

      const dom = findOutlineDom(event.target);
      if (!dom) {
        if (getBlockSelectedIds().size > 0) clearBlockSelectedIds();
        return;
      }

      const id = outlineIdFromTarget(event.target);
      if (!id) return;

      const selected = getBlockSelectedIds();
      const gutter = isGutterClick(event, dom);

      // Alt-drag still moves without the handle (power-user).
      if (
        selected.has(id) &&
        selected.size > 0 &&
        !event.shiftKey &&
        event.altKey
      ) {
        beginMove(id, event);
        return;
      }

      if (!gutter && !event.altKey) {
        // Click on text / body → place caret and clear block selection.
        if (selected.size > 0) clearBlockSelectedIds();
        return;
      }

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

      let moved = false;
      editor.update(
        () => {
          const dropTarget = $findOutlineItemById($getRoot(), hint.id);
          if (!dropTarget) return;
          const targets = $getTopLevelBlockSelection($getRoot());
          if (!$relocateOutlineItems(targets, dropTarget, hint.place)) return;
          moved = true;
          setBlockSelectedIds(targets.map((t) => t.getId()));
        },
        { tag: 'block-selection' },
      );
      // Ids are often unchanged after relocate, so the store won't notify —
      // force handle geometry to the post-layout position.
      if (moved) {
        requestAnimationFrame(() => {
          refreshBlockSelectionChrome();
          // Second frame: Lexical/layout may still be settling.
          requestAnimationFrame(() => {
            syncBlockDragHandles(editor.getRootElement());
          });
        });
      }
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

    /**
     * Handle mousedown (overlay is outside contenteditable) and clear
     * selection on clicks outside the editor.
     */
    const onWindowMouseDown = (event: MouseEvent) => {
      if (event.button !== 0) return;

      const handle = findDragHandle(event.target);
      if (handle) {
        const id = handle.getAttribute('data-outline-id');
        if (id && getBlockSelectedIds().has(id)) {
          beginMove(id, event);
          event.stopPropagation();
        }
        return;
      }

      if (mode.current !== 'idle') return;
      if (getBlockSelectedIds().size === 0) return;
      const root = editor.getRootElement();
      const shell = root?.closest('.editor-shell');
      if (
        event.target instanceof Node &&
        (root?.contains(event.target) || shell?.contains(event.target))
      ) {
        return;
      }
      clearBlockSelectedIds();
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    window.addEventListener('mousedown', onWindowMouseDown, true);

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
          if (findDragHandle(event.target)) return true;

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
        window.removeEventListener('mousedown', onWindowMouseDown, true);
        if (raf.current != null) cancelAnimationFrame(raf.current);
        clearDropHint(editor.getRootElement());
      },
    );
  }, [editor]);

  return null;
}
