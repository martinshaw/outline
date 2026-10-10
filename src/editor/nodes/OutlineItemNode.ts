import {
  $applyNodeReplacement,
  type DOMConversionMap,
  type DOMConversionOutput,
  type DOMExportOutput,
  type EditorConfig,
  type ElementDOMSlot,
  ElementNode,
  type LexicalNode,
  type NodeKey,
  type SerializedElementNode,
  type Spread,
} from 'lexical';
import {
  getBlockSelectedIds,
  isBlockSelfOnly,
  syncSelfOnlyHighlightVar,
} from '../blockSelectionStore';
import { getStatusDef } from '../../settings/settingsStore';
import {
  attachmentKindFromMime,
  formatAttachmentSize,
  getCachedAttachmentUrl,
  normalizeAttachmentMeta,
  normalizeDisplaySize,
  type AttachmentMeta,
} from '../../storage/attachments';
import { notesClient } from '../../storage/notesClient';
import {
  isRoleKind,
  normalizeItemKind,
  type HeadingLevel,
  type ItemKind,
} from '../../types';
import { createId } from '../../utils/id';
import {
  formatMetaSubline,
  formatSubtaskProgress,
  isCompleteStatus,
  isDeadlineOverdue,
  isIsoDate,
  normalizeEntities,
} from '../../utils/itemMeta';
import { shouldRemapOutlineIdsOnImport } from '../outlineIdRemap';

export type SerializedOutlineItemNode = Spread<
  {
    id: string;
    kind: ItemKind;
    headingLevel: HeadingLevel | null;
    status: string | null;
    deadline: string | null;
    entities: string[];
    attachment: AttachmentMeta | null;
    type: 'outline-item';
    /** 2 = task/subtask kinds; 1 = legacy project/task. */
    version: 1 | 2;
  },
  SerializedElementNode
>;

function normalizeHeadingLevel(
  kind: ItemKind,
  level: HeadingLevel | null | undefined,
): HeadingLevel | null {
  if (kind !== 'heading') return null;
  if (level == null || level < 1 || level > 6) return 1;
  return level as HeadingLevel;
}

export class OutlineItemNode extends ElementNode {
  __id: string;
  __kind: ItemKind;
  __headingLevel: HeadingLevel | null;
  __status: string | null;
  __deadline: string | null;
  __entities: string[];
  __attachment: AttachmentMeta | null;
  __blockSelected: boolean;

  static getType(): string {
    return 'outline-item';
  }

  static clone(node: OutlineItemNode): OutlineItemNode {
    return new OutlineItemNode(
      node.__id,
      node.__kind,
      node.__status,
      node.__headingLevel,
      node.__key,
      node.__deadline,
      node.__entities,
      node.__attachment,
    );
  }

  constructor(
    id: string,
    kind: ItemKind = 'note',
    status: string | null = null,
    headingLevel: HeadingLevel | null = null,
    key?: NodeKey,
    deadline: string | null = null,
    entities: string[] | null = null,
    attachment: AttachmentMeta | null = null,
  ) {
    super(key);
    this.__id = id;
    this.__kind = kind;
    this.__headingLevel = normalizeHeadingLevel(kind, headingLevel);
    const isRole = isRoleKind(kind);
    this.__status = isRole ? status : null;
    this.__deadline = isRole && deadline && isIsoDate(deadline) ? deadline : null;
    this.__entities = isRole ? normalizeEntities(entities) : [];
    this.__attachment =
      kind === 'attachment' ? normalizeAttachmentMeta(attachment) : null;
    this.__blockSelected = false;
  }

  getId(): string {
    return this.__id;
  }

  setId(id: string): this {
    const writable = this.getWritable();
    writable.__id = id;
    return writable;
  }

  getKind(): ItemKind {
    return this.getLatest().__kind;
  }

  setKind(kind: ItemKind): this {
    const writable = this.getWritable();
    writable.__kind = kind;
    if (kind === 'note' || kind === 'heading' || kind === 'attachment') {
      writable.__status = null;
      writable.__deadline = null;
      writable.__entities = [];
    }
    if (kind !== 'attachment') writable.__attachment = null;
    if (kind !== 'heading') writable.__headingLevel = null;
    else if (writable.__headingLevel == null) writable.__headingLevel = 1;
    writable.markAncestorTasksDirty();
    return writable;
  }

