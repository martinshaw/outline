import { useEffect } from 'react';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import {
  $createTextNode,
  $getRoot,
  $getSelection,
  $isRangeSelection,
  COMMAND_PRIORITY_HIGH,
  PASTE_COMMAND,
} from 'lexical';
import { mergeRegister } from '@lexical/utils';
import { showErrorToast } from '../../components/toastStore';
import type { AttachmentMeta } from '../../storage/attachments';
import { notesClient } from '../../storage/notesClient';
import { createId } from '../../utils/id';
import {
  $createOutlineItemNode,
  $isOutlineItemNode,
  type OutlineItemNode,
} from '../nodes/OutlineItemNode';
import {
  $getOutlineItem,
  $getSelectedOutlineItem,
} from '../utils/outlineHelpers';

function $insertSiblingAfter(
  item: OutlineItemNode,
  newItem: OutlineItemNode,
): void {
  const parent = item.getParent();
  if (!parent) {
    item.insertAfter(newItem);
    return;
  }
  const index = item.getIndexWithinParent();
  parent.splice(index + 1, 0, [newItem]);
}

function $anchorItemForInsert(): OutlineItemNode | null {
  const selected = $getSelectedOutlineItem();
  if (selected) return selected;
  const selection = $getSelection();
  if ($isRangeSelection(selection)) {
    const fromNode = $getOutlineItem(selection.anchor.getNode());
    if (fromNode) return fromNode;
  }
  const top = $getRoot().getChildren().filter($isOutlineItemNode);
  return top[top.length - 1] ?? null;
}

function collectFiles(data: DataTransfer | null): File[] {
  if (!data?.files?.length) return [];
  return Array.from(data.files).filter((file) => file != null);
}

/**
 * Drag-drop and paste files into the outline. Writes binaries under
 * workspace `attachments/` and inserts `attachment` outline items.
 */
export function AttachmentPlugin(): null {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    let inserting = false;

    const insertFiles = async (files: File[]) => {
      if (!files.length || inserting) return;
      if (!notesClient.isReady()) {
        showErrorToast('Open a notes folder before adding attachments');
        return;
      }
      inserting = true;
      try {
        const metas: AttachmentMeta[] = [];
        for (const file of files) {
          try {
            metas.push(await notesClient.writeAttachment(file));
          } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            showErrorToast(`Could not save ${file.name}: ${msg}`);
          }
        }
        if (metas.length === 0) return;

        editor.focus();
        editor.update(() => {
          let anchor = $anchorItemForInsert();
          for (const meta of metas) {
            const node = $createOutlineItemNode(
              createId(),
              'attachment',
              null,
              null,
              null,
              null,
              meta,
            );
            node.append($createTextNode(''));
            if (anchor) $insertSiblingAfter(anchor, node);
            else $getRoot().append(node);
            anchor = node;
          }
          anchor?.selectEnd();
        });
      } finally {
        inserting = false;
      }
    };

    const onDragOver = (event: DragEvent) => {
      const types = event.dataTransfer?.types;
      if (!types || !Array.from(types).includes('Files')) return;
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
    };

    const onDrop = (event: DragEvent) => {
      const files = collectFiles(event.dataTransfer);
      if (files.length === 0) return;
      event.preventDefault();
      event.stopPropagation();
      void insertFiles(files);
    };

    return mergeRegister(
      editor.registerCommand(
        PASTE_COMMAND,
        (event) => {
          const clipboard =
            event instanceof ClipboardEvent ? event.clipboardData : null;
          const files = collectFiles(clipboard);
          if (files.length === 0) return false;
          // Prefer files over plain-text paste when both are present.
          event?.preventDefault();
          void insertFiles(files);
          return true;
        },
        COMMAND_PRIORITY_HIGH,
      ),
      editor.registerRootListener((root, prev) => {
        if (prev) {
          prev.removeEventListener('dragover', onDragOver);
          prev.removeEventListener('drop', onDrop);
        }
        if (root) {
          root.addEventListener('dragover', onDragOver);
          root.addEventListener('drop', onDrop);
        }
      }),
    );
  }, [editor]);

  return null;
}
