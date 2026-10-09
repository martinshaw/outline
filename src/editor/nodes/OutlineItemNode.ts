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
import { getBlockSelectedIds } from '../blockSelectionStore';
import { getStatusDef } from '../../settings/settingsStore';
import {
  isRoleKind,
  normalizeItemKind,
  type HeadingLevel,
  type ItemKind,
} from '../../types';
import {
  formatMetaSubline,
  formatSubtaskProgress,
  isCompleteStatus,
  isDeadlineOverdue,
  isIsoDate,
  normalizeEntities,
} from '../../utils/itemMeta';

export type SerializedOutlineItemNode = Spread<
  {
    id: string;
    kind: ItemKind;
    headingLevel: HeadingLevel | null;
    status: string | null;
    deadline: string | null;
    entities: string[];
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
  ) {
    super(key);
    this.__id = id;
    this.__kind = kind;
    this.__headingLevel = normalizeHeadingLevel(kind, headingLevel);
    const isRole = isRoleKind(kind);
    this.__status = isRole ? status : null;
    this.__deadline = isRole && deadline && isIsoDate(deadline) ? deadline : null;
    this.__entities = isRole ? normalizeEntities(entities) : [];
    this.__blockSelected = false;
  }

  getId(): string {
    return this.__id;
  }

  getKind(): ItemKind {
    return this.getLatest().__kind;
  }

  setKind(kind: ItemKind): this {
    const writable = this.getWritable();
    writable.__kind = kind;
    if (kind === 'note' || kind === 'heading') {
      writable.__status = null;
      writable.__deadline = null;
      writable.__entities = [];
    }
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
   * DOM: [status chip?][editable children…][meta][progress].
   * Chip leads so the caret sits after it (flex order alone left the caret
   * stranded before the chip on empty task rows).
   */
  getDOMSlot(element: HTMLElement): ElementDOMSlot {
    let slot = super.getDOMSlot(element);
    const host = element as HTMLElement & {
      __outlineStatusChip?: HTMLElement | null;
      __outlineMeta?: HTMLElement | null;
    };
    const meta =
      host.__outlineMeta?.isConnected
        ? host.__outlineMeta
        : element.querySelector(':scope > .outline-meta');
    const chip =
      host.__outlineStatusChip?.isConnected
        ? host.__outlineStatusChip
        : element.querySelector(':scope > .outline-status-chip');
    if (chip) slot = slot.withAfter(chip);
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

  private countDescendantSubtasks(): { total: number; complete: number } {
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
            const { total, complete } = this.countDescendantSubtasks();
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
    return $createOutlineItemNode(
      serialized.id,
      normalizeItemKind(legacy.kind ?? 'note', schemaVersion),
      serialized.status ?? null,
      serialized.headingLevel ?? null,
      serialized.deadline ?? null,
      serialized.entities ?? legacy.people ?? null,
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
  return null;
}

function convertOutlineElement(domNode: HTMLElement): DOMConversionOutput {
  const id = domNode.getAttribute('data-outline-id') ?? crypto.randomUUID();
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
    ),
  );
}

export function $isOutlineItemNode(
  node: LexicalNode | null | undefined,
): node is OutlineItemNode {
  return node instanceof OutlineItemNode;
}
