import { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { OutlineEditor } from './OutlineEditor';
import { dayDoc, item } from './test/harness';
import type { DayDocument } from '../types';

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

describe('Cmd+A select-all (DOM)', () => {
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
  });

  it('does not create orphan empty outline-item DOM nodes', async () => {
    const doc = dayDoc([
      item('a', 'parent', [item('b', 'child')]),
      item('c', 'sib'),
    ]);

    await act(async () => {
      root.render(<Host doc={doc} />);
    });

    // Allow LoadDocumentPlugin effect to flush
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    const editor = container.querySelector('.editor-input');
    expect(editor).toBeTruthy();

    const before = [
      ...container.querySelectorAll('.outline-item'),
    ].map((el) => ({
      id: el.getAttribute('data-outline-id'),
      text: (el.textContent ?? '').replace(/\s+/g, ' ').trim(),
    }));
    expect(before.length).toBeGreaterThanOrEqual(3);

    await act(async () => {
      editor!.dispatchEvent(
        new KeyboardEvent('keydown', {
          key: 'a',
          code: 'KeyA',
          metaKey: true,
          bubbles: true,
          cancelable: true,
        }),
      );
      // Also fire on window — EditorFocusPlugin listens there
      window.dispatchEvent(
        new KeyboardEvent('keydown', {
          key: 'a',
          code: 'KeyA',
          metaKey: true,
          bubbles: true,
          cancelable: true,
        }),
      );
    });

    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });

    const after = [...container.querySelectorAll('.outline-item')].map((el) => ({
      id: el.getAttribute('data-outline-id'),
      text: [...el.childNodes]
        .filter((n) => n.nodeType === Node.TEXT_NODE || (n instanceof HTMLElement && !n.classList.contains('outline-item')))
        .map((n) => n.textContent ?? '')
        .join('')
        .trim(),
      html: el.outerHTML.slice(0, 120),
    }));

    const empty = after.filter((row) => row.text === '');
    expect(empty, JSON.stringify(after, null, 2)).toEqual([]);
    expect(after.length).toBe(before.length);

    // Type after select-all — should replace content, not leave shells
    await act(async () => {
      editor!.dispatchEvent(
        new KeyboardEvent('keydown', {
          key: 'x',
          code: 'KeyX',
          bubbles: true,
          cancelable: true,
        }),
      );
      // Simulate beforeinput insert
      editor!.dispatchEvent(
        new InputEvent('beforeinput', {
          inputType: 'insertText',
          data: 'x',
          bubbles: true,
          cancelable: true,
        }),
      );
    });

    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });

    const typed = [...container.querySelectorAll('.outline-item')].map((el) => {
      const own = [...el.childNodes]
        .filter(
          (n) =>
            n.nodeType === Node.TEXT_NODE ||
            (n instanceof HTMLElement && !n.classList.contains('outline-item')),
        )
        .map((n) => n.textContent ?? '')
        .join('')
        .trim();
      return { id: el.getAttribute('data-outline-id'), text: own };
    });
    expect(typed.filter((r) => r.text === ''), JSON.stringify(typed)).toEqual([]);
  });
});
