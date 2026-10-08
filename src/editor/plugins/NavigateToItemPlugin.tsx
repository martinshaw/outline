import { useEffect } from 'react';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { $getRoot } from 'lexical';
import { setBlockSelectedIds } from '../blockSelectionStore';
import { $findOutlineItemById } from '../utils/outlineHelpers';

type Props = {
  focusItemId: string | null;
  onFocused?: () => void;
};

export function NavigateToItemPlugin({ focusItemId, onFocused }: Props): null {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    if (!focusItemId) return;

    editor.update(() => {
      const item = $findOutlineItemById($getRoot(), focusItemId);
      if (!item) return;
      item.selectStart();
    });

    setBlockSelectedIds([focusItemId]);

    requestAnimationFrame(() => {
      const el = editor
        .getRootElement()
        ?.querySelector(`[data-outline-id="${focusItemId}"]`);
      el?.scrollIntoView({ block: 'center', behavior: 'smooth' });
      onFocused?.();
    });
  }, [editor, focusItemId, onFocused]);

  return null;
}
