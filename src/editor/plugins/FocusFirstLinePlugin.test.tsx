import { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { OutlineEditor } from '../OutlineEditor';
import { dayDoc, item } from '../test/harness';
import type { DayDocument } from '../../types';

function Host({
  doc,
  focusKey,
}: {
  doc: DayDocument;
  focusKey: number;
}) {
  const [document, setDocument] = useState(doc);
  return (
    <OutlineEditor
      date={document.date}
      document={document}
      enabled
      focusFirstLineKey={focusKey}
      focusItemId={null}
      onFocusHandled={() => {}}
      onSave={async () => {}}
      onChange={setDocument}
    />
  );
}

describe('FocusFirstLinePlugin', () => {
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

  it('places the caret in the first outline item when requested', async () => {
    const doc = dayDoc([item('a', 'Alpha'), item('b', 'Beta')]);

    await act(async () => {
      root.render(<Host doc={doc} focusKey={0} />);
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    await act(async () => {
      root.render(<Host doc={doc} focusKey={1} />);
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    const selection = window.getSelection();
    expect(selection && selection.rangeCount > 0).toBe(true);
    const anchor = selection!.anchorNode;
    const first = container.querySelector('.outline-item');
    expect(first).toBeTruthy();
    expect(
      first!.contains(anchor) ||
        anchor === first ||
        first!.contains(anchor?.parentElement ?? null),
    ).toBe(true);
  });
});
