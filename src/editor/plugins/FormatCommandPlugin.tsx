import { useEffect } from 'react';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { TOGGLE_LINK_COMMAND } from '@lexical/link';
import {
  $getSelection,
  $isRangeSelection,
  FORMAT_TEXT_COMMAND,
  type TextFormatType,
} from 'lexical';

/** Command-palette text formatting actions. */
export const FORMAT_TEXT_EVENT = 'outline:format-text';

export type FormatTextMode =
  | 'bold'
  | 'italic'
  | 'underline'
  | 'clear'
  | 'remove-link';

const TOGGLE_FORMATS: TextFormatType[] = ['bold', 'italic', 'underline'];

/**
 * Applies format commands from the command palette (and similar UI) while the
 * editor may not hold DOM focus.
 */
export function FormatCommandPlugin(): null {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    const onFormat = (event: Event) => {
      const mode = (event as CustomEvent<{ mode?: FormatTextMode }>).detail
        ?.mode;
      if (!mode) return;

      editor.focus();

      if (mode === 'remove-link') {
        editor.dispatchCommand(TOGGLE_LINK_COMMAND, null);
        return;
      }

      if (mode === 'clear') {
        editor.update(() => {
          const selection = $getSelection();
          if (!$isRangeSelection(selection)) return;
          for (const format of TOGGLE_FORMATS) {
            if (selection.hasFormat(format)) selection.toggleFormat(format);
          }
        });
        return;
      }

      editor.dispatchCommand(FORMAT_TEXT_COMMAND, mode);
    };

    window.addEventListener(FORMAT_TEXT_EVENT, onFormat);
    return () => window.removeEventListener(FORMAT_TEXT_EVENT, onFormat);
  }, [editor]);

  return null;
}