  getHeadingLevel(): HeadingLevel | null {
    return this.getLatest().__headingLevel;
  }

  /** Set markdown heading level, or `null` to demote back to a note. */
  setHeading(level: HeadingLevel | null): this {
    const writable = this.getWritable();
    if (level == null) {
      if (writable.__kind === 'heading') writable.__kind = 'note';
      writable.__headingLevel = null;
      writable.markAncestorTasksDirty();
      return writable;
    }
    writable.__kind = 'heading';
    writable.__headingLevel = level;
    writable.__status = null;
    writable.__deadline = null;
    writable.__entities = [];
    writable.__attachment = null;
    writable.markAncestorTasksDirty();
    return writable;
  }

  getStatus(): string | null {
    return this.getLatest().__status;
  }

  setStatus(status: string | null): this {
    const writable = this.getWritable();
    writable.__status = status;
    writable.markAncestorTasksDirty();
    return writable;
  }

  getDeadline(): string | null {
    return this.getLatest().__deadline;
  }

  setDeadline(deadline: string | null): this {
    const writable = this.getWritable();
    writable.__deadline =
      deadline && isIsoDate(deadline) ? deadline : null;
    return writable;
  }

  getEntities(): string[] {
    return [...this.getLatest().__entities];
  }

  setEntities(entities: string[] | null): this {
    const writable = this.getWritable();
    writable.__entities = normalizeEntities(entities);
    return writable;
  }

  getAttachment(): AttachmentMeta | null {
    const att = this.getLatest().__attachment;
    return att ? { ...att } : null;
  }

  setAttachment(attachment: AttachmentMeta | null): this {
    const writable = this.getWritable();
    writable.__attachment = normalizeAttachmentMeta(attachment);
    if (writable.__attachment) writable.__kind = 'attachment';
    return writable;
  }

  isBlockSelected(): boolean {
    return this.getLatest().__blockSelected;
  }

  setBlockSelected(selected: boolean): this {
    const writable = this.getWritable();
    writable.__blockSelected = selected;
    return writable;
  }

  createDOM(_config: EditorConfig): HTMLElement {
    const dom = document.createElement('div');
    this.applyDomAttrs(dom);
    return dom;
  }

  updateDOM(_prev: OutlineItemNode, dom: HTMLElement): boolean {
    // Always refresh chrome. Subtask progress (and selection classes) can change
    // when only descendants mutate — this node's own fields stay the same.
    this.applyDomAttrs(dom);
    return false;
  }

  /**
   * DOM: [attachment|chip?][editable children…][meta][progress].
   * Leading chrome so the caret sits after previews/chips.
   */
  getDOMSlot(element: HTMLElement): ElementDOMSlot {
    let slot = super.getDOMSlot(element);
    const host = element as HTMLElement & {
      __outlineStatusChip?: HTMLElement | null;
      __outlineMeta?: HTMLElement | null;
      __outlineAttachment?: HTMLElement | null;
    };
    const meta =
      host.__outlineMeta?.isConnected
        ? host.__outlineMeta
        : element.querySelector(':scope > .outline-meta');
    const chip =
      host.__outlineStatusChip?.isConnected
        ? host.__outlineStatusChip
        : element.querySelector(':scope > .outline-status-chip');
    const attachment =
      host.__outlineAttachment?.isConnected
        ? host.__outlineAttachment
        : element.querySelector(':scope > .outline-attachment');
    if (attachment) slot = slot.withAfter(attachment);
    else if (chip) slot = slot.withAfter(chip);
    if (meta) slot = slot.withBefore(meta);
    return slot;
  }

