/** UI that should not reset idle arming when focused. */
const CHROME_SELECTOR = [
  '.settings-overlay',
  '.shortcuts-overlay',
  '.command-palette-overlay',
  '.tasks-overlay',
  '.board-overlay',
  '.search-overlay',
  '.screensaver-overlay',
].join(',');

export function isScreensaverChromeTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  return Boolean(target.closest(CHROME_SELECTOR));
}

/** Count user input toward idle reset (not every window keydown). */
export function shouldResetScreensaverIdle(event: Event): boolean {
  if (event.type === 'wheel') return false;
  const target = event.target;
  if (isScreensaverChromeTarget(target)) return false;

  if (event.type === 'keydown') {
    if (!(target instanceof Element)) return false;
    if (target.closest('input, textarea, select, button, [role="dialog"]')) {
      return true;
    }
    return Boolean(
      target.closest('.editor-input, .editor-shell, .main, .sidebar, .app-hints'),
    );
  }

  if (event.type === 'pointerdown' || event.type === 'touchstart') {
    return true;
  }

  return false;
}

export function isIdleElapsed(
  lastActivityMs: number,
  idleMs: number,
  nowMs: number = Date.now(),
): boolean {
  return nowMs - lastActivityMs >= idleMs;
}
