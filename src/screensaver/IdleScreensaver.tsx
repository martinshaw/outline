import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  getSettings,
  subscribeSettings,
} from '../settings/settingsStore';
import type { AppSettings } from '../settings/types';
import { captureForScreensaver, themeColorUniforms } from './capture';
import { isIdleElapsed, shouldResetScreensaverIdle } from './idleActivity';
import { SCREENSAVER_PREVIEW_EVENT } from './preview';
import { resolveScreensaverEffect } from './types';
import { ScreensaverGL } from './webgl';

type Props = {
  /** True when a modal/palette is open — pause idle arming. */
  blocked: boolean;
};

type PendingStart = {
  bitmap: ImageBitmap | HTMLCanvasElement;
  preview: boolean;
};

const IDLE_POLL_MS = 250;

function closeBitmap(bitmap: ImageBitmap | HTMLCanvasElement): void {
  if ('close' in bitmap && typeof bitmap.close === 'function') {
    bitmap.close();
  }
}

function clearStart(sessionRef: { current: PendingStart | null }): void {
  const pending = sessionRef.current;
  sessionRef.current = null;
  if (pending) closeBitmap(pending.bitmap);
}

function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

function captureTarget(): HTMLElement | null {
  return document.querySelector<HTMLElement>('.main');
}

function focusAfterDismiss(): void {
  const settingsClose = document.querySelector<HTMLElement>(
    '.settings-dialog .btn--icon[aria-label="Close"]',
  );
  if (settingsClose) {
    settingsClose.focus();
    return;
  }
  document.querySelector<HTMLElement>('.editor-input')?.focus();
}

function canRunIdle(
  s: AppSettings,
  blocked: boolean,
  preview: boolean,
): boolean {
  if (prefersReducedMotion()) return false;
  if (document.hidden) return false;
  if (!preview) {
    if (!s.screensaverEnabled) return false;
    if (blocked) return false;
  }
  return true;
}

function drawBitmap2d(
  canvas: HTMLCanvasElement,
  bitmap: ImageBitmap | HTMLCanvasElement,
): void {
  const w = 'width' in bitmap ? bitmap.width : canvas.clientWidth;
  const h = 'height' in bitmap ? bitmap.height : canvas.clientHeight;
  canvas.width = Math.max(1, w);
  canvas.height = Math.max(1, h);
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
}

/**
 * Idle WebGL dissolve of the editor.
 */