  private applyDomAttrs(dom: HTMLElement): void {
    dom.className = this.buildClassName();
    dom.setAttribute('data-outline-id', this.__id);
    dom.setAttribute('data-kind', this.__kind);
    if (this.__headingLevel) {
      dom.setAttribute('data-heading-level', String(this.__headingLevel));
    } else {
      dom.removeAttribute('data-heading-level');
    }
    if (this.__status) dom.setAttribute('data-status', this.__status);
    else dom.removeAttribute('data-status');
    const labelText = kindLabelFor(this.__kind, this.__headingLevel);
    if (labelText) dom.setAttribute('data-kind-label', labelText);
    else dom.removeAttribute('data-kind-label');
    const selfOnly =
      getBlockSelectedIds().has(this.__id) && isBlockSelfOnly(this.__id);
    syncSelfOnlyHighlightVar(dom, selfOnly);
    this.syncChrome(dom);
  }

  /** Refresh ancestor task chrome when subtask counts / completion change. */
  markAncestorTasksDirty(): void {
    let parent = this.getParent();
    while (parent) {
      if ($isOutlineItemNode(parent) && parent.getKind() === 'task') {
        parent.markDirty();
      }
      parent = parent.getParent();
    }
  }

  /** Descendant subtasks under this task (stops at nested tasks). */
  getSubtaskProgress(): { total: number; complete: number } {
    let total = 0;
    let complete = 0;
    const walk = (node: OutlineItemNode) => {
      for (const child of node.getChildren()) {
        if (!$isOutlineItemNode(child)) continue;
        if (child.getKind() === 'subtask') {
          total += 1;
          if (isCompleteStatus(child.getStatus())) complete += 1;
        }
        // Nested tasks own their own subtask progress.
        if (child.getKind() !== 'task') walk(child);
      }
    };
    walk(this);
    return { total, complete };
  }

