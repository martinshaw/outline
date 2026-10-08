import { useEffect } from 'react';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import {
  $createTextNode,
  $getRoot,
  $isParagraphNode,
  ParagraphNode,
} from 'lexical';
import { createId } from '../../utils/id';
import { $createOutlineItemNode, $isOutlineItemNode } from '../nodes/OutlineItemNode';

/** Convert any ParagraphNode into an OutlineItemNode so the doc stays a pure outline. */
export function ParagraphTransformPlugin(): null {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    return editor.registerNodeTransform(ParagraphNode, (paragraph) => {
      const parent = paragraph.getParent();
      if (!parent) return;

      const item = $createOutlineItemNode(createId(), 'note');
      const children = paragraph.getChildren();
      if (children.length === 0) {
        item.append($createTextNode(''));
      } else {
        item.append(...children);
      }
      paragraph.replace(item);

      // If somehow nested under another paragraph path left root with only non-outline, fix
      const root = $getRoot();
      if (root.getChildren().every((c) => !$isOutlineItemNode(c) && !$isParagraphNode(c))) {
        // no-op
      }
    });
  }, [editor]);

  return null;
}
