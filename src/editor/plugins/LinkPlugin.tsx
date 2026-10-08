import { useEffect } from 'react';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import {
  $createAutoLinkNode,
  $createLinkNode,
  $isAutoLinkNode,
  $isLinkNode,
  TOGGLE_LINK_COMMAND,
  type LinkNode,
} from '@lexical/link';
import {
  $createTextNode,
  $getNearestNodeFromDOMNode,
  $getNodeByKey,
  $getSelection,
  $isElementNode,
  $isRangeSelection,
  $isTextNode,
  COMMAND_PRIORITY_HIGH,
  KEY_BACKSPACE_COMMAND,
  KEY_DELETE_COMMAND,
  PASTE_COMMAND,
  type LexicalNode,
  type NodeKey,
} from 'lexical';
import { mergeRegister } from '@lexical/utils';
import { $isOutlineItemNode } from '../nodes/OutlineItemNode';

const URL_RE = /^(https?:\/\/|mailto:)/i;

function isUrl(text: string): boolean {
  try {
    if (!URL_RE.test(text.trim())) return false;
    // eslint-disable-next-line no-new
    new URL(text.trim());
    return true;
  } catch {
    return false;
  }
}

function $isActiveLink(node: LexicalNode | null | undefined): node is LinkNode {
  if (!$isLinkNode(node)) return false;
  if ($isAutoLinkNode(node) && node.getIsUnlinked()) return false;
  return true;
}

/** Keep text, strip hyperlink (prevents AutoLink from rematching). */
function $unlinkKeepText(link: LinkNode): void {
  if ($isAutoLinkNode(link)) {
    link.setIsUnlinked(true);
    return;
  }
  const url = link.getURL();
  const auto = $createAutoLinkNode(url, {
    isUnlinked: true,
    target: '_blank',
    rel: 'noopener noreferrer',
  });
  const children = link.getChildren();
  if (children.length === 0) {
    auto.append($createTextNode(url));
  } else {
    for (const child of children) auto.append(child);
  }
  link.replace(auto);
}

/** Delete the entire link node and leave the caret where the link started. */
function $deleteWholeLink(link: LinkNode): void {
  const parent = link.getParent();
  if (!parent) {
    link.remove();
    return;
  }

  const prev = link.getPreviousSibling();
  const next = link.getNextSibling();
  link.remove();

  // Prefer end of previous sibling = start of the former link
  if (prev && !$isOutlineItemNode(prev)) {
    prev.selectEnd();
    return;
  }

  if (next && !$isOutlineItemNode(next)) {
    next.selectStart();
    return;
  }

  // No adjacent inline content — insert an empty text node for a stable caret
  const empty = $createTextNode('');
  if (next && $isOutlineItemNode(next)) {
    next.insertBefore(empty);
  } else if (prev && $isOutlineItemNode(prev)) {
    prev.insertAfter(empty);
  } else {
    parent.splice(0, 0, [empty]);
  }
  empty.select();
}

function $getActiveLinkFromNode(node: LexicalNode | null): LinkNode | null {
  let current: LexicalNode | null = node;
  while (current) {
    if ($isActiveLink(current)) return current;
    current = current.getParent();
  }
  return null;
}

function $findActiveLinkFromDom(anchor: HTMLElement): LinkNode | null {
  const nearest = $getNearestNodeFromDOMNode(anchor);
  return $getActiveLinkFromNode(nearest);
}

function eventElement(target: EventTarget | null): HTMLElement | null {
  if (target instanceof HTMLElement) return target;
  if (target instanceof Text) return target.parentElement;
  return null;
}

function $selectionTouchesActiveLink(): LinkNode | null {
  const selection = $getSelection();
  if (!$isRangeSelection(selection)) return null;
  const anchorLink = $getActiveLinkFromNode(selection.anchor.getNode());
  if (anchorLink) return anchorLink;
  if (!selection.isCollapsed()) {
    return $getActiveLinkFromNode(selection.focus.getNode());
  }
  return null;
}

/**
 * Link to remove on Backspace. Lexical often places the caret *after* a link
 * (outside the node), so the first default backspace only eats one character.
 */
function $linkForBackspace(): LinkNode | null {
  const inside = $selectionTouchesActiveLink();
  if (inside) return inside;

  const selection = $getSelection();
  if (!$isRangeSelection(selection) || !selection.isCollapsed()) return null;

  const { anchor } = selection;
  const node = anchor.getNode();

  if (anchor.offset === 0) {
    const prev = node.getPreviousSibling();
    if ($isActiveLink(prev)) return prev;
  }

  // Element selection: caret between children, just after a link
  if ($isElementNode(node) && anchor.offset > 0) {
    const child = node.getChildAtIndex(anchor.offset - 1);
    if ($isActiveLink(child)) return child;
  }

  return null;
}

