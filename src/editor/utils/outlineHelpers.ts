import {
  $getNearestNodeFromDOMNode,
  $getRoot,
  $getSelection,
  $isRangeSelection,
  type ElementNode,
  type LexicalNode,
} from 'lexical';
import {
  getBlockSelectedIds,
  getBlockSelfOnlyIds,
} from '../blockSelectionStore';
import {
  $isOutlineItemNode,
  OutlineItemNode,
} from '../nodes/OutlineItemNode';
import { createId } from '../../utils/id';

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

/** Nearest ancestor task (not subtask) — used to promote notes to subtasks. */
export function $getNearestTaskParent(
  item: OutlineItemNode,
): OutlineItemNode | null {
  let parent = $getParentOutlineItem(item);
  while (parent) {
    if (parent.getKind() === 'task') return parent;
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

/**
 * Resolve the outline item for a DOM click via Lexical's node map (not
 * data-outline-id). Safe when duplicate ids exist from older pastes.
 */
export function $outlineItemFromDOM(
  dom: Node | null,
): OutlineItemNode | null {
  if (!dom) return null;
  return $getOutlineItem($getNearestNodeFromDOMNode(dom));
}

/** Assign fresh ids to any outline items that share an id with an earlier row. */
export function $repairDuplicateOutlineIds(): boolean {
  const seen = new Set<string>();
  let changed = false;
  for (const item of $collectOutlineItemsDFS($getRoot())) {
    const id = item.getId();
    if (!id || seen.has(id)) {
      item.setId(createId());
      changed = true;
      seen.add(item.getId());
    } else {
      seen.add(id);
    }
  }
  return changed;
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

/** Nesting depth under the document root (0 = top-level outline item). */
export function $getOutlineDepth(item: OutlineItemNode): number {
  let depth = 0;
  let parent = $getParentOutlineItem(item);
  while (parent) {
    depth += 1;
    parent = $getParentOutlineItem(parent);
  }
  return depth;
}

/**
 * True when every selected item deeper than the shallowest selected level is a
 * descendant of at least one selected item at that shallowest level.
 */
export function $isHierarchicallyValidBlockSelection(
  items: OutlineItemNode[],
): boolean {
  if (items.length <= 1) return true;
  const depths = items.map($getOutlineDepth);
  return $isValidRangeByDepth(items, depths, 0, items.length - 1);
}

/** Index-based check — avoids allocating slices on the hot clamp path. */
function $isValidRangeByDepth(
  ordered: OutlineItemNode[],
  depths: number[],
  lo: number,
  hi: number,
): boolean {
  if (hi <= lo) return true;

  let minDepth = depths[lo];
  for (let i = lo + 1; i <= hi; i++) {
    if (depths[i] < minDepth) minDepth = depths[i];
  }

  const rootKeys = new Set<string>();
  for (let i = lo; i <= hi; i++) {
    if (depths[i] === minDepth) rootKeys.add(ordered[i].getKey());
  }

  for (let i = lo; i <= hi; i++) {
    if (depths[i] === minDepth) continue;
    let p = $getParentOutlineItem(ordered[i]);
    let ok = false;
    while (p) {
      if (rootKeys.has(p.getKey())) {
        ok = true;
        break;
      }
      p = $getParentOutlineItem(p);
    }
    if (!ok) return false;
  }
  return true;
}

/**
 * Pull in ancestors of orphan deep items until the contiguous DFS span
 * covering the set is hierarchically valid.
 */
function $expandBlockSelectionWithAncestors(
  ordered: OutlineItemNode[],
  depths: number[],
  lo: number,
  hi: number,
): string[] {
  const selected = new Set<string>();
  for (let i = lo; i <= hi; i++) selected.add(ordered[i].getId());
  if (selected.size === 0) return [];

  const idToIndex = new Map<string, number>();
  for (let i = 0; i < ordered.length; i++) {
    idToIndex.set(ordered[i].getId(), i);
  }

  for (let guard = 0; guard < ordered.length; guard++) {
    const indices: number[] = [];
    for (let i = 0; i < ordered.length; i++) {
      if (selected.has(ordered[i].getId())) indices.push(i);
    }
    if (indices.length === 0) return [];

    let spanLo = indices[0];
    let spanHi = indices[0];
    for (const i of indices) {
      if (i < spanLo) spanLo = i;
      if (i > spanHi) spanHi = i;
    }
    if ($isValidRangeByDepth(ordered, depths, spanLo, spanHi)) {
      const out: string[] = [];
      for (let i = spanLo; i <= spanHi; i++) out.push(ordered[i].getId());
      return out;
    }

    let minDepth = depths[indices[0]];
    for (const i of indices) {
      if (depths[i] < minDepth) minDepth = depths[i];
    }
    const rootKeys = new Set<string>();
    for (const i of indices) {
      if (depths[i] === minDepth) rootKeys.add(ordered[i].getKey());
    }

    let added = false;
    for (const i of indices) {
      if (depths[i] === minDepth) continue;
      let p = $getParentOutlineItem(ordered[i]);
      let underRoot = false;
      while (p) {
        if (rootKeys.has(p.getKey())) {
          underRoot = true;
          break;
        }
        p = $getParentOutlineItem(p);
      }
      if (underRoot) continue;
      const parent = $getParentOutlineItem(ordered[i]);
      if (parent && !selected.has(parent.getId())) {
        selected.add(parent.getId());
        added = true;
      }
    }
    if (!added) break;
  }

  // Fallback: contiguous span of whatever we collected.
  let spanLo = ordered.length;
  let spanHi = -1;
  for (const id of selected) {
    const idx = idToIndex.get(id);
    if (idx == null) continue;
    if (idx < spanLo) spanLo = idx;
    if (idx > spanHi) spanHi = idx;
  }
  if (spanHi < spanLo) return [];
  const out: string[] = [];
  for (let i = spanLo; i <= spanHi; i++) out.push(ordered[i].getId());
  return out;
}

/** Dropping on a parent (has kids) or a shallower node may pull in ancestors. */
function $isBlockSelectionExpandTarget(
  to: OutlineItemNode,
  fromDepth: number,
  toDepth: number,
): boolean {
  if ($getNestedItems(to).length > 0) return true;
  return toDepth < fromDepth;
}

/**
 * Build a block selection from `fromId` toward `toId`.
 * - Valid DFS ranges are kept as-is (e.g. Morning notes → Auth subtree).
 * - Hovering foreign deep items is fine when the endpoint is a parent / shallower
 *   node: missing ancestors are pulled in so the span becomes valid.
 * - Otherwise use the farthest still-valid endpoint (validity need not be
 *   monotonic along the path).
 */
export function $clampBlockSelectionRange(
  ordered: OutlineItemNode[],
  fromId: string,
  toId: string,
): string[] {
  const n = ordered.length;
  const ids: string[] = new Array(n);
  const depths: number[] = new Array(n);
  let a = -1;
  let b = -1;
  for (let i = 0; i < n; i++) {
    const id = ordered[i].getId();
    ids[i] = id;
    depths[i] = $getOutlineDepth(ordered[i]);
    if (id === fromId) a = i;
    if (id === toId) b = i;
  }

  if (a < 0 && b < 0) return [];
  if (a < 0) return [toId];
  if (b < 0 || a === b) return [fromId];

  const lo = Math.min(a, b);
  const hi = Math.max(a, b);
  if ($isValidRangeByDepth(ordered, depths, lo, hi)) {
    return ids.slice(lo, hi + 1);
  }

  if ($isBlockSelectionExpandTarget(ordered[b], depths[a], depths[b])) {
    const expanded = $expandBlockSelectionWithAncestors(ordered, depths, lo, hi);
    if (expanded.length > 0) return expanded;
  }

  // Farthest valid endpoint — validity is not monotonic, so scan fully.
  const step = a < b ? 1 : -1;
  let best = a;
  for (let i = a + step; step > 0 ? i <= b : i >= b; i += step) {
    if ($isValidRangeByDepth(ordered, depths, Math.min(a, i), Math.max(a, i))) {
      best = i;
    }
  }

  return ids.slice(Math.min(a, best), Math.max(a, best) + 1);
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
 * Lift nested outline children out of `item`, placing them as following
 * siblings (order preserved). Used when moving a parent alone.
 */
export function $hoistNestedChildren(item: OutlineItemNode): void {
  const nested = $getNestedItems(item);
  if (nested.length === 0) return;
  let anchor: OutlineItemNode = item;
  for (const child of nested) {
    child.remove();
    anchor.insertAfter(child);
    anchor = child;
  }
}

/** For self-only selection, detach nested outline children before a move. */
export function $hoistSelfOnlyMoveTargets(targets: OutlineItemNode[]): void {
  const selfOnly = getBlockSelfOnlyIds();
  if (selfOnly.size === 0) return;
  for (const t of targets) {
    if (selfOnly.has(t.getId())) $hoistNestedChildren(t);
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

  // Self-only parents hoist children first, so drops onto those (soon-former)
  // descendants are valid. Full subtree moves still cannot land inside themselves.
  const selfOnly = getBlockSelfOnlyIds();
  for (const t of targets) {
    if (selfOnly.has(t.getId())) continue;
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

  $hoistSelfOnlyMoveTargets(targets);
  for (const t of targets) t.remove();
  if (place === 'before') $insertAllBefore(dropTarget, targets);
  else $insertAllAfter(dropTarget, targets);
  return true;
}

function $detachAll(nodes: OutlineItemNode[]): void {
  for (const n of nodes) n.remove();
}

/** Nest targets under the previous outline sibling. */
export function $indentOutlineItems(targets: OutlineItemNode[]): boolean {
  if (targets.length === 0 || !$sameParent(targets)) return false;
  const prev = $getPreviousOutlineSibling(targets[0]);
  if (!prev || targets.includes(prev)) return false;
  $hoistSelfOnlyMoveTargets(targets);
  $detachAll(targets);
  for (const t of targets) prev.append(t);
  return true;
}

/**
 * Lift targets to the parent level (after their current parent). Trailing
 * siblings between the last target and the next non-target are adopted as
 * children of the last target.
 */
export function $outdentOutlineItems(targets: OutlineItemNode[]): boolean {
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

  $hoistSelfOnlyMoveTargets(targets);
  $detachAll(adopted);
  $detachAll(targets);

  if (parentParent) {
    (parentParent as ElementNode).splice(parentIndex + 1, 0, targets);
  } else {
    $insertAllAfter(parent, targets);
  }

  for (const s of adopted) last.append(s);
  return true;
}

/** Move targets up among siblings, or out before the parent when at top. */
export function $moveOutlineItemsUp(targets: OutlineItemNode[]): boolean {
  if (targets.length === 0 || !$sameParent(targets)) return false;
  const first = targets[0];
  // Hoist first so self-only parents see former children as siblings.
  $hoistSelfOnlyMoveTargets(targets);
  const prev = $getPreviousOutlineSibling(first);

  if (prev && !targets.includes(prev)) {
    $detachAll(targets);
    $insertAllBefore(prev, targets);
    return true;
  }

  const parent = $getParentOutlineItem(first);
  if (!parent) return false;
  $detachAll(targets);
  $insertAllBefore(parent, targets);
  return true;
}

/** Move targets down among siblings, or into/after the next aunt. */
export function $moveOutlineItemsDown(targets: OutlineItemNode[]): boolean {
  if (targets.length === 0 || !$sameParent(targets)) return false;
  const last = targets[targets.length - 1];
  // Hoist first so self-only parents see former children as siblings.
  $hoistSelfOnlyMoveTargets(targets);
  const next = $getNextOutlineSibling(last);

  if (next && !targets.includes(next)) {
    $detachAll(targets);
    $insertAllAfter(next, targets);
    return true;
  }

  const parent = $getParentOutlineItem(targets[0]);
  if (!parent) return false;

  const aunt = $getNextOutlineSibling(parent);
  if (aunt) {
    $detachAll(targets);
    const nested = $getNestedItems(aunt);
    if (nested.length > 0) $insertAllBefore(nested[0], targets);
    else for (const t of targets) aunt.append(t);
    return true;
  }

  $detachAll(targets);
  $insertAllAfter(parent, targets);
  return true;
}
