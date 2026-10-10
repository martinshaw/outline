import { useEffect } from 'react';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { COMMAND_PRIORITY_CRITICAL, PASTE_COMMAND } from 'lexical';
import {
  beginPasteIdRemap,
  endPasteIdRemap,
} from '../outlineIdRemap';
import { $repairDuplicateOutlineIds } from '../utils/outlineHelpers';

/**
 * During paste, remapping outline ids so copied tasks/notes become independent
 * rows. Also repairs any duplicate ids left in the document after paste.
 */
export function PasteOutlinePlugin(): null {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    return editor.registerCommand(
      PASTE_COMMAND,
      () => {
        beginPasteIdRemap();
        queueMicrotask(() => {
          endPasteIdRemap();
          editor.update(() => {
            $repairDuplicateOutlineIds();
          });
        });
        return false;
      },
      COMMAND_PRIORITY_CRITICAL,
    );
  }, [editor]);

  return null;
}
