import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EmptyDocHints } from './EmptyDocHints';

describe('EmptyDocHints', () => {
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

  it('renders get-started copy and tips', async () => {
    await act(async () => {
      root.render(<EmptyDocHints onDismiss={() => {}} />);
    });

    expect(container.textContent).toMatch(/Get started/i);
    expect(container.textContent).toMatch(/Type to start a note/i);
    expect(container.textContent).toMatch(/command palette/i);
    expect(container.textContent).toMatch(/stays on your device/i);
    expect(container.querySelectorAll('.editor-empty-hints__item').length).toBe(
      6,
    );
  });

  it('dismisses via the SVG close control', async () => {
    const onDismiss = vi.fn();
    await act(async () => {
      root.render(<EmptyDocHints onDismiss={onDismiss} />);
    });

    const close = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Dismiss tips"]',
    );
    expect(close).toBeTruthy();
    expect(close!.querySelector('svg.btn__close-icon')).toBeTruthy();

    await act(async () => {
      close!.click();
    });
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});
