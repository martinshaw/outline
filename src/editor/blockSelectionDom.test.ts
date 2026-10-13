import { describe, expect, it, beforeEach } from 'vitest';
import {
  disposeBlockDragHandles,
  resetBlockSelectionStore,
  selfOnlyHighlightHeight,
  setBlockSelectedIds,
  setBlockSelfOnlyIds,
  syncBlockDragHandles,
  syncBlockSelectionDom,
  syncSelfOnlyHighlightVar,
} from './blockSelectionStore';

beforeEach(() => {
  resetBlockSelectionStore();
  disposeBlockDragHandles();
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

function mockRect(
  el: Element,
  rect: { top: number; left: number; height: number; width?: number },
): void {
  const width = rect.width ?? 100;
  Object.defineProperty(el, 'getBoundingClientRect', {
    configurable: true,
    value: () => ({
      top: rect.top,
      bottom: rect.top + rect.height,
      left: rect.left,
      right: rect.left + width,
      width,
      height: rect.height,
      x: rect.left,
      y: rect.top,
      toJSON: () => ({}),
    }),
  });
}

/** Editor shell + input with sibling selected rows (multi drag-root). */
function mountSelectionShell(): { shell: HTMLElement; root: HTMLElement } {
  const shell = document.createElement('div');
  shell.className = 'editor-shell';
  Object.defineProperty(shell, 'getBoundingClientRect', {
    configurable: true,
    value: () => ({
      top: 0,
      bottom: 400,
      left: 0,
      right: 400,
      width: 400,
      height: 400,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    }),
  });
  const root = document.createElement('div');
  root.className = 'editor-input';
  root.innerHTML = `
    <div class="outline-item" data-outline-id="task">
      task
      <div class="outline-item" data-outline-id="a">A</div>
      <div class="outline-item" data-outline-id="b">B
        <div class="outline-item" data-outline-id="b1">B1</div>
      </div>
      <div class="outline-item" data-outline-id="c">C</div>
    </div>
  `;
  shell.appendChild(root);
  document.body.appendChild(shell);
  return { shell, root };
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

describe('syncBlockDragHandles', () => {
  it('shows one handle centered on the union of multi drag-roots', () => {
    const { shell, root } = mountSelectionShell();
    const task = root.querySelector('[data-outline-id="task"]') as HTMLElement;
    const a = root.querySelector('[data-outline-id="a"]') as HTMLElement;
    const b = root.querySelector('[data-outline-id="b"]') as HTMLElement;
    const b1 = root.querySelector('[data-outline-id="b1"]') as HTMLElement;
    const c = root.querySelector('[data-outline-id="c"]') as HTMLElement;

    mockRect(task, { top: 0, left: 20, height: 200 });
    mockRect(a, { top: 40, left: 40, height: 20 });
    mockRect(b, { top: 70, left: 40, height: 50 });
    mockRect(b1, { top: 95, left: 60, height: 20 });
    mockRect(c, { top: 130, left: 40, height: 20 });

    setBlockSelectedIds(['a', 'b', 'b1', 'c']);
    syncBlockSelectionDom(root);
    syncBlockDragHandles(root);

    const handles = shell.querySelectorAll('.outline-block-handle');
    expect(handles).toHaveLength(1);
    const handle = handles[0] as HTMLButtonElement;
    // First drag-root in document order anchors the handle id.
    expect(handle.dataset.outlineId).toBe('a');
    // Union of a (40..60), b (70..120), c (130..150) → center at 95.
    expect(handle.style.top).toBe('95px');
    // Nested rows align to the root gutter (task.left + 2).
    expect(handle.style.left).toBe('22px');
  });

  it('centers a single self-only handle on the parent content height', () => {
    const { shell, root } = mountSelectionShell();
    const task = root.querySelector('[data-outline-id="task"]') as HTMLElement;
    const b = root.querySelector('[data-outline-id="b"]') as HTMLElement;
    const b1 = root.querySelector('[data-outline-id="b1"]') as HTMLElement;

    mockRect(task, { top: 0, left: 20, height: 200 });
    mockRect(b, { top: 70, left: 40, height: 50 });
    mockRect(b1, { top: 95, left: 60, height: 20 });

    setBlockSelectedIds(['b']);
    setBlockSelfOnlyIds(['b']);
    syncBlockSelectionDom(root);
    syncBlockDragHandles(root);

    const handle = shell.querySelector(
      '.outline-block-handle',
    ) as HTMLButtonElement;
    expect(handle).toBeTruthy();
    // Self-only height is distance to first nested row: 95 - 70 = 25 → center 70+12.5.
    expect(handle.style.top).toBe('83px');
    expect(handle.classList.contains('outline-block-handle--self-only')).toBe(
      true,
    );
  });
});
