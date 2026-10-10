import { describe, expect, it } from 'vitest';
import {
  $createParagraphNode,
  $createTextNode,
  $getRoot,
  $getSelection,
  $isParagraphNode,
  $isRangeSelection,
  $isRootNode,
  $selectAll,
  ParagraphNode,
} from 'lexical';
import {
  createOutlineTestEditor,
  dayDoc,
  item,
  readIds,
  setupEditor,
} from './test/harness';
import { editorToDayDocument, $loadDayDocument } from './serialize';
import {
  $createOutlineItemNode,
  $isOutlineItemNode,
} from './nodes/OutlineItemNode';
import { createId } from '../utils/id';

function itemTexts(editor: ReturnType<typeof setupEditor>): string[] {
  const doc = editorToDayDocument(editor, '2026-10-10');
  const out: string[] = [];
  const walk = (n: (typeof doc.items)[number]) => {
    out.push(n.content.map((s) => ('text' in s ? s.text : '')).join(''));
    n.children.forEach(walk);
  };
  doc.items.forEach(walk);
  return out;
}

/** Mirror ParagraphTransformPlugin for headless tests. */
function registerParagraphTransform(
  editor: ReturnType<typeof createOutlineTestEditor>,
): void {
  editor.registerNodeTransform(ParagraphNode, (paragraph) => {
    const parent = paragraph.getParent();
    if (!parent) return;
    const empty =
      paragraph.getChildrenSize() === 0 || paragraph.getTextContent() === '';
    if (empty) {
      if ($isOutlineItemNode(parent)) {
        paragraph.remove();
        return;
      }
      if ($isRootNode(parent)) {
        const hasOutlineSibling = parent
          .getChildren()
          .some((c) => c !== paragraph && $isOutlineItemNode(c));
        if (hasOutlineSibling) {
          paragraph.remove();
          return;
        }
      }
    }
    const itemNode = $createOutlineItemNode(createId(), 'note');
    const children = paragraph.getChildren();
    if (children.length === 0) itemNode.append($createTextNode(''));
    else itemNode.append(...children);
    paragraph.replace(itemNode);
  });
}

describe('$selectAll on outline', () => {
  it('does not empty or orphan outline items', () => {
    const editor = setupEditor(
      dayDoc([
        item('a', 'parent', [item('b', 'child')]),
        item('c', 'sib'),
      ]),
    );

    editor.update(
      () => {
        $selectAll();
      },
      { discrete: true },
    );

    expect(itemTexts(editor)).toEqual(['parent', 'child', 'sib']);
    expect(readIds(editor)).toEqual(['a', 'b', 'c']);

    editor.getEditorState().read(() => {
      const sel = $getSelection();
      expect($isRangeSelection(sel)).toBe(true);
      if ($isRangeSelection(sel)) {
        expect(sel.isCollapsed()).toBe(false);
        expect(sel.getTextContent()).toContain('parent');
        expect(sel.getTextContent()).toContain('child');
        expect(sel.getTextContent()).toContain('sib');
      }
    });
  });

  it('typing after select-all does not leave orphan empty items', () => {
    const editor = setupEditor(
      dayDoc([
        item('a', 'parent', [item('b', 'child')]),
        item('c', 'sib'),
      ]),
    );

    editor.update(
      () => {
        $selectAll();
        const sel = $getSelection();
        if ($isRangeSelection(sel)) {
          sel.insertText('x');
        }
      },
      { discrete: true },
    );

    expect(itemTexts(editor).filter((t) => t === '')).toEqual([]);
    expect(itemTexts(editor).join('')).toContain('x');
  });

  it('delete after select-all does not leave orphan empty items', () => {
    const editor = setupEditor(
      dayDoc([
        item('a', 'parent', [item('b', 'child')]),
        item('c', 'sib'),
      ]),
    );

    editor.update(
      () => {
        $selectAll();
        const sel = $getSelection();
        if ($isRangeSelection(sel)) {
          sel.removeText();
        }
      },
      { discrete: true },
    );

    expect(readIds(editor).length).toBeLessThanOrEqual(1);
  });

  it('drops empty paragraph artifacts instead of creating orphan rows', () => {
    const editor = createOutlineTestEditor();
    registerParagraphTransform(editor);

    editor.update(
      () => {
        $loadDayDocument(
          dayDoc([
            item('a', 'parent', [item('b', 'child')]),
            item('c', 'sib'),
          ]),
        );
      },
      { discrete: true },
    );

    editor.update(
      () => {
        $getRoot().append($createParagraphNode());
      },
      { discrete: true },
    );
    editor.update(() => {}, { discrete: true });

    expect(itemTexts(editor)).toEqual(['parent', 'child', 'sib']);
    expect(readIds(editor)).toEqual(['a', 'b', 'c']);
    editor.getEditorState().read(() => {
      expect($getRoot().getChildren().some($isParagraphNode)).toBe(false);
    });
  });
});