/** Link to remove on Delete when the caret sits immediately before it. */
function $linkForForwardDelete(): LinkNode | null {
  const inside = $selectionTouchesActiveLink();
  if (inside) return inside;

  const selection = $getSelection();
  if (!$isRangeSelection(selection) || !selection.isCollapsed()) return null;

  const { anchor } = selection;
  const node = anchor.getNode();

  if ($isTextNode(node) && anchor.offset === node.getTextContentSize()) {
    const next = node.getNextSibling();
    if ($isActiveLink(next)) return next;
  }

  if ($isElementNode(node)) {
    const child = node.getChildAtIndex(anchor.offset);
    if ($isActiveLink(child)) return child;
  }

  return null;
}

export function OutlineLinkPlugin(): null {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    const onContextMenu = (event: MouseEvent) => {
      const el = eventElement(event.target);
      if (!el) return;
      const anchor = el.closest('a');
      if (!anchor || !editor.getRootElement()?.contains(anchor)) return;

      event.preventDefault();
      event.stopPropagation();

      let linkKey: NodeKey | null = null;
      editor.getEditorState().read(() => {
        linkKey = $findActiveLinkFromDom(anchor)?.getKey() ?? null;
      });
      if (!linkKey) return;
      if (!window.confirm('Remove link?')) return;

      const key = linkKey;
      editor.update(() => {
        const node = $getNodeByKey(key);
        if (node && $isActiveLink(node)) {
          $unlinkKeepText(node);
          return;
        }
        const again = $findActiveLinkFromDom(anchor);
        if (again) $unlinkKeepText(again);
      });
    };

    const onClick = (event: MouseEvent) => {
      // Ignore right-clicks / modified non-primary
      if (event.button !== 0) return;
      const el = eventElement(event.target);
      if (!el) return;
      const root = editor.getRootElement();
      const a = el.closest('a');
      if (!a || !root?.contains(a)) return;

      const href = a.getAttribute('href');
      if (!href || href === 'about:blank') return;

      event.preventDefault();
      event.stopPropagation();
      window.open(href, '_blank', 'noopener,noreferrer');
    };

    return mergeRegister(
      editor.registerCommand(
        PASTE_COMMAND,
        (event: ClipboardEvent) => {
          const text = event.clipboardData?.getData('text/plain')?.trim();
          if (!text || !isUrl(text)) return false;

          event.preventDefault();
          editor.update(() => {
            const selection = $getSelection();
            if (!$isRangeSelection(selection)) return;

            const link = $createLinkNode(text, {
              target: '_blank',
              rel: 'noopener noreferrer',
            });
            if (!selection.isCollapsed()) {
              const selected = selection.getTextContent();
              link.append($createTextNode(selected || text));
            } else {
              link.append($createTextNode(text));
            }
            selection.insertNodes([link]);
          });
          return true;
        },
        COMMAND_PRIORITY_HIGH,
      ),
      editor.registerCommand(
        TOGGLE_LINK_COMMAND,
        (payload) => {
          if (payload !== null) return false;
          const link = $selectionTouchesActiveLink();
          if (!link) return false;
          $unlinkKeepText(link);
          return true;
        },
        COMMAND_PRIORITY_HIGH,
      ),
      editor.registerCommand(
        KEY_BACKSPACE_COMMAND,
        (event) => {
          const link = $linkForBackspace();
          if (!link) return false;
          event?.preventDefault();
          $deleteWholeLink(link);
          queueMicrotask(() => editor.focus());
          return true;
        },
        COMMAND_PRIORITY_HIGH,
      ),
      editor.registerCommand(
        KEY_DELETE_COMMAND,
        (event) => {
          const link = $linkForForwardDelete();
          if (!link) return false;
          event?.preventDefault();
          $deleteWholeLink(link);
          queueMicrotask(() => editor.focus());
          return true;
        },
        COMMAND_PRIORITY_HIGH,
      ),
      editor.registerRootListener((root, prev) => {
        if (prev) {
          prev.removeEventListener('contextmenu', onContextMenu);
          prev.removeEventListener('click', onClick);
        }
        if (root) {
          root.addEventListener('contextmenu', onContextMenu);
          root.addEventListener('click', onClick);
        }
      }),
    );
  }, [editor]);

  return null;
}
