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
import { getStatusDef } from '../../settings/settingsStore';
import type { HeadingLevel, ItemKind } from '../../types';

export type SerializedOutlineItemNode = Spread<
  {
    id: string;
    kind: ItemKind;
    headingLevel: HeadingLevel | null;
    status: string | null;
    type: 'outline-item';
    version: 1;
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
    );
  }

  constructor(
    id: string,
    kind: ItemKind = 'note',
    status: string | null = null,
    headingLevel: HeadingLevel | null = null,
    key?: NodeKey,
  ) {
    super(key);
    this.__id = id;
    this.__kind = kind;
    this.__headingLevel = normalizeHeadingLevel(kind, headingLevel);
    this.__status = kind === 'project' || kind === 'task' ? status : null;
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
    if (kind === 'note' || kind === 'heading') writable.__status = null;
    if (kind !== 'heading') writable.__headingLevel = null;
    else if (writable.__headingLevel == null) writable.__headingLevel = 1;
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
      return writable;
    }
    writable.__kind = 'heading';
    writable.__headingLevel = level;
    writable.__status = null;
    return writable;
  }

  getStatus(): string | null {
    return this.getLatest().__status;
  }

  setStatus(status: string | null): this {
    const writable = this.getWritable();
    writable.__status = status;
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

  updateDOM(prev: OutlineItemNode, dom: HTMLElement): boolean {
    if (
      prev.__kind !== this.__kind ||
      prev.__status !== this.__status ||
      prev.__headingLevel !== this.__headingLevel ||
      prev.__blockSelected !== this.__blockSelected
    ) {
      this.applyDomAttrs(dom);
    }
    return false;
  }

  /**
   * Lexical children must follow chrome (bullet + optional chip) so the
   * reconciler does not treat those nodes as unmanaged mutations.
   */
  getDOMSlot(element: HTMLElement): ElementDOMSlot {
    const slot = super.getDOMSlot(element);
    const host = element as HTMLElement & {
      __outlineBullet?: HTMLElement | null;
      __outlineStatusChip?: HTMLElement | null;
    };
    const chip =
      host.__outlineStatusChip?.isConnected
        ? host.__outlineStatusChip
        : element.querySelector(':scope > .outline-status-chip');
    const bullet =
      host.__outlineBullet?.isConnected
        ? host.__outlineBullet
        : element.querySelector(':scope > .outline-bullet');
    const after = chip ?? bullet;
    return after ? slot.withAfter(after) : slot;
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
    this.syncChrome(dom);
  }

  private syncChrome(dom: HTMLElement): void {
    const host = dom as HTMLElement & {
      __outlineBullet?: HTMLElement | null;
      __outlineStatusChip?: HTMLButtonElement | null;
    };

    let bullet =
      host.__outlineBullet?.isConnected
        ? host.__outlineBullet
        : dom.querySelector<HTMLElement>(':scope > .outline-bullet');
    if (!bullet) {
      bullet = document.createElement('span');
      bullet.className = 'outline-bullet';
      bullet.contentEditable = 'false';
      bullet.setAttribute('aria-hidden', 'true');
      dom.insertBefore(bullet, dom.firstChild);
    }
    host.__outlineBullet = bullet;

    let chip =
      host.__outlineStatusChip?.isConnected
        ? host.__outlineStatusChip
        : dom.querySelector<HTMLButtonElement>(':scope > .outline-status-chip');

    if (this.__kind !== 'project' && this.__kind !== 'task') {
      chip?.remove();
      host.__outlineStatusChip = null;
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
      bullet.insertAdjacentElement('afterend', chip);
    } else if (chip.previousElementSibling !== bullet) {
      bullet.insertAdjacentElement('afterend', chip);
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
  }

  private buildClassName(): string {
    const parts = ['outline-item', `outline-item--${this.__kind}`];
    if (this.__kind === 'heading' && this.__headingLevel) {
      parts.push(`outline-item--h${this.__headingLevel}`);
    }
    if (this.__blockSelected) parts.push('outline-item--selected');
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
      type: 'outline-item',
      version: 1,
    };
  }

  static importJSON(serialized: SerializedOutlineItemNode): OutlineItemNode {
    return $createOutlineItemNode(
      serialized.id,
      serialized.kind,
      serialized.status ?? null,
      serialized.headingLevel ?? null,
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

function convertOutlineElement(domNode: HTMLElement): DOMConversionOutput {
  const id = domNode.getAttribute('data-outline-id') ?? crypto.randomUUID();
  const kind = (domNode.getAttribute('data-kind') as ItemKind) || 'note';
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
): OutlineItemNode {
  return $applyNodeReplacement(
    new OutlineItemNode(id, kind, status, headingLevel),
  );
}

export function $isOutlineItemNode(
  node: LexicalNode | null | undefined,
): node is OutlineItemNode {
  return node instanceof OutlineItemNode;
}
