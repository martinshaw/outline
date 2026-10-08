import {
  $applyNodeReplacement,
  type DOMConversionMap,
  type DOMConversionOutput,
  type DOMExportOutput,
  type EditorConfig,
  ElementNode,
  type LexicalNode,
  type NodeKey,
  type SerializedElementNode,
  type Spread,
} from 'lexical';
import type { ItemKind } from '../../types';

export type SerializedOutlineItemNode = Spread<
  {
    id: string;
    kind: ItemKind;
    type: 'outline-item';
    version: 1;
  },
  SerializedElementNode
>;

export class OutlineItemNode extends ElementNode {
  __id: string;
  __kind: ItemKind;
  __blockSelected: boolean;

  static getType(): string {
    return 'outline-item';
  }

  static clone(node: OutlineItemNode): OutlineItemNode {
    return new OutlineItemNode(node.__id, node.__kind, node.__key);
  }

  constructor(id: string, kind: ItemKind = 'note', key?: NodeKey) {
    super(key);
    this.__id = id;
    this.__kind = kind;
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
    dom.className = this.buildClassName();
    dom.setAttribute('data-outline-id', this.__id);
    dom.setAttribute('data-kind', this.__kind);
    return dom;
  }

  updateDOM(prev: OutlineItemNode, dom: HTMLElement): boolean {
    if (prev.__kind !== this.__kind || prev.__blockSelected !== this.__blockSelected) {
      dom.className = this.buildClassName();
      dom.setAttribute('data-kind', this.__kind);
    }
    return false;
  }

  private buildClassName(): string {
    const parts = ['outline-item', `outline-item--${this.__kind}`];
    if (this.__blockSelected) parts.push('outline-item--selected');
    return parts.join(' ');
  }

  exportDOM(): DOMExportOutput {
    const element = document.createElement('div');
    element.setAttribute('data-outline-id', this.__id);
    element.setAttribute('data-kind', this.__kind);
    element.className = this.buildClassName();
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
      type: 'outline-item',
      version: 1,
    };
  }

  static importJSON(serialized: SerializedOutlineItemNode): OutlineItemNode {
    return $createOutlineItemNode(serialized.id, serialized.kind);
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
  return { node: $createOutlineItemNode(id, kind) };
}

export function $createOutlineItemNode(
  id: string,
  kind: ItemKind = 'note',
): OutlineItemNode {
  return $applyNodeReplacement(new OutlineItemNode(id, kind));
}

export function $isOutlineItemNode(
  node: LexicalNode | null | undefined,
): node is OutlineItemNode {
  return node instanceof OutlineItemNode;
}