  private syncChrome(dom: HTMLElement): void {
    const host = dom as HTMLElement & {
      __outlineStatusChip?: HTMLButtonElement | null;
      __outlineMeta?: HTMLButtonElement | null;
      __outlineSubtaskProgress?: HTMLElement | null;
      __outlineAttachment?: HTMLElement | null;
    };

    // Drop legacy DOM chrome (bullet/label spans) if present from older builds.
    dom
      .querySelectorAll(':scope > .outline-bullet, :scope > .outline-kind-label')
      .forEach((el) => el.remove());

    let chip =
      host.__outlineStatusChip?.isConnected
        ? host.__outlineStatusChip
        : dom.querySelector<HTMLButtonElement>(':scope > .outline-status-chip');
    let meta =
      host.__outlineMeta?.isConnected
        ? host.__outlineMeta
        : dom.querySelector<HTMLButtonElement>(':scope > .outline-meta');
    let progress =
      host.__outlineSubtaskProgress?.isConnected
        ? host.__outlineSubtaskProgress
        : dom.querySelector<HTMLElement>(':scope > .outline-subtask-progress');
    let attachmentEl =
      host.__outlineAttachment?.isConnected
        ? host.__outlineAttachment
        : dom.querySelector<HTMLElement>(':scope > .outline-attachment');

    if (this.__kind === 'attachment' && this.__attachment) {
      chip?.remove();
      meta?.remove();
      progress?.remove();
      host.__outlineStatusChip = null;
      host.__outlineMeta = null;
      host.__outlineSubtaskProgress = null;
      dom.classList.remove('outline-item--has-meta');
      this.syncAttachmentChrome(dom, host, attachmentEl);
      return;
    }

    attachmentEl?.remove();
    host.__outlineAttachment = null;

    if (!isRoleKind(this.__kind)) {
      chip?.remove();
      meta?.remove();
      progress?.remove();
      host.__outlineStatusChip = null;
      host.__outlineMeta = null;
      host.__outlineSubtaskProgress = null;
      dom.classList.remove('outline-item--has-meta');
      return;
    }

    if (!chip) {
      chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'outline-status-chip';
      chip.contentEditable = 'false';
      chip.tabIndex = -1;
      chip.setAttribute('aria-haspopup', 'listbox');
      chip.setAttribute('aria-expanded', 'false');
      dom.insertBefore(chip, dom.firstChild);
    } else if (chip.parentElement !== dom || dom.firstChild !== chip) {
      dom.insertBefore(chip, dom.firstChild);
    }
    host.__outlineStatusChip = chip;

    const status = getStatusDef(this.__status);
    if (chip.dataset.status !== status.id || chip.textContent !== status.label) {
      chip.dataset.status = status.id;
      chip.textContent = status.label;
      chip.title = status.label;
      chip.setAttribute('aria-label', `Status: ${status.label}`);
    }
    chip.style.setProperty('--status-color', status.color);

    const subline = formatMetaSubline(this.__deadline, this.__entities);
    const hasMeta = subline.length > 0;

    if (!meta) {
      meta = document.createElement('button');
      meta.type = 'button';
      meta.className = 'outline-meta';
      meta.contentEditable = 'false';
      meta.tabIndex = -1;
      meta.setAttribute('aria-haspopup', 'dialog');
      dom.appendChild(meta);
    } else if (meta.parentElement !== dom) {
      dom.appendChild(meta);
    }
    // Chip first; meta + progress trail. Children sit between (getDOMSlot).
    const progressLabel =
      this.__kind === 'task'
        ? (() => {
            const { total, complete } = this.getSubtaskProgress();
            return formatSubtaskProgress(total, complete);
          })()
        : null;

    if (progressLabel) {
      if (!progress) {
        progress = document.createElement('span');
        progress.className = 'outline-subtask-progress';
        progress.contentEditable = 'false';
        dom.appendChild(progress);
      } else if (progress.parentElement !== dom) {
        dom.appendChild(progress);
      }
      if (progress.dataset.progressText !== progressLabel) {
        progress.dataset.progressText = progressLabel;
        progress.textContent = progressLabel;
        progress.title = 'Subtask progress';
      }
      host.__outlineSubtaskProgress = progress;
    } else {
      progress?.remove();
      progress = null;
      host.__outlineSubtaskProgress = null;
    }

    // Keep trailing chrome after Lexical children (chip already leads).
    dom.appendChild(meta);
    if (progress) dom.appendChild(progress);
    host.__outlineMeta = meta;
    dom.classList.toggle('outline-item--has-meta', hasMeta);

    const display = hasMeta ? subline : 'Deadline · Entities';
    if (meta.dataset.metaText !== display) {
      meta.dataset.metaText = display;
      meta.textContent = display;
      meta.title = 'Edit deadline & entities';
      meta.setAttribute(
        'aria-label',
        hasMeta ? `Attributes: ${subline}` : 'Add deadline & entities',
      );
    }
    meta.classList.toggle('outline-meta--empty', !hasMeta);
    meta.classList.toggle(
      'outline-meta--overdue',
      isDeadlineOverdue(this.__deadline),
    );
  }

