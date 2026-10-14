import { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { OutlineEditor } from '../OutlineEditor';
import {
  getBlockSelectedIds,
  resetBlockSelectionStore,
} from '../blockSelectionStore';
import { dayDoc, item } from '../test/harness';
import type { DayDocument } from '../../types';

function Host({ doc }: { doc: DayDocument }) {
  const [document, setDocument] = useState(doc);
  return (
    <OutlineEditor
      date={document.date}
      document={document}
      enabled
      focusFirstLineKey={0}
      focusItemId={null}
      onFocusHandled={() => {}}
      onSave={async () => {}}
      onChange={setDocument}
    />
  );
}

describe('EmptyItemFocusPlugin', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    container.remove();
    vi.restoreAllMocks();
  });

  it('does not steal left gutter mousedown (block selection)', async () => {
    resetBlockSelectionStore();
    const doc = dayDoc([item('a', 'Hello world')]);

    await act(async () => {
      root.render(<Host doc={doc} />);
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    const itemEl = container.querySelector('.outline-item') as HTMLElement;
    vi.spyOn(itemEl, 'getBoundingClientRect').mockReturnValue({
      x: 0,
      y: 0,
      top: 0,
      left: 0,
      bottom: 24,
      right: 400,
      width: 400,
      height: 24,
      toJSON: () => ({}),
    });
    const realComputed = window.getComputedStyle.bind(window);
    vi.spyOn(window, 'getComputedStyle').mockImplementation((el) => {
      const style = realComputed(el);
      if (el === itemEl) {
        return new Proxy(style, {
          get(target, prop, receiver) {
            if (prop === 'paddingLeft') return '60px';
            return Reflect.get(target, prop, receiver);
          },
        });
      }
      return style;
    });

    await act(async () => {
      itemEl.dispatchEvent(
        new MouseEvent('mousedown', {
          bubbles: true,
          cancelable: true,
          button: 0,
          clientX: 20,
          clientY: 12,
        }),
      );
    });
    await act(async () => {
      window.dispatchEvent(
        new MouseEvent('mouseup', {
          bubbles: true,
          cancelable: true,
          button: 0,
          clientX: 20,
          clientY: 12,
        }),
      );
    });

    expect([...getBlockSelectedIds()]).toEqual(['a']);
  });

  it('places the caret at the end when clicking trailing empty space', async () => {
    const doc = dayDoc([item('a', 'Hello world')]);

    await act(async () => {
      root.render(<Host doc={doc} />);
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    const itemEl = container.querySelector('.outline-item') as HTMLElement;
    expect(itemEl).toBeTruthy();

    // Pretend the title text only extends partway across the row.
    const textSpan = itemEl.querySelector(
      '[data-lexical-text="true"]',
    ) as HTMLElement | null;
    expect(textSpan).toBeTruthy();

    vi.spyOn(itemEl, 'getBoundingClientRect').mockReturnValue({
      x: 0,
      y: 0,
      top: 0,
      left: 0,
      bottom: 24,
      right: 400,
      width: 400,
      height: 24,
      toJSON: () => ({}),
    });
    vi.spyOn(textSpan!, 'getBoundingClientRect').mockReturnValue({
      x: 40,
      y: 0,
      top: 0,
      left: 40,
      bottom: 24,
      right: 120,
      width: 80,
      height: 24,
      toJSON: () => ({}),
    });

    await act(async () => {
      itemEl.dispatchEvent(
        new MouseEvent('mousedown', {
          bubbles: true,
          cancelable: true,
          button: 0,
          clientX: 300,
          clientY: 12,
        }),
      );
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    const selection = window.getSelection();
    expect(selection && selection.rangeCount > 0).toBe(true);
    expect(selection!.isCollapsed).toBe(true);
    expect(selection!.anchorNode?.textContent).toContain('Hello world');
    expect(selection!.anchorOffset).toBe('Hello world'.length);
  });

  it('does not steal mousedown when a text caret is under the pointer', async () => {
    const doc = dayDoc([item('a', 'Hello world')]);

    await act(async () => {
      root.render(<Host doc={doc} />);
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    const itemEl = container.querySelector('.outline-item') as HTMLElement;
    const textSpan = itemEl.querySelector(
      '[data-lexical-text="true"]',
    ) as HTMLElement;
    const textNode = textSpan.firstChild as Text;

    // Simulate flex-shrunk span: row click target, but caret still in text.
    vi.spyOn(itemEl, 'getBoundingClientRect').mockReturnValue({
      x: 0,
      y: 0,
      top: 0,
      left: 0,
      bottom: 24,
      right: 400,
      width: 400,
      height: 24,
      toJSON: () => ({}),
    });
    vi.spyOn(textSpan, 'getBoundingClientRect').mockReturnValue({
      x: 40,
      y: 0,
      top: 0,
      left: 40,
      bottom: 24,
      right: 80,
      width: 40,
      height: 24,
      toJSON: () => ({}),
    });

    const mid = document.createRange();
    mid.setStart(textNode, 3);
    mid.collapse(true);
    Object.defineProperty(document, 'caretRangeFromPoint', {
      configurable: true,
      writable: true,
      value: () => mid,
    });

    let prevented = false;
    await act(async () => {
      const event = new MouseEvent('mousedown', {
        bubbles: true,
        cancelable: true,
        button: 0,
        clientX: 100,
        clientY: 12,
      });
      event.preventDefault = () => {
        prevented = true;
        MouseEvent.prototype.preventDefault.call(event);
      };
      itemEl.dispatchEvent(event);
    });

    expect(prevented).toBe(false);
  });

  it('places caret at end of parent when gutter hit maps into nested child text', async () => {
    const doc = dayDoc([
      item('a', 'Parent title', [item('a1', 'Nested child line')]),
    ]);

    await act(async () => {
      root.render(<Host doc={doc} />);
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    const parentEl = container.querySelector(
      '[data-outline-id="a"]',
    ) as HTMLElement;
    const childEl = container.querySelector(
      '[data-outline-id="a1"]',
    ) as HTMLElement;
    const parentText = parentEl.querySelector(
      ':scope > [data-lexical-text="true"]',
    ) as HTMLElement;
    const childText = childEl.querySelector(
      '[data-lexical-text="true"]',
    ) as HTMLElement;
    const childNode = childText.firstChild as Text;
    expect(parentText).toBeTruthy();
    expect(childNode).toBeTruthy();

    vi.spyOn(parentEl, 'getBoundingClientRect').mockReturnValue({
      x: 0,
      y: 0,
      top: 0,
      left: 0,
      bottom: 48,
      right: 400,
      width: 400,
      height: 48,
      toJSON: () => ({}),
    });
    vi.spyOn(childEl, 'getBoundingClientRect').mockReturnValue({
      x: 20,
      y: 24,
      top: 24,
      left: 20,
      bottom: 48,
      right: 400,
      width: 380,
      height: 24,
      toJSON: () => ({}),
    });
    vi.spyOn(parentText, 'getBoundingClientRect').mockReturnValue({
      x: 40,
      y: 0,
      top: 0,
      left: 40,
      bottom: 22,
      right: 140,
      width: 100,
      height: 22,
      toJSON: () => ({}),
    });
    vi.spyOn(childText, 'getBoundingClientRect').mockReturnValue({
      x: 60,
      y: 24,
      top: 24,
      left: 60,
      bottom: 46,
      right: 200,
      width: 140,
      height: 22,
      toJSON: () => ({}),
    });

    // Browser maps the parent gutter click into the nested child's text start.
    const childStart = document.createRange();
    childStart.setStart(childNode, 0);
    childStart.collapse(true);
    Object.defineProperty(document, 'caretRangeFromPoint', {
      configurable: true,
      writable: true,
      value: () => childStart,
    });

    await act(async () => {
      parentEl.dispatchEvent(
        new MouseEvent('mousedown', {
          bubbles: true,
          cancelable: true,
          button: 0,
          clientX: 320,
          clientY: 10,
        }),
      );
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    const selection = window.getSelection();
    expect(selection && selection.rangeCount > 0).toBe(true);
    expect(selection!.isCollapsed).toBe(true);
    expect(selection!.anchorNode?.textContent).toContain('Parent title');
    expect(selection!.anchorOffset).toBe('Parent title'.length);
  });

  it('extends selection when dragging from trailing empty space into text', async () => {
    const doc = dayDoc([item('a', 'Hello world')]);

    await act(async () => {
      root.render(<Host doc={doc} />);
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    const itemEl = container.querySelector('.outline-item') as HTMLElement;
    const textSpan = itemEl.querySelector(
      '[data-lexical-text="true"]',
    ) as HTMLElement;
    const textNode = textSpan.firstChild as Text;
    expect(textNode?.nodeType).toBe(Node.TEXT_NODE);

    vi.spyOn(itemEl, 'getBoundingClientRect').mockReturnValue({
      x: 0,
      y: 0,
      top: 0,
      left: 0,
      bottom: 24,
      right: 400,
      width: 400,
      height: 24,
      toJSON: () => ({}),
    });
    vi.spyOn(textSpan, 'getBoundingClientRect').mockReturnValue({
      x: 40,
      y: 0,
      top: 0,
      left: 40,
      bottom: 24,
      right: 120,
      width: 80,
      height: 24,
      toJSON: () => ({}),
    });

    const mid = document.createRange();
    mid.setStart(textNode, 5);
    mid.collapse(true);
    // Trailing empty space has no text caret; only the drag move hits text.
    Object.defineProperty(document, 'caretRangeFromPoint', {
      configurable: true,
      writable: true,
      value: (x: number, _y: number) => (x < 200 ? mid : null),
    });

    await act(async () => {
      itemEl.dispatchEvent(
        new MouseEvent('mousedown', {
          bubbles: true,
          cancelable: true,
          button: 0,
          clientX: 300,
          clientY: 12,
        }),
      );
    });

    await act(async () => {
      window.dispatchEvent(
        new MouseEvent('mousemove', {
          bubbles: true,
          cancelable: true,
          button: 0,
          buttons: 1,
          clientX: 80,
          clientY: 12,
        }),
      );
    });

    await act(async () => {
      window.dispatchEvent(
        new MouseEvent('mouseup', {
          bubbles: true,
          cancelable: true,
          button: 0,
          clientX: 80,
          clientY: 12,
        }),
      );
    });

    const selection = window.getSelection();
    expect(selection && selection.rangeCount > 0).toBe(true);
    expect(selection!.isCollapsed).toBe(false);
    expect(selection!.toString()).toBe(' world');
  });
});
