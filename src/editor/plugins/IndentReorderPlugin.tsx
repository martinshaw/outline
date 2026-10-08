import { useEffect } from 'react';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import {
  $createRangeSelection,
  $getNodeByKey,
  $getSelection,
  $isRangeSelection,
  $setSelection,
  COMMAND_PRIORITY_HIGH,
  KEY_TAB_COMMAND,
  createCommand,
  type ElementNode,
  type LexicalCommand,
  type NodeKey,
} from 'lexical';
import { mergeRegister } from '@lexical/utils';
import {
  clearBlockSelectedIds,
  getBlockSelectedIds,
  setBlockSelectedIds,
} from '../blockSelectionStore';
import type { OutlineItemNode } from '../nodes/OutlineItemNode';
import {
  $getContentChildren,
  $getMoveTargets,
  $getNestedItems,
  $getNextOutlineSibling,
  $getParentOutlineItem,
  $getPreviousOutlineSibling,
} from '../utils/outlineHelpers';

export const INDENT_COMMAND: LexicalCommand<'indent' | 'outdent'> = createCommand(
  'INDENT_OUTLINE',
);
export const MOVE_COMMAND: LexicalCommand<'up' | 'down'> = createCommand(
  'MOVE_OUTLINE',
);

function isMac(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    /Mac|iPhone|iPad|iPod/i.test(navigator.platform)
  );
}

function $sameParent(targets: OutlineItemNode[]): boolean {
  if (targets.length === 0) return false;
  const parent = targets[0].getParent();
  return targets.every((t) => t.getParent() === parent);
}

type CaretSnapshot = {
  key: NodeKey;
  offset: number;
  type: 'text' | 'element';
};

function $captureCaret(): CaretSnapshot | null {
  const selection = $getSelection();
  if (!$isRangeSelection(selection) || !selection.isCollapsed()) return null;
  return {
    key: selection.anchor.key,
    offset: selection.anchor.offset,
    type: selection.anchor.type,
  };
}

/** End of the item's own inline content — not the last nested child. */
function $selectEndOfItemContent(item: OutlineItemNode): void {
  const content = $getContentChildren(item);
  const last = content[content.length - 1];
  if (last) {
    last.selectEnd();
    return;
  }
  item.selectStart();
}

/** Keep typing caret in place — do not enter block-selection mode. */
function $restoreCaret(
  snapshot: CaretSnapshot | null,
  fallbackItem?: OutlineItemNode,
): void {
  clearBlockSelectedIds();
  if (snapshot) {
    const node = $getNodeByKey(snapshot.key);
    if (node) {
      const sel = $createRangeSelection();
      sel.anchor.set(snapshot.key, snapshot.offset, snapshot.type);
      sel.focus.set(snapshot.key, snapshot.offset, snapshot.type);
      $setSelection(sel);
      return;
    }
  }
  if (fallbackItem) $selectEndOfItemContent(fallbackItem);
}

/** Restore block selection after move when the user already had one. */
function $restoreBlockSelection(
  targets: OutlineItemNode[],
  snapshot: CaretSnapshot | null,
): void {
  if (getBlockSelectedIds().size > 0 || targets.length > 1) {
    setBlockSelectedIds(targets.map((t) => t.getId()));
    if (targets[0]) $selectEndOfItemContent(targets[0]);
    return;
  }
  $restoreCaret(snapshot, targets[0]);
}

/** Insert `nodes` (in order) immediately before `ref`. */
function $insertAllBefore(ref: OutlineItemNode, nodes: OutlineItemNode[]): void {
  for (let i = nodes.length - 1; i >= 0; i--) {
    ref.insertBefore(nodes[i]);
  }
}

/** Insert `nodes` (in order) immediately after `ref`. */
function $insertAllAfter(ref: OutlineItemNode, nodes: OutlineItemNode[]): void {
  let cursor: OutlineItemNode = ref;
  for (const node of nodes) {
    cursor.insertAfter(node);
    cursor = node;
  }
}

function $detachAll(nodes: OutlineItemNode[]): void {
  for (const n of nodes) n.remove();
}

function $indent(): boolean {
  const targets = $getMoveTargets();
  if (targets.length === 0 || !$sameParent(targets)) return false;

  const prev = $getPreviousOutlineSibling(targets[0]);
  if (!prev || targets.includes(prev)) return false;

  const caret = $captureCaret();
  $detachAll(targets);
  for (const t of targets) {
    prev.append(t);
  }
  $restoreCaret(caret, targets[0]);
  return true;
}

