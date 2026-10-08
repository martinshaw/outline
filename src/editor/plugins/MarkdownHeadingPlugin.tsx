import { useEffect } from 'react';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { TextNode } from 'lexical';
import type { HeadingLevel } from '../../types';
import { $isOutlineItemNode } from '../nodes/OutlineItemNode';
import { $getContentChildren } from '../utils/outlineHelpers';

const HEADING_RE = /^(#{1,6}) (.*)$/;

/**
 * Markdown-style headings: typing `# ` … `###### ` at the start of a block
 * converts it to a heading node (level 1–6).
 */
export function MarkdownHeadingPlugin(): null {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    return editor.registerNodeTransform(TextNode, (textNode) => {
      const parent = textNode.getParent();
      if (!$isOutlineItemNode(parent)) return;

      const content = $getContentChildren(parent);
      if (content[0] !== textNode) return;

      const raw = textNode.getTextContent();
      const match = HEADING_RE.exec(raw);
      if (!match) return;

      const level = match[1].length as HeadingLevel;
      const rest = match[2];
      textNode.setTextContent(rest);
      parent.setHeading(level);
    });
  }, [editor]);

  return null;
}
