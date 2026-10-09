import { useEffect } from 'react';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import {
  $createTextNode,
  $getRoot,
  $getSelection,
  $isRangeSelection,
  $isTextNode,
  COMMAND_PRIORITY_HIGH,
  INSERT_PARAGRAPH_COMMAND,
  KEY_BACKSPACE_COMMAND,
  KEY_ENTER_COMMAND,
  type ElementNode,
  type LexicalNode,
} from 'lexical';
import { mergeRegister } from '@lexical/utils';
import { createId } from '../../utils/id';
import {
  $createOutlineItemNode,
  $isOutlineItemNode,
  type OutlineItemNode,
} from '../nodes/OutlineItemNode';
import {
  $getContentChildren,
  $getNestedItems,
  $getParentOutlineItem,
  $getSelectedOutlineItem,
  $isAtStartOfItem,
} from '../utils/outlineHelpers';

/** Insert as the next sibling of `item` (same parent, immediately after). */
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
  (parent as ElementNode).splice(index + 1, 0, [newItem]);
}

function $isItemTextEmpty(item: OutlineItemNode): boolean {
  const content = $getContentChildren(item);
  return (
    content.length === 0 ||
    content.every((c) => c.getTextContent() === '')
  );
}

/**
 * Move `item` (and its nested children) to the parent level,
 * immediately after its current parent outline item.
 */
function $outdentItem(item: OutlineItemNode): boolean {
  const parent = $getParentOutlineItem(item);
  if (!parent) return false;

  const parentParent = parent.getParent();
  const parentIndex = parent.getIndexWithinParent();
  item.remove();
  if (parentParent) {
    (parentParent as ElementNode).splice(parentIndex + 1, 0, [item]);
  } else {
    parent.insertAfter(item);
  }
  item.selectStart();
  return true;
}

/** True when caret is at the end of the item's own text (no trailing content). */
function $isCaretAtEndOfItemContent(
  item: OutlineItemNode,
  anchorNode: LexicalNode,
  offset: number,
): boolean {
  if (!$isTextNode(anchorNode) || anchorNode.getParent() !== item) {
    // Empty item or caret in link/wrapper — treat as end if no content after
    const content = $getContentChildren(item);
    if (content.length === 0) return true;
    return content.every((c) => c.getTextContent() === '');
  }
  if (offset < anchorNode.getTextContentSize()) return false;
  const content = $getContentChildren(item);
  const idx = content.indexOf(anchorNode);
  if (idx < 0) return true;
  for (let i = idx + 1; i < content.length; i++) {
    if (content[i].getTextContent().length > 0) return false;
  }
  return true;
}

/** Insert as the first nested child of `parent`. */
function $insertAsFirstChild(
  parent: OutlineItemNode,
  newItem: OutlineItemNode,
): void {
  const nested = $getNestedItems(parent);
  if (nested.length > 0) {
    nested[0].insertBefore(newItem);
  } else {
    parent.append(newItem);
  }
}

function $handleEnter(): boolean {
  const item = $getSelectedOutlineItem();
  if (!item) return false;

  const selection = $getSelection();
  if (!$isRangeSelection(selection)) return false;

  if (!selection.isCollapsed()) {
    selection.removeText();
  }

  // Re-read selection / item after possible delete
  const sel = $getSelection();
  if (!$isRangeSelection(sel)) return false;
  const current = $getSelectedOutlineItem();
  if (!current) return false;

  // Empty indented item → outdent to the level above (LogSeq / Workflowy)
  if ($isItemTextEmpty(current) && $getParentOutlineItem(current)) {
    return $outdentItem(current);
  }

  const anchor = sel.anchor;
  const anchorNode = anchor.getNode();
  const offset = anchor.offset;
  const nested = $getNestedItems(current);
  const atEnd = $isCaretAtEndOfItemContent(current, anchorNode, offset);

  // Enter at end of item that has children → new first child (LogSeq)
  if (atEnd && nested.length > 0) {
    const newItem = $createOutlineItemNode(createId(), 'note');
    newItem.append($createTextNode(''));
    $insertAsFirstChild(current, newItem);
    newItem.selectStart();
    return true;
  }

  const newItem = $createOutlineItemNode(createId(), 'note');

  // Split text at caret when inside a text node that is direct content
  if ($isTextNode(anchorNode) && anchorNode.getParent() === current) {
    const text = anchorNode.getTextContent();
    const left = text.slice(0, offset);
    const right = text.slice(offset);
    anchorNode.setTextContent(left);

    const content = $getContentChildren(current);
    const idx = content.indexOf(anchorNode);
    const trailing = idx >= 0 ? content.slice(idx + 1) : [];

    for (const n of trailing) n.remove();

    if (right) {
      const rightText = $createTextNode(right);
      rightText.setFormat(anchorNode.getFormat());
      newItem.append(rightText);
    }
    for (const n of trailing) {
      newItem.append(n);
    }
  }

  if (newItem.getChildrenSize() === 0) {
    newItem.append($createTextNode(''));
  }

  $insertSiblingAfter(current, newItem);
  newItem.selectStart();
  return true;
}