export function IdleScreensaver({ blocked }: Props) {
  const [active, setActive] = useState(false);
  const [fadeIn, setFadeIn] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const glRef = useRef<ScreensaverGL | null>(null);
  const rafRef = useRef(0);
  const pollRef = useRef(0);
  const activeRef = useRef(false);
  const previewRef = useRef(false);
  const activatingRef = useRef(false);
  /** Capture + preview flag for the current overlay (kept until dismiss for Strict Mode). */
  const startRef = useRef<PendingStart | null>(null);
  const [glEpoch, setGlEpoch] = useState(0);
  const lastActivityRef = useRef(Date.now());
  const blockedRef = useRef(blocked);
  const settingsRef = useRef<AppSettings>(getSettings());
  const staticFallbackRef = useRef(false);

  blockedRef.current = blocked;
  activeRef.current = active;

  const bumpActivity = () => {
    lastActivityRef.current = Date.now();
  };

  useEffect(() => {
    return subscribeSettings((next) => {
      settingsRef.current = next;
    });
  }, []);

  useEffect(() => {
    const stopRuntime = () => {
      staticFallbackRef.current = false;
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = 0;
      }
      glRef.current?.dispose();
      glRef.current = null;
    };

    const dismiss = () => {
      if (!activeRef.current) return;
      const wasPreview = previewRef.current;
      previewRef.current = false;
      clearStart(startRef);
      setFadeIn(false);
      setActive(false);
      activeRef.current = false;
      stopRuntime();
      bumpActivity();
      window.requestAnimationFrame(() => {
        if (wasPreview) focusAfterDismiss();
        else document.querySelector<HTMLElement>('.editor-input')?.focus();
      });
    };

    const failStart = () => {
      previewRef.current = false;
      clearStart(startRef);
      setFadeIn(false);
      setActive(false);
      activeRef.current = false;
      stopRuntime();
      bumpActivity();
    };

    const activate = async (preview: boolean) => {
      if (activatingRef.current || activeRef.current) return;
      const s = settingsRef.current;
      if (!canRunIdle(s, blockedRef.current, preview)) return;

      activatingRef.current = true;
      previewRef.current = preview;
      staticFallbackRef.current = false;

      try {
        const target = captureTarget();
        const rect = target?.getBoundingClientRect();
        const bitmap = await captureForScreensaver(
          target,
          rect?.width ?? window.innerWidth,
          rect?.height ?? window.innerHeight,
        );

        if (!canRunIdle(settingsRef.current, blockedRef.current, preview)) {
          closeBitmap(bitmap);
          return;
        }

        startRef.current = { bitmap, preview };
        setActive(true);
        activeRef.current = true;
        setFadeIn(true);
        setGlEpoch((n) => n + 1);
      } catch {
        failStart();
      } finally {
        activatingRef.current = false;
      }
    };

    const pollIdle = () => {
      if (activatingRef.current || activeRef.current) return;
      const s = settingsRef.current;
      if (!canRunIdle(s, blockedRef.current, false)) return;
      if (isIdleElapsed(lastActivityRef.current, s.screensaverIdleMs)) {
        void activate(false);
      }
    };

    const onPreview = () => {
      bumpActivity();
      void activate(true);
    };

    const onActivity = (event: Event) => {
      if (activeRef.current) {
        if (event.type === 'pointerdown' || event.type === 'touchstart') {
          event.preventDefault();
          event.stopPropagation();
        }
        dismiss();
        return;
      }
      if (!shouldResetScreensaverIdle(event)) return;
      bumpActivity();
    };

    const onPointerMoveWhileActive = () => {
      if (!activeRef.current) return;
      dismiss();
    };

    const onWheelWhileActive = (event: Event) => {
      if (!activeRef.current) return;
      event.preventDefault();
      dismiss();
    };

    const onVisibility = () => {
      bumpActivity();
      if (document.hidden && activeRef.current) dismiss();
    };

    const opts: AddEventListenerOptions = { capture: true, passive: false };
    const passiveOpts: AddEventListenerOptions = {
      capture: true,
      passive: true,
    };

    window.addEventListener('keydown', onActivity, passiveOpts);
    window.addEventListener('pointerdown', onActivity, opts);
    window.addEventListener('touchstart', onActivity, opts);
    window.addEventListener('pointermove', onPointerMoveWhileActive, passiveOpts);
    window.addEventListener('mousemove', onPointerMoveWhileActive, passiveOpts);
    window.addEventListener('wheel', onWheelWhileActive, opts);
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener(SCREENSAVER_PREVIEW_EVENT, onPreview);

    pollRef.current = window.setInterval(pollIdle, IDLE_POLL_MS);

    return () => {
      window.clearInterval(pollRef.current);
      stopRuntime();
      window.removeEventListener('keydown', onActivity, true);
      window.removeEventListener('pointerdown', onActivity, true);
      window.removeEventListener('touchstart', onActivity, true);
      window.removeEventListener('pointermove', onPointerMoveWhileActive, true);
      window.removeEventListener('mousemove', onPointerMoveWhileActive, true);
      window.removeEventListener('wheel', onWheelWhileActive, true);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener(SCREENSAVER_PREVIEW_EVENT, onPreview);
    };
  }, []);

  useLayoutEffect(() => {
    if (!active) return;

    let cancelled = false;
    let attempts = 0;

    const stopLocal = () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = 0;
      }
      glRef.current?.dispose();
      glRef.current = null;
    };

    const failStart = () => {
      previewRef.current = false;
      clearStart(startRef);
      setFadeIn(false);
      setActive(false);
      activeRef.current = false;
      stopLocal();
      staticFallbackRef.current = false;
      bumpActivity();
    };

    const tryStart = () => {
      if (cancelled) return;
      const pending = startRef.current;
      const canvas = canvasRef.current;
      if (!pending || !canvas) {
        attempts += 1;
        if (attempts > 240) {
          failStart();
          return;
        }
        requestAnimationFrame(tryStart);
        return;
      }

      const s = settingsRef.current;
      const { bitmap } = pending;

      try {
        const mode = resolveScreensaverEffect(s.screensaverMode);
        const theme = themeColorUniforms();
        const runtime = new ScreensaverGL(canvas, mode, theme);
        runtime.uploadSource(bitmap);
        glRef.current = runtime;
        staticFallbackRef.current = false;

        const tick = (now: number) => {
          if (cancelled || !glRef.current) return;
          glRef.current.frame(now);
          rafRef.current = requestAnimationFrame(tick);
        };
        rafRef.current = requestAnimationFrame(tick);
        setFadeIn(true);
      } catch {
        try {
          drawBitmap2d(canvas, bitmap);
          staticFallbackRef.current = true;
          setFadeIn(true);
        } catch {
          failStart();
        }
      }
    };

    tryStart();
    return () => {
      cancelled = true;
      stopLocal();
    };
  }, [active, glEpoch]);

  useEffect(() => {
    if (blocked && !previewRef.current && active) {
      clearStart(startRef);
      setFadeIn(false);
      setActive(false);
      activeRef.current = false;
      staticFallbackRef.current = false;
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = 0;
      }
      glRef.current?.dispose();
      glRef.current = null;
      bumpActivity();
    }
  }, [blocked, active]);

  if (!active) return null;

  return createPortal(
    <div
      className={
        fadeIn
          ? 'screensaver-overlay screensaver-overlay--in'
          : 'screensaver-overlay'
      }
      aria-hidden="true"
    >
      <canvas
        key={glEpoch}
        ref={canvasRef}
        className="screensaver-overlay__canvas"
      />
    </div>,
    document.body,
  );
}
