import { useEffect, useState } from 'react';
import {
  getBlockSelectedIds,
  subscribeBlockSelection,
} from '../editor/blockSelectionStore';
import {
  getSaveDebugState,
  subscribeSaveDebug,
  type SaveDebugState,
} from '../storage/saveDebugStore';
import type { DayDocument } from '../types';
import { isDayEmpty } from '../utils/outline';

type Props = {
  activeDate: string;
  activeDoc: DayDocument;
  focusItemId: string | null;
  folderName: string;
  offline: boolean;
  editorNonce: number;
  sidebarDayCount: number;
};

function countItems(doc: DayDocument): number {
  let n = 0;
  const walk = (items: DayDocument['items']) => {
    for (const item of items) {
      n += 1;
      walk(item.children);
    }
  };
  walk(doc.items);
  return n;
}

function formatTime(at: number | null): string {
  if (at == null) return '—';
  return new Date(at).toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

export function DebugOverlay({
  activeDate,
  activeDoc,
  focusItemId,
  folderName,
  offline,
  editorNonce,
  sidebarDayCount,
}: Props) {
  const [selected, setSelected] = useState(() => [...getBlockSelectedIds()]);
  const [save, setSave] = useState<SaveDebugState>(() => getSaveDebugState());

  useEffect(() => {
    return subscribeBlockSelection(() => {
      setSelected([...getBlockSelectedIds()]);
    });
  }, []);

  useEffect(() => {
    return subscribeSaveDebug(() => {
      setSave(getSaveDebugState());
    });
  }, []);

  const shortIds = selected.map((id) => id.slice(0, 8));

  return (
    <div className="debug-overlay" aria-hidden>
      <div>date {activeDate}</div>
      <div>
        items {countItems(activeDoc)}
        {isDayEmpty(activeDoc) ? ' (empty)' : ''}
      </div>
      <div>sidebar days {sidebarDayCount}</div>
      <div>nonce {editorNonce}</div>
      <div>folder {folderName}</div>
      <div>net {offline ? 'offline' : 'online'}</div>
      <div>focus {focusItemId ? focusItemId.slice(0, 8) : '—'}</div>
      <div>
        sel {selected.length}
        {shortIds.length > 0 ? `: ${shortIds.join(' ')}` : ''}
      </div>
      <div>save {save.phase}</div>
      <div>save msg {save.message}</div>
      <div>save at {formatTime(save.at)}</div>
      <div>save n {save.count}</div>
      {save.lastError && <div>save err {save.lastError}</div>}
    </div>
  );
}