function $handleBackspace(): boolean {
  const selection = $getSelection();
  if (!$isRangeSelection(selection) || !selection.isCollapsed()) return false;

  const item = $getSelectedOutlineItem();
  if (!item || !$isAtStartOfItem(item)) return false;

  // Backspace at start of a heading / task / subtask demotes to a note
  // before merge, outdent, or the sole-item no-op.
  const kind = item.getKind();
  if (kind === 'heading') {
    item.setHeading(null);
    return true;
  }
  if (kind === 'task' || kind === 'subtask') {
    item.setKind('note');
    return true;
  }

  const parent = $getParentOutlineItem(item);
  if (parent && $isItemTextEmpty(item)) {
    return $outdentItem(item);
  }

  const prev = item.getPreviousSibling();
  if ($isOutlineItemNode(prev)) {
    const myContent = $getContentChildren(item);
    const myNested = $getNestedItems(item);
    const prevContent = $getContentChildren(prev);
    if (
      prevContent.length === 1 &&
      $isTextNode(prevContent[0]) &&
      prevContent[0].getTextContent() === ''
    ) {
      prevContent[0].remove();
    }
    for (const c of myContent) {
      if (
        !(
          $isTextNode(c) &&
          c.getTextContent() === '' &&
          myContent.length === 1
        )
      ) {
        prev.append(c);
      }
    }
    for (const n of myNested) {
      prev.append(n);
    }
    item.remove();
    prev.selectEnd();
    return true;
  }

  const root = $getRoot();
  const topItems = root.getChildren().filter($isOutlineItemNode);
  if (topItems.length === 1 && topItems[0] === item) {
    return true;
  }

  return false;
}

export function OutlineStructurePlugin(): null {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    return mergeRegister(
      editor.registerCommand(
        KEY_ENTER_COMMAND,
        (event) => {
          if (event?.metaKey || event?.ctrlKey) return false;
          event?.preventDefault();
          // Already inside an editor update — do not nest editor.update()
          return $handleEnter();
        },
        COMMAND_PRIORITY_HIGH,
      ),
      editor.registerCommand(
        INSERT_PARAGRAPH_COMMAND,
        () => $handleEnter(),
        COMMAND_PRIORITY_HIGH,
      ),
      editor.registerCommand(
        KEY_BACKSPACE_COMMAND,
        (event) => {
          const handled = $handleBackspace();
          if (handled) event?.preventDefault();
          return handled;
        },
        COMMAND_PRIORITY_HIGH,
      ),
      editor.registerUpdateListener(({ editorState }) => {
        editorState.read(() => {
          const root = $getRoot();
          // Fast path: walk siblings without allocating getChildren().
          let child = root.getFirstChild();
          while (child) {
            if ($isOutlineItemNode(child)) return;
            child = child.getNextSibling();
          }
          queueMicrotask(() => {
            editor.update(() => {
              const r = $getRoot();
              let c = r.getFirstChild();
              while (c) {
                if ($isOutlineItemNode(c)) return;
                c = c.getNextSibling();
              }
              const node = $createOutlineItemNode(createId(), 'note');
              node.append($createTextNode(''));
              r.append(node);
            });
          });
        });
      }),
    );
  }, [editor]);

  return null;
}
