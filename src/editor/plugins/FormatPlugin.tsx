import { useEffect } from 'react';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { FORMAT_TEXT_COMMAND } from 'lexical';

export function FormatPlugin(): null {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const meta = event.metaKey || event.ctrlKey;
      if (!meta || event.altKey) return;
      const key = event.key.toLowerCase();
      if (key === 'b') {
        event.preventDefault();
        editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'bold');
      } else if (key === 'i') {
        event.preventDefault();
        editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'italic');
      } else if (key === 'u') {
        event.preventDefault();
        editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'underline');
      }
    };

    return editor.registerRootListener((root, prev) => {
      if (prev) prev.removeEventListener('keydown', onKeyDown);
      if (root) root.addEventListener('keydown', onKeyDown);
    });
  }, [editor]);

  return null;
}
