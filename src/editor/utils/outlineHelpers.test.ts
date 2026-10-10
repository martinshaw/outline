import { $getRoot } from 'lexical';
import { describe, expect, it, beforeEach } from 'vitest';
import {
  dayDoc,
  item,
  readIdTree,
  readIds,
  readParents,
  resetBlockSelectionStore,
  selectBlocks,
  selectSelfOnly,
  setupEditor,
  withItems,
} from '../test/harness';
import {
  $clampBlockSelectionRange,
  $collectOutlineItemsDFS,
  $getNestedItems,
  $getOutlineDepth,
  $getParentOutlineItem,
  $getTopLevelBlockSelection,
  $hoistNestedChildren,
  $indentOutlineItems,
  $isHierarchicallyValidBlockSelection,
  $moveOutlineItemsDown,
  $moveOutlineItemsUp,
  $outdentOutlineItems,
  $relocateOutlineItems,
  rangeIdsBetween,
} from './outlineHelpers';

beforeEach(() => {
  resetBlockSelectionStore();
});

/** Classic fixture:
 * a
 * b
 *   b1
 *     b1a
 *   b2
 * c
 */
function nestedDoc() {
  return dayDoc([
    item('a', 'A'),
    item('b', 'B', [
      item('b1', 'B1', [item('b1a', 'B1a')]),
      item('b2', 'B2'),
    ]),
    item('c', 'C'),
  ]);
}

describe('rangeIdsBetween', () => {
  const ids = ['a', 'b', 'b1', 'b1a', 'b2', 'c'];

  it('returns inclusive span forward and backward', () => {
    expect(rangeIdsBetween(ids, 'b', 'b2')).toEqual(['b', 'b1', 'b1a', 'b2']);
    expect(rangeIdsBetween(ids, 'b2', 'b')).toEqual(['b', 'b1', 'b1a', 'b2']);
  });

  it('returns single id when endpoints match', () => {
    expect(rangeIdsBetween(ids, 'c', 'c')).toEqual(['c']);
  });

  it('falls back to toId when from is missing', () => {
    expect(rangeIdsBetween(ids, 'missing', 'c')).toEqual(['c']);
  });
});

describe('$collectOutlineItemsDFS / depth / parent', () => {
  it('walks depth-first and reports nesting', () => {
    const editor = setupEditor(nestedDoc());
    expect(readIds(editor)).toEqual(['a', 'b', 'b1', 'b1a', 'b2', 'c']);

    editor.getEditorState().read(() => {
      const ordered = $collectOutlineItemsDFS($getRoot());
      const byId = Object.fromEntries(ordered.map((n) => [n.getId(), n]));
      expect($getOutlineDepth(byId.a)).toBe(0);
      expect($getOutlineDepth(byId.b1)).toBe(1);
      expect($getOutlineDepth(byId.b1a)).toBe(2);
      expect($getParentOutlineItem(byId.b1a)?.getId()).toBe('b1');
      expect($getParentOutlineItem(byId.a)).toBeNull();
      expect($getNestedItems(byId.b).map((n) => n.getId())).toEqual([
        'b1',
        'b2',
      ]);
    });
  });
});

describe('$getTopLevelBlockSelection', () => {
  it('keeps only roots when ancestors are also selected', () => {
    const editor = setupEditor(nestedDoc());
    selectBlocks('b', 'b1', 'b1a');
    editor.getEditorState().read(() => {
      const top = $getTopLevelBlockSelection($getRoot()).map((n) => n.getId());
      expect(top).toEqual(['b']);
    });
  });

  it('keeps siblings when no shared selected ancestor', () => {
    const editor = setupEditor(nestedDoc());
    selectBlocks('a', 'c');
    editor.getEditorState().read(() => {
      const top = $getTopLevelBlockSelection($getRoot()).map((n) => n.getId());
      expect(top).toEqual(['a', 'c']);
    });
  });
});

