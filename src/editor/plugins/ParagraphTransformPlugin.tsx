import { useEffect } from 'react';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import {
  $createTextNode,
  $isRootNode,
  ParagraphNode,
} from 'lexical';
import { createId } from '../../utils/id';
import {
  $createOutlineItemNode,
  $isOutlineItemNode,
} from '../nodes/OutlineItemNode';

/**
 * Convert ParagraphNodes into OutlineItemNodes so the doc stays a pure outline.
 * Empty paragraphs are Lexical selection/split artifacts — drop them when the
 * outline already has rows (otherwise Cmd+A / range edits leave orphan bullets).
 */
export function ParagraphTransformPlugin(): null {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    return editor.registerNodeTransform(ParagraphNode, (paragraph) => {
      const parent = paragraph.getParent();
      if (!parent) return;

      const empty =
        paragraph.getChildrenSize() === 0 ||
        paragraph.getTextContent() === '';

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

      const item = $createOutlineItemNode(createId(), 'note');
      const children = paragraph.getChildren();
      if (children.length === 0) {
        item.append($createTextNode(''));
      } else {
        item.append(...children);
      }
      paragraph.replace(item);
    });
  }, [editor]);

  return null;
}