  private syncAttachmentChrome(
    dom: HTMLElement,
    host: HTMLElement & { __outlineAttachment?: HTMLElement | null },
    existing: HTMLElement | null,
  ): void {
    const att = this.__attachment;
    if (!att) {
      existing?.remove();
      host.__outlineAttachment = null;
      return;
    }

    const mediaKind = attachmentKindFromMime(att.mime);
    let wrap = existing;
    if (!wrap || wrap.dataset.mediaKind !== mediaKind) {
      wrap?.remove();
      wrap = document.createElement('div');
      wrap.className = 'outline-attachment';
      wrap.contentEditable = 'false';
      wrap.dataset.mediaKind = mediaKind;
      dom.insertBefore(wrap, dom.firstChild);
    } else if (wrap.parentElement !== dom || dom.firstChild !== wrap) {
      dom.insertBefore(wrap, dom.firstChild);
    }
    host.__outlineAttachment = wrap;

    wrap.dataset.path = att.path;
    wrap.dataset.name = att.name;
    wrap.dataset.mime = att.mime;
    wrap.title = att.name;

    const sizeLabel = formatAttachmentSize(att.size);
    const ensureMedia = <K extends keyof HTMLElementTagNameMap>(
      tag: K,
      className: string,
    ): HTMLElementTagNameMap[K] => {
      let el = wrap!.querySelector<HTMLElementTagNameMap[K]>(`:scope > ${tag}`);
      if (!el) {
        wrap!.replaceChildren();
        el = document.createElement(tag);
        el.className = className;
        wrap!.appendChild(el);
      }
      return el;
    };

    if (mediaKind === 'image') {
      const displaySize = normalizeDisplaySize(att.displaySize);
      wrap.className = `outline-attachment outline-attachment--${displaySize}`;
      wrap.dataset.displaySize = displaySize;

      let img = wrap.querySelector<HTMLImageElement>(
        ':scope > .outline-attachment__image',
      );
      let menuBtn = wrap.querySelector<HTMLButtonElement>(
        ':scope > .outline-attachment__menu-btn',
      );
      if (!img || !menuBtn) {
        wrap.replaceChildren();
        img = document.createElement('img');
        img.className = 'outline-attachment__image';
        menuBtn = document.createElement('button');
        menuBtn.type = 'button';
        menuBtn.className = 'outline-attachment__menu-btn';
        menuBtn.setAttribute('aria-label', 'Image options');
        menuBtn.setAttribute('aria-haspopup', 'menu');
        menuBtn.setAttribute('aria-expanded', 'false');
        menuBtn.textContent = '⋯';
        wrap.append(img, menuBtn);
      }

      img.alt = att.name;
      img.draggable = false;
      img.title = `${att.name} · click to view full screen`;
      const cached = getCachedAttachmentUrl(att.path);
      if (cached && img.getAttribute('src') !== cached) img.src = cached;
      else if (!cached && img.dataset.loading !== att.path) {
        img.dataset.loading = att.path;
        void notesClient.getAttachmentObjectUrl(att.path).then((url) => {
          if (!url || !img.isConnected) return;
          if (img.dataset.loading !== att.path) return;
          img.src = url;
          delete img.dataset.loading;
        });
      }
      return;
    }

    wrap.className = 'outline-attachment';
    delete wrap.dataset.displaySize;

    if (mediaKind === 'audio' || mediaKind === 'video') {
      const tag = mediaKind === 'audio' ? 'audio' : 'video';
      const media = ensureMedia(tag, `outline-attachment__${mediaKind}`);
      media.controls = true;
      media.preload = 'metadata';
      if (mediaKind === 'video') {
        (media as HTMLVideoElement).playsInline = true;
      }
      const cached = getCachedAttachmentUrl(att.path);
      if (cached && media.getAttribute('src') !== cached) media.src = cached;
      else if (!cached && media.dataset.loading !== att.path) {
        media.dataset.loading = att.path;
        void notesClient.getAttachmentObjectUrl(att.path).then((url) => {
          if (!url || !media.isConnected) return;
          if (media.dataset.loading !== att.path) return;
          media.src = url;
          delete media.dataset.loading;
        });
      }
      return;
    }

    let link = wrap.querySelector<HTMLAnchorElement>(':scope > .outline-attachment__file');
    if (!link) {
      wrap.replaceChildren();
      link = document.createElement('a');
      link.className = 'outline-attachment__file';
      link.rel = 'noopener noreferrer';
      wrap.appendChild(link);
    }
    const label = sizeLabel ? `${att.name} · ${sizeLabel}` : att.name;
    if (link.textContent !== label) link.textContent = label;
    link.download = att.name;
    const cached = getCachedAttachmentUrl(att.path);
    if (cached && link.getAttribute('href') !== cached) link.href = cached;
    else if (!cached && link.dataset.loading !== att.path) {
      link.dataset.loading = att.path;
      void notesClient.getAttachmentObjectUrl(att.path).then((url) => {
        if (!url || !link!.isConnected) return;
        if (link!.dataset.loading !== att.path) return;
        link!.href = url;
        delete link!.dataset.loading;
      });
    }
  }

  private buildClassName(): string {
    const parts = ['outline-item', `outline-item--${this.__kind}`];
    if (this.__kind === 'heading' && this.__headingLevel) {
      parts.push(`outline-item--h${this.__headingLevel}`);
    }
    // Prefer live store so Lexical DOM updates don't wipe selection chrome.
    const selected =
      this.__blockSelected || getBlockSelectedIds().has(this.__id);
    if (selected) {
      parts.push('outline-item--selected');
      if (isBlockSelfOnly(this.__id)) parts.push('outline-item--self-only');
      const parent = this.getParent();
      const parentSelected =
        $isOutlineItemNode(parent) && getBlockSelectedIds().has(parent.getId());
      if (!parentSelected) parts.push('outline-item--drag-root');
    }
    return parts.join(' ');
  }

