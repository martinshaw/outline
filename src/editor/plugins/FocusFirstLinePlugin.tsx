import { useEffect } from 'react';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { $getRoot } from 'lexical';
import { $isOutlineItemNode } from '../nodes/OutlineItemNode';

type Props = {
  /** Bumps when the first outline row should receive the caret. */
  requestKey: number;
};

/** Focus the editor and place the caret at the start of the first item. */
export function FocusFirstLinePlugin({ requestKey }: Props): null {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    if (requestKey <= 0) return;
    // Wait a tick so LoadDocumentPlugin can finish replacing the tree.
    const id = window.setTimeout(() => {
      editor.focus();
      editor.update(() => {
        const first = $getRoot().getFirstChild();
        if ($isOutlineItemNode(first)) first.selectStart();
        else $getRoot().selectStart();
      });
    }, 0);
    return () => window.clearTimeout(id);
  }, [editor, requestKey]);

  return null;
}
