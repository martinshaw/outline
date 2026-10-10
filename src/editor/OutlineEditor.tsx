import { memo, useMemo } from 'react';
import { LexicalComposer } from '@lexical/react/LexicalComposer';
import { RichTextPlugin } from '@lexical/react/LexicalRichTextPlugin';
import { ContentEditable } from '@lexical/react/LexicalContentEditable';
import { HistoryPlugin } from '@lexical/react/LexicalHistoryPlugin';
import { LexicalErrorBoundary } from '@lexical/react/LexicalErrorBoundary';
import { AutoLinkNode, LinkNode } from '@lexical/link';
import type { DayDocument } from '../types';
import { OutlineItemNode } from './nodes/OutlineItemNode';
import { OutlineStructurePlugin } from './plugins/OutlineStructurePlugin';
import { IndentReorderPlugin } from './plugins/IndentReorderPlugin';
import { RolePlugin } from './plugins/RolePlugin';
import { StatusChipPlugin } from './plugins/StatusChipPlugin';
import { MetaAttributesPlugin } from './plugins/MetaAttributesPlugin';
import { BlockSelectionPlugin } from './plugins/BlockSelectionPlugin';
import { OutlineLinkPlugin } from './plugins/LinkPlugin';
import { OutlineAutoLinkPlugin } from './plugins/AutoLinkPlugin';
import { PersistencePlugin } from './plugins/PersistencePlugin';
import { NavigateToItemPlugin } from './plugins/NavigateToItemPlugin';
import { LoadDocumentPlugin } from './plugins/LoadDocumentPlugin';
import { ParagraphTransformPlugin } from './plugins/ParagraphTransformPlugin';
import { EmptyItemFocusPlugin } from './plugins/EmptyItemFocusPlugin';
import { MarkdownHeadingPlugin } from './plugins/MarkdownHeadingPlugin';
import { EditorFocusPlugin } from './plugins/EditorFocusPlugin';
import { AttachmentPlugin } from './plugins/AttachmentPlugin';
import { AttachmentImagePlugin } from './plugins/AttachmentImagePlugin';
import { FormatCommandPlugin } from './plugins/FormatCommandPlugin';
import { PasteOutlinePlugin } from './plugins/PasteOutlinePlugin';

type Props = {
  date: string;
  document: DayDocument;
  enabled: boolean;
  focusItemId: string | null;
  onFocusHandled: () => void;
  onSave: (doc: DayDocument) => Promise<void>;
  onChange: (doc: DayDocument) => void;
};

function onError(error: Error): void {
  console.error(error);
}

export const OutlineEditor = memo(function OutlineEditor({
  date,
  document,
  enabled,
  focusItemId,
  onFocusHandled,
  onSave,
  onChange,
}: Props) {
  const initialConfig = useMemo(
    () => ({
      namespace: `outline-${date}`,
      theme: {
        text: {
          bold: 'editor-text-bold',
          italic: 'editor-text-italic',
          underline: 'editor-text-underline',
        },
        link: 'editor-link',
      },
      onError,
      nodes: [OutlineItemNode, LinkNode, AutoLinkNode],
      editable: true,
    }),
    [date],
  );

  return (
    <LexicalComposer initialConfig={initialConfig}>
      <div className="editor-shell">
        <RichTextPlugin
          contentEditable={
            <ContentEditable className="editor-input" spellCheck={false} />
          }
          placeholder={
            <div className="editor-placeholder">Start writing…</div>
          }
          ErrorBoundary={LexicalErrorBoundary}
        />
        <HistoryPlugin />
        <EditorFocusPlugin />
        <LoadDocumentPlugin document={document} />
        <ParagraphTransformPlugin />
        <OutlineStructurePlugin />
        <EmptyItemFocusPlugin />
        <MarkdownHeadingPlugin />
        <IndentReorderPlugin />
        <RolePlugin />
        <StatusChipPlugin />
        <MetaAttributesPlugin />
        <AttachmentPlugin />
        <AttachmentImagePlugin />
        <BlockSelectionPlugin />
        <PasteOutlinePlugin />
        <FormatCommandPlugin />
        <OutlineAutoLinkPlugin />
        <OutlineLinkPlugin />
        <PersistencePlugin
          date={date}
          enabled={enabled}
          onSave={onSave}
          onChange={onChange}
        />
        <NavigateToItemPlugin
          focusItemId={focusItemId}
          onFocused={onFocusHandled}
        />
      </div>
    </LexicalComposer>
  );
});