describe('$isHierarchicallyValidBlockSelection / $clampBlockSelectionRange', () => {
  it('accepts a contiguous parent subtree', () => {
    const editor = setupEditor(nestedDoc());
    editor.getEditorState().read(() => {
      const ordered = $collectOutlineItemsDFS($getRoot());
      const bThroughB2 = ordered.slice(1, 5); // b, b1, b1a, b2
      expect($isHierarchicallyValidBlockSelection(bThroughB2)).toBe(true);
    });
  });

  it('rejects orphan deep items without their parent', () => {
    const editor = setupEditor(nestedDoc());
    editor.getEditorState().read(() => {
      const ordered = $collectOutlineItemsDFS($getRoot());
      const orphan = [ordered[0], ordered[3]]; // a + b1a
      expect($isHierarchicallyValidBlockSelection(orphan)).toBe(false);
    });
  });

  it('keeps a valid DFS range as-is', () => {
    const editor = setupEditor(nestedDoc());
    editor.getEditorState().read(() => {
      const ordered = $collectOutlineItemsDFS($getRoot());
      expect($clampBlockSelectionRange(ordered, 'b', 'b2')).toEqual([
        'b',
        'b1',
        'b1a',
        'b2',
      ]);
    });
  });

  it('keeps a shallow valid endpoint without pulling children', () => {
    const editor = setupEditor(nestedDoc());
    editor.getEditorState().read(() => {
      const ordered = $collectOutlineItemsDFS($getRoot());
      // a → b is already a valid contiguous span (two roots)
      expect($clampBlockSelectionRange(ordered, 'a', 'b')).toEqual(['a', 'b']);
    });
  });

  it('expands to pull in ancestors when the span is invalid', () => {
    const editor = setupEditor(
      dayDoc([
        item('a', 'A', [item('a1', 'A1')]),
        item('b', 'B', [item('b1', 'B1')]),
      ]),
    );
    editor.getEditorState().read(() => {
      const ordered = $collectOutlineItemsDFS($getRoot());
      // a1 → b: invalid orphan span; b has children → expand pulls ancestor a
      const clamped = $clampBlockSelectionRange(ordered, 'a1', 'b');
      expect(clamped).toEqual(['a', 'a1', 'b']);
    });
  });

  it('stops at the farthest valid endpoint for foreign deep hops', () => {
    const editor = setupEditor(nestedDoc());
    editor.getEditorState().read(() => {
      const ordered = $collectOutlineItemsDFS($getRoot());
      // a → b1a: b1a is deep under b; without expand target rules may truncate
      const clamped = $clampBlockSelectionRange(ordered, 'a', 'b1a');
      expect(clamped[0]).toBe('a');
      expect(clamped).not.toContain('c');
    });
  });
});

describe('$hoistNestedChildren', () => {
  it('lifts nested children to following siblings in order', () => {
    const editor = setupEditor(nestedDoc());
    withItems(editor, ['b'], ([b]) => {
      $hoistNestedChildren(b);
    });
    expect(readIdTree(editor)).toEqual([
      'a',
      'b',
      ['b1', ['b1a']],
      'b2',
      'c',
    ]);
    expect(readParents(editor)).toMatchObject({
      b: null,
      b1: null,
      b2: null,
      b1a: 'b1',
    });
  });

  it('is a no-op when there are no nested children', () => {
    const editor = setupEditor(nestedDoc());
    withItems(editor, ['a'], ([a]) => {
      $hoistNestedChildren(a);
    });
    expect(readIdTree(editor)).toEqual([
      'a',
      ['b', [['b1', ['b1a']], 'b2']],
      'c',
    ]);
  });
});

