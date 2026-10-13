/** Dispatched to run the screensaver immediately (Settings → Preview). */
export const SCREENSAVER_PREVIEW_EVENT = 'outline-screensaver-preview';

export function requestScreensaverPreview(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(SCREENSAVER_PREVIEW_EVENT));
}
