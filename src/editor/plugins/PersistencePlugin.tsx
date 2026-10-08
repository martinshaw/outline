import { useEffect, useRef } from 'react';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { getSettings } from '../../settings/settingsStore';
import {
  markSavePending,
  markSaveStart,
} from '../../storage/saveDebugStore';
import type { DayDocument } from '../../types';
import { editorToDayDocument } from '../serialize';

type Props = {
  date: string;
  enabled: boolean;
  onSave: (doc: DayDocument) => Promise<void>;
  onChange?: (doc: DayDocument) => void;
};

export function PersistencePlugin({
  date,
  enabled,
  onSave,
  onChange,
}: Props): null {
  const [editor] = useLexicalComposerContext();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dateRef = useRef(date);
  const onSaveRef = useRef(onSave);
  const onChangeRef = useRef(onChange);

  dateRef.current = date;
  onSaveRef.current = onSave;
  onChangeRef.current = onChange;

  useEffect(() => {
    if (!enabled) return;

    return editor.registerUpdateListener(({ dirtyElements, dirtyLeaves, tags }) => {
      if (tags.has('historic') || tags.has('load') || tags.has('block-selection')) {
        return;
      }
      if (dirtyElements.size === 0 && dirtyLeaves.size === 0) return;

      const liveDoc = editorToDayDocument(editor, dateRef.current);
      onChangeRef.current?.(liveDoc);

      markSavePending(dateRef.current);
      if (timer.current) clearTimeout(timer.current);
      const delay = getSettings().saveDebounceMs;
      timer.current = setTimeout(() => {
        const doc = editorToDayDocument(editor, dateRef.current);
        markSaveStart(doc.date);
        void onSaveRef.current(doc);
      }, delay);
    });
  }, [editor, enabled]);

  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  return null;
}