function $outdent(): boolean {
  const targets = $getMoveTargets();
  if (targets.length === 0 || !$sameParent(targets)) return false;

  const parent = $getParentOutlineItem(targets[0]);
  if (!parent) return false;

  const last = targets[targets.length - 1];
  const adopted: OutlineItemNode[] = [];
  let sibling = $getNextOutlineSibling(last);
  while (sibling) {
    if (targets.includes(sibling)) break;
    const next = $getNextOutlineSibling(sibling);
    adopted.push(sibling);
    sibling = next;
  }

  const parentParent = parent.getParent();
  const parentIndex = parent.getIndexWithinParent();

  const caret = $captureCaret();
  $detachAll(adopted);
  $detachAll(targets);

  if (parentParent) {
    (parentParent as ElementNode).splice(parentIndex + 1, 0, targets);
  } else {
    $insertAllAfter(parent, targets);
  }

  for (const s of adopted) {
    last.append(s);
  }
  $restoreCaret(caret, targets[0]);
  return true;
}

function $moveUp(): boolean {
  const targets = $getMoveTargets();
  if (targets.length === 0 || !$sameParent(targets)) return false;

  const first = targets[0];
  const prev = $getPreviousOutlineSibling(first);
  const caret = $captureCaret();

  if (prev && !targets.includes(prev)) {
    $detachAll(targets);
    $insertAllBefore(prev, targets);
    $restoreBlockSelection(targets, caret);
    return true;
  }

  const parent = $getParentOutlineItem(first);
  if (!parent) return false;

  $detachAll(targets);
  $insertAllBefore(parent, targets);
  $restoreBlockSelection(targets, caret);
  return true;
}

function $moveDown(): boolean {
  const targets = $getMoveTargets();
  if (targets.length === 0 || !$sameParent(targets)) return false;

  const last = targets[targets.length - 1];
  const next = $getNextOutlineSibling(last);
  const caret = $captureCaret();

  if (next && !targets.includes(next)) {
    $detachAll(targets);
    $insertAllAfter(next, targets);
    $restoreBlockSelection(targets, caret);
    return true;
  }

  const parent = $getParentOutlineItem(targets[0]);
  if (!parent) return false;

  const aunt = $getNextOutlineSibling(parent);
  if (aunt) {
    $detachAll(targets);
    const nested = $getNestedItems(aunt);
    if (nested.length > 0) {
      $insertAllBefore(nested[0], targets);
    } else {
      for (const t of targets) aunt.append(t);
    }
    $restoreBlockSelection(targets, caret);
    return true;
  }

  $detachAll(targets);
  $insertAllAfter(parent, targets);
  $restoreBlockSelection(targets, caret);
  return true;
}

export function IndentReorderPlugin(): null {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    const mac = isMac();

    const onKeyDown = (event: KeyboardEvent) => {
      const key = event.key;
      if (key !== 'ArrowUp' && key !== 'ArrowDown') return;

      const moveMod = mac
        ? event.metaKey && event.shiftKey && !event.altKey && !event.ctrlKey
        : event.altKey && event.shiftKey && !event.metaKey && !event.ctrlKey;

      if (!moveMod) return;

      event.preventDefault();
      event.stopPropagation();
      editor.dispatchCommand(
        MOVE_COMMAND,
        key === 'ArrowUp' ? 'up' : 'down',
      );
    };

    return mergeRegister(
      editor.registerCommand(
        KEY_TAB_COMMAND,
        (event) => {
          event?.preventDefault();
          return event?.shiftKey ? $outdent() : $indent();
        },
        COMMAND_PRIORITY_HIGH,
      ),
      editor.registerCommand(
        INDENT_COMMAND,
        (dir) => (dir === 'indent' ? $indent() : $outdent()),
        COMMAND_PRIORITY_HIGH,
      ),
      editor.registerCommand(
        MOVE_COMMAND,
        (dir) => {
          let ok = false;
          editor.update(() => {
            ok = dir === 'up' ? $moveUp() : $moveDown();
          });
          return ok;
        },
        COMMAND_PRIORITY_HIGH,
      ),
      editor.registerRootListener((rootElement, prevRootElement) => {
        if (prevRootElement) {
          prevRootElement.removeEventListener('keydown', onKeyDown, true);
        }
        if (rootElement) {
          rootElement.addEventListener('keydown', onKeyDown, true);
        }
      }),
    );
  }, [editor]);

  return null;
}
