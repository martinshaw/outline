import {
  $createTextNode,
  $getRoot,
  $isTextNode,
  type LexicalEditor,
  type LexicalNode,
  TextNode,
} from 'lexical';
import {
  $createLinkNode,
  $isAutoLinkNode,
  $isLinkNode,
} from '@lexical/link';
import type { DayDocument, InlineSegment, OutlineItem } from '../types';
import { createId } from '../utils/id';
import {
  $createOutlineItemNode,
  $isOutlineItemNode,
  OutlineItemNode,
} from './nodes/OutlineItemNode';

type TextFormat = { bold?: boolean; italic?: boolean; underline?: boolean };

function formatFromTextNode(node: TextNode): TextFormat | undefined {
  const format: TextFormat = {};
  if (node.hasFormat('bold')) format.bold = true;
  if (node.hasFormat('italic')) format.italic = true;
  if (node.hasFormat('underline')) format.underline = true;
  return Object.keys(format).length ? format : undefined;
}

function applyFormat(
  text: TextNode,
  format?: { bold?: boolean; italic?: boolean; underline?: boolean },
): void {
  if (!format) return;
  if (format.bold) text.toggleFormat('bold');
  if (format.italic) text.toggleFormat('italic');
  if (format.underline) text.toggleFormat('underline');
}

function contentNodesToSegments(nodes: LexicalNode[]): InlineSegment[] {
  const segments: InlineSegment[] = [];
  for (const node of nodes) {
    if ($isOutlineItemNode(node)) continue;
    if ($isLinkNode(node)) {
      // Unlinked auto-links are plain text (user removed the link)
      if ($isAutoLinkNode(node) && node.getIsUnlinked()) {
        const text = node.getTextContent();
        if (text.length > 0) {
          segments.push({ type: 'text', text });
        }
        continue;
      }
      segments.push({
        type: 'link',
        url: node.getURL(),
        text: node.getTextContent(),
      });
      continue;
    }
    if ($isTextNode(node)) {
      const text = node.getTextContent();
      if (text.length === 0) continue;
      segments.push({
        type: 'text',
        text,
        format: formatFromTextNode(node),
      });
    }
  }
  if (segments.length === 0) {
    segments.push({ type: 'text', text: '' });
  }
  return segments;
}

function outlineItemToData(node: OutlineItemNode): OutlineItem {
  const children = node.getChildren();
  const contentChildren = children.filter((c) => !$isOutlineItemNode(c));
  const nested = children.filter($isOutlineItemNode);
  return {
    id: node.getId(),
    kind: node.getKind(),
    content: contentNodesToSegments(contentChildren),
    children: nested.map(outlineItemToData),
  };
}

export function editorToDayDocument(
  editor: LexicalEditor,
  date: string,
): DayDocument {
  let items: OutlineItem[] = [];
  editor.getEditorState().read(() => {
    const root = $getRoot();
    items = root.getChildren().filter($isOutlineItemNode).map(outlineItemToData);
  });
  return { version: 1, date, items };
}

function segmentsToNodes(segments: InlineSegment[]): LexicalNode[] {
  const nodes: LexicalNode[] = [];
  for (const seg of segments) {
    if (seg.type === 'link') {
      const link = $createLinkNode(seg.url);
      link.append($createTextNode(seg.text || seg.url));
      nodes.push(link);
    } else {
      const text = $createTextNode(seg.text);
      applyFormat(text, seg.format);
      nodes.push(text);
    }
  }
  if (nodes.length === 0) {
    nodes.push($createTextNode(''));
  }
  return nodes;
}

function dataToOutlineItem(item: OutlineItem): OutlineItemNode {
  const node = $createOutlineItemNode(item.id || createId(), item.kind);
  node.append(...segmentsToNodes(item.content));
  for (const child of item.children) {
    node.append(dataToOutlineItem(child));
  }
  return node;
}

export function $loadDayDocument(doc: DayDocument): void {
  const root = $getRoot();
  root.clear();
  if (doc.items.length === 0) {
    const empty = $createOutlineItemNode(createId(), 'note');
    empty.append($createTextNode(''));
    root.append(empty);
    return;
  }
  for (const item of doc.items) {
    root.append(dataToOutlineItem(item));
  }
}