describe('$relocateOutlineItems', () => {
  it('moves a subtree after another root', () => {
    const editor = setupEditor(nestedDoc());
    selectBlocks('a');
    const ok = withItems(editor, ['a', 'c'], ([a, c]) =>
      $relocateOutlineItems([a], c, 'after'),
    );
    expect(ok).toBe(true);
    expect(readIds(editor)).toEqual(['b', 'b1', 'b1a', 'b2', 'c', 'a']);
  });

  it('moves a subtree before another root', () => {
    const editor = setupEditor(nestedDoc());
    selectBlocks('c');
    const ok = withItems(editor, ['c', 'a'], ([c, a]) =>
      $relocateOutlineItems([c], a, 'before'),
    );
    expect(ok).toBe(true);
    expect(readIds(editor)).toEqual(['c', 'a', 'b', 'b1', 'b1a', 'b2']);
  });

  it('adopts the drop target nesting level', () => {
    const editor = setupEditor(nestedDoc());
    selectBlocks('c');
    const ok = withItems(editor, ['c', 'b1'], ([c, b1]) =>
      $relocateOutlineItems([c], b1, 'after'),
    );
    expect(ok).toBe(true);
    expect(readParents(editor).c).toBe('b');
    expect(readIdTree(editor)).toEqual([
      'a',
      ['b', [['b1', ['b1a']], 'c', 'b2']],
    ]);
  });

  it('rejects dropping a full subtree inside its own descendants', () => {
    const editor = setupEditor(nestedDoc());
    selectBlocks('b');
    const ok = withItems(editor, ['b', 'b1a'], ([b, b1a]) =>
      $relocateOutlineItems([b], b1a, 'after'),
    );
    expect(ok).toBe(false);
    expect(readIdTree(editor)).toEqual([
      'a',
      ['b', [['b1', ['b1a']], 'b2']],
      'c',
    ]);
  });

  it('rejects dropping onto a selected target', () => {
    const editor = setupEditor(nestedDoc());
    selectBlocks('a', 'c');
    const ok = withItems(editor, ['a', 'c'], ([a, c]) =>
      $relocateOutlineItems([a, c], a, 'after'),
    );
    expect(ok).toBe(false);
  });

  it('no-ops when already immediately before the target', () => {
    const editor = setupEditor(nestedDoc());
    selectBlocks('a');
    const ok = withItems(editor, ['a', 'b'], ([a, b]) =>
      $relocateOutlineItems([a], b, 'before'),
    );
    expect(ok).toBe(false);
  });

  it('self-only: hoists children and allows drop onto former descendants', () => {
    const editor = setupEditor(nestedDoc());
    selectSelfOnly('b');
    const ok = withItems(editor, ['b', 'b1a'], ([b, b1a]) =>
      $relocateOutlineItems([b], b1a, 'after'),
    );
    expect(ok).toBe(true);
    // Children stay; parent alone moves after b1a (still under b1)
    expect(readParents(editor)).toMatchObject({
      b1: null,
      b2: null,
      b1a: 'b1',
      b: 'b1',
    });
    expect(readIds(editor)).toEqual(['a', 'b1', 'b1a', 'b', 'b2', 'c']);
  });

  it('self-only: drop before first child leaves children behind at old level', () => {
    const editor = setupEditor(nestedDoc());
    selectSelfOnly('b');
    const ok = withItems(editor, ['b', 'a'], ([b, a]) =>
      $relocateOutlineItems([b], a, 'before'),
    );
    expect(ok).toBe(true);
    expect(readIdTree(editor)).toEqual([
      'b',
      'a',
      ['b1', ['b1a']],
      'b2',
      'c',
    ]);
  });

  it('moves multiple sibling roots together', () => {
    const editor = setupEditor(
      dayDoc([item('a', 'A'), item('b', 'B'), item('c', 'C'), item('d', 'D')]),
    );
    selectBlocks('a', 'b');
    const ok = withItems(editor, ['a', 'b', 'd'], ([a, b, d]) =>
      $relocateOutlineItems([a, b], d, 'after'),
    );
    expect(ok).toBe(true);
    expect(readIds(editor)).toEqual(['c', 'd', 'a', 'b']);
  });
});

describe('$indentOutlineItems / $outdentOutlineItems', () => {
  it('indents under the previous sibling', () => {
    const editor = setupEditor(
      dayDoc([item('a', 'A'), item('b', 'B'), item('c', 'C')]),
    );
    selectBlocks('b');
    expect(
      withItems(editor, ['b'], (targets) => $indentOutlineItems(targets)),
    ).toBe(true);
    expect(readIdTree(editor)).toEqual([['a', ['b']], 'c']);
  });

  it('cannot indent the first sibling', () => {
    const editor = setupEditor(
      dayDoc([item('a', 'A'), item('b', 'B')]),
    );
    selectBlocks('a');
    expect(
      withItems(editor, ['a'], (targets) => $indentOutlineItems(targets)),
    ).toBe(false);
  });

  it('indents multiple siblings together', () => {
    const editor = setupEditor(
      dayDoc([item('a', 'A'), item('b', 'B'), item('c', 'C')]),
    );
    selectBlocks('b', 'c');
    expect(
      withItems(editor, ['b', 'c'], (targets) => $indentOutlineItems(targets)),
    ).toBe(true);
    expect(readIdTree(editor)).toEqual([['a', ['b', 'c']]]);
  });

  it('outdents to after the parent and adopts trailing siblings', () => {
    const editor = setupEditor(
      dayDoc([
        item('a', 'A', [item('a1', 'A1'), item('a2', 'A2'), item('a3', 'A3')]),
      ]),
    );
    selectBlocks('a1');
    expect(
      withItems(editor, ['a1'], (targets) => $outdentOutlineItems(targets)),
    ).toBe(true);
    // a2, a3 were trailing siblings → adopted under a1
    expect(readIdTree(editor)).toEqual(['a', ['a1', ['a2', 'a3']]]);
  });

  it('cannot outdent a root item', () => {
    const editor = setupEditor(dayDoc([item('a', 'A')]));
    selectBlocks('a');
    expect(
      withItems(editor, ['a'], (targets) => $outdentOutlineItems(targets)),
    ).toBe(false);
  });

  it('self-only indent hoists children before nesting the parent', () => {
    const editor = setupEditor(
      dayDoc([
        item('a', 'A'),
        item('b', 'B', [item('b1', 'B1')]),
      ]),
    );
    selectSelfOnly('b');
    expect(
      withItems(editor, ['b'], (targets) => $indentOutlineItems(targets)),
    ).toBe(true);
    expect(readIdTree(editor)).toEqual([['a', ['b']], 'b1']);
  });
});

