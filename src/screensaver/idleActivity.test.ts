import { describe, expect, it } from 'vitest';
import {
  isIdleElapsed,
  shouldResetScreensaverIdle,
} from './idleActivity';

describe('screensaver idle activity', () => {
  it('does not reset on keydown outside editor chrome', () => {
    const body = document.body;
    const event = new KeyboardEvent('keydown', { bubbles: true });
    Object.defineProperty(event, 'target', { value: body });
    expect(shouldResetScreensaverIdle(event)).toBe(false);
  });

  it('resets on keydown in the editor', () => {
    const editor = document.createElement('div');
    editor.className = 'editor-input';
    document.body.appendChild(editor);
    const event = new KeyboardEvent('keydown', { bubbles: true });
    Object.defineProperty(event, 'target', { value: editor });
    expect(shouldResetScreensaverIdle(event)).toBe(true);
    editor.remove();
  });

  it('ignores wheel', () => {
    expect(
      shouldResetScreensaverIdle(new WheelEvent('wheel', { bubbles: true })),
    ).toBe(false);
  });

  it('detects elapsed idle', () => {
    expect(isIdleElapsed(0, 10_000, 10_000)).toBe(true);
    expect(isIdleElapsed(0, 10_000, 9_999)).toBe(false);
  });
});
