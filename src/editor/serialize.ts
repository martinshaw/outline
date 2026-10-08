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
import { getDefaultStatusId } from '../settings/settingsStore';
import type {
  DayDocument,
  HeadingLevel,
  InlineSegment,
  OutlineItem,
} from '../types';
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
  const contentChildren: LexicalNode[] = [];
  const nested: OutlineItemNode[] = [];
  for (const child of children) {
    if ($isOutlineItemNode(child)) nested.push(child);
    else contentChildren.push(child);
  }
  const kind = node.getKind();
  const headingLevel = node.getHeadingLevel();
  return {
    id: node.getId(),
    kind,
    headingLevel: kind === 'heading' ? headingLevel : null,
    status: kind === 'project' || kind === 'task' ? node.getStatus() : null,
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
  const kind = item.kind;
  const status =
    kind === 'project' || kind === 'task'
      ? (item.status ?? getDefaultStatusId())
      : null;
  const headingLevel: HeadingLevel | null =
    kind === 'heading'
      ? (item.headingLevel && item.headingLevel >= 1 && item.headingLevel <= 6
          ? item.headingLevel
          : 1)
      : null;
  const node = $createOutlineItemNode(
    item.id || createId(),
    kind,
    status,
    headingLevel,
  );
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