  exportDOM(): DOMExportOutput {
    const element = document.createElement('div');
    this.applyDomAttrs(element);
    return { element };
  }

  static importDOM(): DOMConversionMap | null {
    return {
      div: (domNode: HTMLElement) => {
        if (!domNode.hasAttribute('data-outline-id')) return null;
        return {
          conversion: convertOutlineElement,
          priority: 1,
        };
      },
    };
  }

  exportJSON(): SerializedOutlineItemNode {
    return {
      ...super.exportJSON(),
      id: this.__id,
      kind: this.__kind,
      headingLevel: this.__headingLevel,
      status: this.__status,
      deadline: this.__deadline,
      entities: this.__entities,
      attachment: this.__attachment,
      type: 'outline-item',
      version: 2,
    };
  }

  static importJSON(serialized: SerializedOutlineItemNode): OutlineItemNode {
    const legacy = serialized as SerializedOutlineItemNode & {
      people?: string[] | null;
      kind?: string;
    };
    const schemaVersion = serialized.version === 2 ? 2 : 1;
    // Fresh ids only while pasting (see outlineIdRemap). Preserve ids otherwise.
    const id = shouldRemapOutlineIdsOnImport()
      ? createId()
      : serialized.id || createId();
    return $createOutlineItemNode(
      id,
      normalizeItemKind(legacy.kind ?? 'note', schemaVersion),
      serialized.status ?? null,
      serialized.headingLevel ?? null,
      serialized.deadline ?? null,
      serialized.entities ?? legacy.people ?? null,
      serialized.attachment ?? null,
    );
  }

  canBeEmpty(): boolean {
    return true;
  }

  canInsertTextBefore(): boolean {
    return true;
  }

  canInsertTextAfter(): boolean {
    return true;
  }

  isShadowRoot(): boolean {
    return false;
  }

  extractWithChild(): boolean {
    return false;
  }
}

function kindLabelFor(
  kind: ItemKind,
  headingLevel: HeadingLevel | null,
): string | null {
  if (kind === 'heading') {
    const level = headingLevel && headingLevel >= 1 && headingLevel <= 6 ? headingLevel : 1;
    return `H${level}`;
  }
  if (kind === 'task') return 'Task';
  if (kind === 'subtask') return 'Subtask';
  if (kind === 'attachment') return 'File';
  return null;
}

function convertOutlineElement(domNode: HTMLElement): DOMConversionOutput {
  // Fresh id on HTML paste so duplicates are independent of the source row.
  const id = createId();
  // DOM from current builds uses task/subtask; only map legacy `project`.
  const rawKind = domNode.getAttribute('data-kind') ?? 'note';
  const kind = normalizeItemKind(rawKind, rawKind === 'project' ? 1 : 2);
  const status = domNode.getAttribute('data-status');
  const levelAttr = domNode.getAttribute('data-heading-level');
  const headingLevel =
    levelAttr && kind === 'heading'
      ? (Math.min(6, Math.max(1, Number(levelAttr))) as HeadingLevel)
      : null;
  return { node: $createOutlineItemNode(id, kind, status, headingLevel) };
}

export function $createOutlineItemNode(
  id: string,
  kind: ItemKind = 'note',
  status: string | null = null,
  headingLevel: HeadingLevel | null = null,
  deadline: string | null = null,
  entities: string[] | null = null,
  attachment: AttachmentMeta | null = null,
): OutlineItemNode {
  return $applyNodeReplacement(
    new OutlineItemNode(
      id,
      kind,
      status,
      headingLevel,
      undefined,
      deadline,
      entities,
      attachment,
    ),
  );
}

export function $isOutlineItemNode(
  node: LexicalNode | null | undefined,
): node is OutlineItemNode {
  return node instanceof OutlineItemNode;
}
