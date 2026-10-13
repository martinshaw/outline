import { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { OutlineEditor } from '../OutlineEditor';
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
    Object.defineProperty(document, 'caretRangeFromPoint', {
      configurable: true,
      writable: true,
      value: () => mid,
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
