import { describe, expect, it, beforeEach } from 'vitest';
import {
  resetBlockSelectionStore,
  selfOnlyHighlightHeight,
  setBlockSelectedIds,
  setBlockSelfOnlyIds,
  syncBlockSelectionDom,
  syncSelfOnlyHighlightVar,
} from './blockSelectionStore';

beforeEach(() => {
  resetBlockSelectionStore();
  document.body.innerHTML = '';
});

function mountTree(): HTMLElement {
  const root = document.createElement('div');
  root.className = 'editor-input';
  root.innerHTML = `
    <div class="outline-item" data-outline-id="parent">
      <div class="outline-attachment" style="height:120px"></div>
      <div class="outline-item" data-outline-id="child" style="margin-top:8px">
        child
      </div>
    </div>
  `;
  document.body.appendChild(root);
  return root;
}

describe('selfOnlyHighlightHeight', () => {
  it('measures from parent top to first nested outline row', () => {
    const root = mountTree();
    const parent = root.querySelector(
      '[data-outline-id="parent"]',
    ) as HTMLElement;
    // Force layout sizes in jsdom via explicit offsets when needed
    Object.defineProperty(parent, 'getBoundingClientRect', {
      value: () => ({
        top: 100,
        bottom: 300,
        left: 0,
        right: 100,
        width: 100,
        height: 200,
        x: 0,
        y: 100,
        toJSON: () => ({}),
      }),
    });
    const child = parent.querySelector(
      '[data-outline-id="child"]',
    ) as HTMLElement;
    Object.defineProperty(child, 'getBoundingClientRect', {
      value: () => ({
        top: 220,
        bottom: 240,
        left: 0,
        right: 100,
        width: 100,
        height: 20,
        x: 0,
        y: 220,
        toJSON: () => ({}),
      }),
    });
    expect(selfOnlyHighlightHeight(parent)).toBe(120);
  });

  it('uses full height when there are no nested rows', () => {
    const el = document.createElement('div');
    el.className = 'outline-item';
    Object.defineProperty(el, 'getBoundingClientRect', {
      value: () => ({
        top: 0,
        bottom: 40,
        left: 0,
        right: 100,
        width: 100,
        height: 40,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      }),
    });
    expect(selfOnlyHighlightHeight(el)).toBe(40);
  });
});

describe('syncBlockSelectionDom', () => {
  it('applies selected + self-only classes and highlight var', () => {
    const root = mountTree();
    const parent = root.querySelector(
      '[data-outline-id="parent"]',
    ) as HTMLElement;
    Object.defineProperty(parent, 'getBoundingClientRect', {
      value: () => ({
        top: 0,
        bottom: 200,
        left: 0,
        right: 100,
        width: 100,
        height: 200,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      }),
    });
    const child = parent.querySelector(
      '[data-outline-id="child"]',
    ) as HTMLElement;
    Object.defineProperty(child, 'getBoundingClientRect', {
      value: () => ({
        top: 150,
        bottom: 170,
        left: 0,
        right: 100,
        width: 100,
        height: 20,
        x: 0,
        y: 150,
        toJSON: () => ({}),
      }),
    });

    setBlockSelectedIds(['parent']);
    setBlockSelfOnlyIds(['parent']);
    syncBlockSelectionDom(root);

    expect(parent.classList.contains('outline-item--selected')).toBe(true);
    expect(parent.classList.contains('outline-item--self-only')).toBe(true);
    expect(parent.classList.contains('outline-item--drag-root')).toBe(true);
    expect(parent.style.getPropertyValue('--outline-self-sel-h')).toBe('150px');
  });

  it('clears self-only chrome when toggled off', () => {
    const root = mountTree();
    const parent = root.querySelector(
      '[data-outline-id="parent"]',
    ) as HTMLElement;
    setBlockSelectedIds(['parent']);
    setBlockSelfOnlyIds(['parent']);
    syncBlockSelectionDom(root);
    setBlockSelfOnlyIds([]);
    syncBlockSelectionDom(root);
    expect(parent.classList.contains('outline-item--self-only')).toBe(false);
    expect(parent.style.getPropertyValue('--outline-self-sel-h')).toBe('');
  });
});

describe('syncSelfOnlyHighlightVar', () => {
  it('skips disconnected nodes', () => {
    const el = document.createElement('div');
    syncSelfOnlyHighlightVar(el, true);
    expect(el.style.getPropertyValue('--outline-self-sel-h')).toBe('');
  });
});
