import { AutoLinkNode, LinkNode } from '@lexical/link';
import {
  $createTextNode,
  $getRoot,
  createEditor,
  type LexicalEditor,
} from 'lexical';
import {
  resetBlockSelectionStore,
  setBlockSelectedIds,
  setBlockSelfOnlyIds,
} from '../blockSelectionStore';
import {
  $createOutlineItemNode,
  $isOutlineItemNode,
  OutlineItemNode,
} from '../nodes/OutlineItemNode';
import { $loadDayDocument, editorToDayDocument } from '../serialize';
import {
  $collectOutlineItemsDFS,
  $findOutlineItemById,
} from '../utils/outlineHelpers';
import type {
  DayDocument,
  InlineSegment,
  OutlineItem,
} from '../../types';
import { DAY_DOCUMENT_VERSION } from '../../types';

/** Headless Lexical editor with outline + link nodes. */
export function createOutlineTestEditor(): LexicalEditor {
  return createEditor({
    namespace: 'OutlineTest',
    nodes: [OutlineItemNode, LinkNode, AutoLinkNode],
    onError: (error) => {
      throw error;
    },
  });
}

export function textSeg(text: string): InlineSegment[] {
  return [{ type: 'text', text }];
}

export function item(
  id: string,
  text: string,
  children: OutlineItem[] = [],
  extras: Partial<OutlineItem> = {},
): OutlineItem {
  return {
    id,
    kind: extras.kind ?? 'note',
    headingLevel: extras.headingLevel ?? null,
    status: extras.status ?? null,
    deadline: extras.deadline ?? null,
    entities: extras.entities ?? [],
    attachment: extras.attachment ?? null,
    content: extras.content ?? textSeg(text),
    children,
  };
}

export function dayDoc(
  items: OutlineItem[],
  date = '2026-10-10',
): DayDocument {
  return { version: DAY_DOCUMENT_VERSION, date, items };
}

/** Reset selection store and load a day document into a fresh editor. */
export function setupEditor(doc: DayDocument): LexicalEditor {
  resetBlockSelectionStore();
  const editor = createOutlineTestEditor();
  editor.update(
    () => {
      $loadDayDocument(doc);
    },
    { discrete: true },
  );
  return editor;
}

/** Build a compact id-tree from the live editor. */
export function readIdTree(editor: LexicalEditor): unknown {
  return editorToDayDocument(editor, 'x').items.map(function walk(
    n: OutlineItem,
  ): unknown {
    if (n.children.length === 0) return n.id;
    return [n.id, n.children.map(walk)];
  });
}

/** Flat DFS ids. */
export function readIds(editor: LexicalEditor): string[] {
  let ids: string[] = [];
  editor.getEditorState().read(() => {
    ids = $collectOutlineItemsDFS($getRoot()).map((n) => n.getId());
  });
  return ids;
}

/** Parent id map: id → parent id | null (root). */
export function readParents(
  editor: LexicalEditor,
): Record<string, string | null> {
  const parents: Record<string, string | null> = {};
  editor.getEditorState().read(() => {
    for (const n of $collectOutlineItemsDFS($getRoot())) {
      const p = n.getParent();
      parents[n.getId()] = $isOutlineItemNode(p) ? p.getId() : null;
    }
  });
  return parents;
}

export function withItems(
  editor: LexicalEditor,
  ids: string[],
  fn: (nodes: OutlineItemNode[]) => boolean | void,
): boolean {
  let ok = true;
  editor.update(
    () => {
      const root = $getRoot();
      const nodes = ids.map((id) => {
        const n = $findOutlineItemById(root, id);
        if (!n) throw new Error(`Missing outline item ${id}`);
        return n;
      });
      const result = fn(nodes);
      if (typeof result === 'boolean') ok = result;
    },
    { discrete: true },
  );
  return ok;
}

export function selectBlocks(...ids: string[]): void {
  setBlockSelectedIds(ids);
  setBlockSelfOnlyIds([]);
}

export function selectSelfOnly(id: string): void {
  setBlockSelectedIds([id]);
  setBlockSelfOnlyIds([id]);
}

export {
  resetBlockSelectionStore,
  setBlockSelectedIds,
  setBlockSelfOnlyIds,
  getBlockSelectedIds,
  getBlockSelfOnlyIds,
} from '../blockSelectionStore';

/** Append a note under root (when not using day docs). */
export function $appendNote(id: string, text: string): OutlineItemNode {
  const node = $createOutlineItemNode(id, 'note');
  node.append($createTextNode(text));
  $getRoot().append(node);
  return node;
}
