import { useEffect, useRef } from 'react';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import {
  setPwaSaveBusy,
  touchPwaEditorActivity,
} from '../../pwa/updateStore';
import { getSettings } from '../../settings/settingsStore';
import {
  debugLog,
  isDebugEnabled,
  markSavePending,
  markSaveStart,
} from '../../storage/debugStore';
import type { DayDocument } from '../../types';
import { editorToDayDocument } from '../serialize';

type Props = {
  date: string;
  enabled: boolean;
  onSave: (doc: DayDocument) => Promise<void>;
  onChange?: (doc: DayDocument) => void;
};

/**
 * Debounced disk save + rAF-throttled live doc sync.
 * Avoids full-tree serialize on every keystroke.
 */
export function PersistencePlugin({
  date,
  enabled,
  onSave,
  onChange,
}: Props): null {
  const [editor] = useLexicalComposerContext();
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const changeRaf = useRef<number | null>(null);
  const needsChangeFlush = useRef(false);
  const dateRef = useRef(date);
  const onSaveRef = useRef(onSave);
  const onChangeRef = useRef(onChange);

  dateRef.current = date;
  onSaveRef.current = onSave;
  onChangeRef.current = onChange;

  useEffect(() => {
    if (!enabled) return;

    let coalescedUpdates = 0;
    let lastEditorLogAt = 0;
    let lastSerializeMs = 0;
    let lastDirtyE = 0;
    let lastDirtyL = 0;
    let saveGen = 0;

    const serialize = (): DayDocument => {
      const debugOn = isDebugEnabled();
      const t0 = debugOn ? performance.now() : 0;
      const doc = editorToDayDocument(editor, dateRef.current);
      if (debugOn) {
        lastSerializeMs = Math.round(performance.now() - t0);
      }
      return doc;
    };

    const flushChange = () => {
      changeRaf.current = null;
      if (!needsChangeFlush.current) return;
      needsChangeFlush.current = false;
      const doc = serialize();
      if (isDebugEnabled() && coalescedUpdates > 0) {
        const now = performance.now();
        if (now - lastEditorLogAt > 500) {
          debugLog(
            'debug',
            'editor',
            `update ${dateRef.current}`,
            `×${coalescedUpdates} · serialize ${lastSerializeMs}ms · dirtyE=${lastDirtyE} dirtyL=${lastDirtyL}`,
          );
          coalescedUpdates = 0;
          lastEditorLogAt = now;
        }
      }
      onChangeRef.current?.(doc);
    };

    const scheduleChange = () => {
      needsChangeFlush.current = true;
      if (changeRaf.current == null) {
        changeRaf.current = requestAnimationFrame(flushChange);
      }
    };

    return editor.registerUpdateListener(({ dirtyElements, dirtyLeaves, tags }) => {
      if (tags.has('historic') || tags.has('load') || tags.has('block-selection')) {
        return;
      }
      if (dirtyElements.size === 0 && dirtyLeaves.size === 0) return;

      const debugOn = isDebugEnabled();
      if (debugOn) {
        lastDirtyE = dirtyElements.size;
        lastDirtyL = dirtyLeaves.size;
        coalescedUpdates += 1;
      }

      touchPwaEditorActivity();
      setPwaSaveBusy(true);
      scheduleChange();
      if (debugOn) markSavePending(dateRef.current);

      if (saveTimer.current) clearTimeout(saveTimer.current);
      const delay = getSettings().saveDebounceMs;
      const gen = ++saveGen;
      saveTimer.current = setTimeout(() => {
        saveTimer.current = null;
        // Coalesce with any pending rAF so we serialize once for change + save.
        if (changeRaf.current != null) {
          cancelAnimationFrame(changeRaf.current);
          changeRaf.current = null;
        }
        needsChangeFlush.current = false;

        const doc = serialize();
        if (isDebugEnabled()) {
          if (coalescedUpdates > 0) {
            debugLog(
              'debug',
              'editor',
              `update ${dateRef.current}`,
              `×${coalescedUpdates} (pre-flush) · serialize ${lastSerializeMs}ms`,
            );
            coalescedUpdates = 0;
            lastEditorLogAt = performance.now();
          }
          debugLog(
            'debug',
            'editor',
            `flush serialize ${doc.date}`,
            `${lastSerializeMs}ms`,
          );
          markSaveStart(doc.date);
        }
        onChangeRef.current?.(doc);
        void Promise.resolve(onSaveRef.current(doc)).finally(() => {
          if (gen === saveGen) setPwaSaveBusy(false);
        });
      }, delay);
    });
  }, [editor, enabled]);

  useEffect(() => {
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      if (changeRaf.current != null) cancelAnimationFrame(changeRaf.current);
      setPwaSaveBusy(false);
    };
  }, []);

  return null;
}
