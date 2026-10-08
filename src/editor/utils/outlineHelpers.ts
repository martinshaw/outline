import {
  $getRoot,
  $getSelection,
  $isRangeSelection,
  type ElementNode,
  type LexicalNode,
} from 'lexical';
import { getBlockSelectedIds } from '../blockSelectionStore';
import {
  $isOutlineItemNode,
  OutlineItemNode,
} from '../nodes/OutlineItemNode';

/** Nearest OutlineItemNode ancestor of a node (or itself). */
export function $getOutlineItem(node: LexicalNode | null): OutlineItemNode | null {
  let current: LexicalNode | null = node;
  while (current) {
    if ($isOutlineItemNode(current)) return current;
    current = current.getParent();
  }
  return null;
}

export function $getSelectedOutlineItem(): OutlineItemNode | null {
  const selection = $getSelection();
  if (!$isRangeSelection(selection)) return null;
  return $getOutlineItem(selection.anchor.getNode());
}

export function $getContentChildren(item: OutlineItemNode): LexicalNode[] {
  return item.getChildren().filter((c) => !$isOutlineItemNode(c));
}

export function $getNestedItems(item: OutlineItemNode): OutlineItemNode[] {
  return item.getChildren().filter($isOutlineItemNode);
}

export function $getParentOutlineItem(
  item: OutlineItemNode,
): OutlineItemNode | null {
  const parent = item.getParent();
  return $isOutlineItemNode(parent) ? parent : null;
}

/** Skip text/link content nodes between outline siblings. */
export function $getPreviousOutlineSibling(
  item: OutlineItemNode,
): OutlineItemNode | null {
  let prev: LexicalNode | null = item.getPreviousSibling();
  while (prev) {
    if ($isOutlineItemNode(prev)) return prev;
    prev = prev.getPreviousSibling();
  }
  return null;
}

export function $getNextOutlineSibling(
  item: OutlineItemNode,
): OutlineItemNode | null {
  let next: LexicalNode | null = item.getNextSibling();
  while (next) {
    if ($isOutlineItemNode(next)) return next;
    next = next.getNextSibling();
  }
  return null;
}

export function $getNearestProjectParent(
  item: OutlineItemNode,
): OutlineItemNode | null {
  let parent = $getParentOutlineItem(item);
  while (parent) {
    if (parent.getKind() === 'project') return parent;
    parent = $getParentOutlineItem(parent);
  }
  return null;
}

export function $isAtStartOfItem(item: OutlineItemNode): boolean {
  const selection = $getSelection();
  if (!$isRangeSelection(selection) || !selection.isCollapsed()) return false;
  const anchor = selection.anchor;
  if (anchor.offset !== 0) return false;

  const content = $getContentChildren(item);
  if (content.length === 0) return true;

  const first = content[0];
  let current: LexicalNode | null = anchor.getNode();
  while (current && current !== item) {
    if (current === first) return true;
    const parentNode: LexicalNode | null = current.getParent();
    if (!parentNode) break;
    if (
      'getFirstChild' in parentNode &&
      typeof parentNode.getFirstChild === 'function' &&
      parentNode.getFirstChild() !== current
    ) {
      return false;
    }
    current = parentNode;
  }
  return false;
}

export function $findOutlineItemById(
  root: ElementNode,
  id: string,
): OutlineItemNode | null {
  const walk = (nodes: LexicalNode[]): OutlineItemNode | null => {
    for (const node of nodes) {
      if ($isOutlineItemNode(node)) {
        if (node.getId() === id) return node;
        const found = walk(node.getChildren());
        if (found) return found;
      }
    }
    return null;
  };
  return walk(root.getChildren());
}

/** All outline items in visual (DFS) order. */
export function $collectOutlineItemsDFS(root: ElementNode): OutlineItemNode[] {
  const result: OutlineItemNode[] = [];
  const walk = (nodes: LexicalNode[]) => {
    for (const node of nodes) {
      if ($isOutlineItemNode(node)) {
        result.push(node);
        walk(node.getChildren());
      }
    }
  };
  walk(root.getChildren());
  return result;
}

export function $getBlockSelectedItems(root: ElementNode): OutlineItemNode[] {
  const ids = getBlockSelectedIds();
  if (ids.size === 0) return [];
  return $collectOutlineItemsDFS(root).filter((item) => ids.has(item.getId()));
}

/**
 * Selected items whose parent is not also selected — the units that move.
 * Nested selected children ride along inside a selected parent.
 */
export function $getTopLevelBlockSelection(
  root: ElementNode,
): OutlineItemNode[] {
  const selected = $getBlockSelectedItems(root);
  if (selected.length === 0) return [];
  const selectedSet = new Set(selected);
  return selected.filter((item) => {
    let p = $getParentOutlineItem(item);
    while (p) {
      if (selectedSet.has(p)) return false;
      p = $getParentOutlineItem(p);
    }
    return true;
  });
}

/** Targets for move/indent: block selection if any, else the caret item. */
export function $getMoveTargets(): OutlineItemNode[] {
  const top = $getTopLevelBlockSelection($getRoot());
  if (top.length > 0) return top;
  const item = $getSelectedOutlineItem();
  return item ? [item] : [];
}

/** Ids in visual DFS order between two item ids (inclusive). */
export function rangeIdsBetween(
  orderedIds: string[],
  fromId: string,
  toId: string,
): string[] {
  const a = orderedIds.indexOf(fromId);
  const b = orderedIds.indexOf(toId);
  if (a < 0 || b < 0) return [toId];
  const lo = Math.min(a, b);
  const hi = Math.max(a, b);
  return orderedIds.slice(lo, hi + 1);
}

function $sameParent(targets: OutlineItemNode[]): boolean {
  if (targets.length === 0) return false;
  const parent = targets[0].getParent();
  return targets.every((t) => t.getParent() === parent);
}

function $isDescendantOf(
  node: OutlineItemNode,
  ancestor: OutlineItemNode,
): boolean {
  let p = $getParentOutlineItem(node);
  while (p) {
    if (p === ancestor) return true;
    p = $getParentOutlineItem(p);
  }
  return false;
}

function $insertAllBefore(ref: OutlineItemNode, nodes: OutlineItemNode[]): void {
  for (let i = nodes.length - 1; i >= 0; i--) {
    ref.insertBefore(nodes[i]);
  }
}

function $insertAllAfter(ref: OutlineItemNode, nodes: OutlineItemNode[]): void {
  let cursor: OutlineItemNode = ref;
  for (const node of nodes) {
    cursor.insertAfter(node);
    cursor = node;
  }
}

/**
 * Move top-level selected outline items before/after `dropTarget`, adopting
 * that item's parent (nesting level). Returns false if the drop is invalid.
 */
export function $relocateOutlineItems(
  targets: OutlineItemNode[],
  dropTarget: OutlineItemNode,
  place: 'before' | 'after',
): boolean {
  if (targets.length === 0 || !$sameParent(targets)) return false;
  if (targets.includes(dropTarget)) return false;
  for (const t of targets) {
    if ($isDescendantOf(dropTarget, t)) return false;
  }

  // No-op if already in place
  if (place === 'before') {
    const prev = $getPreviousOutlineSibling(dropTarget);
    if (prev === targets[targets.length - 1]) return false;
    if (targets[0] === dropTarget) return false;
  } else {
    const next = $getNextOutlineSibling(dropTarget);
    if (next === targets[0]) return false;
  }

  for (const t of targets) t.remove();
  if (place === 'before') $insertAllBefore(dropTarget, targets);
  else $insertAllAfter(dropTarget, targets);
  return true;
}