describe('$moveOutlineItemsUp / $moveOutlineItemsDown', () => {
  it('swaps with the previous sibling', () => {
    const editor = setupEditor(
      dayDoc([item('a', 'A'), item('b', 'B'), item('c', 'C')]),
    );
    selectBlocks('b');
    expect(
      withItems(editor, ['b'], (t) => $moveOutlineItemsUp(t)),
    ).toBe(true);
    expect(readIds(editor)).toEqual(['b', 'a', 'c']);
  });

  it('swaps with the next sibling', () => {
    const editor = setupEditor(
      dayDoc([item('a', 'A'), item('b', 'B'), item('c', 'C')]),
    );
    selectBlocks('b');
    expect(
      withItems(editor, ['b'], (t) => $moveOutlineItemsDown(t)),
    ).toBe(true);
    expect(readIds(editor)).toEqual(['a', 'c', 'b']);
  });

  it('moves out before parent when already first child', () => {
    const editor = setupEditor(
      dayDoc([item('a', 'A', [item('a1', 'A1'), item('a2', 'A2')])]),
    );
    selectBlocks('a1');
    expect(
      withItems(editor, ['a1'], (t) => $moveOutlineItemsUp(t)),
    ).toBe(true);
    expect(readIdTree(editor)).toEqual(['a1', ['a', ['a2']]]);
  });

  it('moves into next aunt when last child', () => {
    const editor = setupEditor(
      dayDoc([
        item('a', 'A', [item('a1', 'A1')]),
        item('b', 'B', [item('b1', 'B1')]),
      ]),
    );
    selectBlocks('a1');
    expect(
      withItems(editor, ['a1'], (t) => $moveOutlineItemsDown(t)),
    ).toBe(true);
    expect(readIdTree(editor)).toEqual(['a', ['b', ['a1', 'b1']]]);
  });

  it('cannot move the only root item up', () => {
    const editor = setupEditor(dayDoc([item('a', 'A')]));
    selectBlocks('a');
    expect(
      withItems(editor, ['a'], (t) => $moveOutlineItemsUp(t)),
    ).toBe(false);
  });

  it('self-only move down leaves children in place', () => {
    const editor = setupEditor(
      dayDoc([
        item('a', 'A', [item('a1', 'A1')]),
        item('b', 'B'),
      ]),
    );
    selectSelfOnly('a');
    expect(
      withItems(editor, ['a'], (t) => $moveOutlineItemsDown(t)),
    ).toBe(true);
    // Hoist → a, a1, b; then move a after a1 → a1, a, b
    expect(readIdTree(editor)).toEqual(['a1', 'a', 'b']);
  });

  it('moves a multi-item selection as a block', () => {
    const editor = setupEditor(
      dayDoc([
        item('a', 'A'),
        item('b', 'B'),
        item('c', 'C'),
        item('d', 'D'),
      ]),
    );
    selectBlocks('b', 'c');
    expect(
      withItems(editor, ['b', 'c'], (t) => $moveOutlineItemsDown(t)),
    ).toBe(true);
    expect(readIds(editor)).toEqual(['a', 'd', 'b', 'c']);
  });
});
