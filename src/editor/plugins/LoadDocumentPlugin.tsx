import { useEffect, useRef } from 'react';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import type { DayDocument } from '../../types';
import { $loadDayDocument } from '../serialize';

type Props = {
  document: DayDocument;
};

/** Loads document once when the editor mounts / date key changes. */
export function LoadDocumentPlugin({ document }: Props): null {
  const [editor] = useLexicalComposerContext();
  const loaded = useRef(false);
  const docRef = useRef(document);
  docRef.current = document;

  useEffect(() => {
    loaded.current = false;
  }, [document.date]);

  useEffect(() => {
    if (loaded.current) return;
    loaded.current = true;
    editor.update(
      () => {
        $loadDayDocument(docRef.current);
      },
      { tag: 'load' },
    );
  }, [editor, document.date]);

  return null;
}
