import { describe, expect, it, vi } from 'vitest';
import { requestScreensaverPreview, SCREENSAVER_PREVIEW_EVENT } from './preview';
import { normalizeSettings } from '../settings/settingsStore';
import {
  isScreensaverIdleMs,
  isScreensaverModeId,
  resolveScreensaverEffect,
  SCREENSAVER_EFFECT_IDS,
} from './types';

describe('screensaver preview', () => {
  it('dispatches a preview event', () => {
    const handler = vi.fn();
    window.addEventListener(SCREENSAVER_PREVIEW_EVENT, handler);
    requestScreensaverPreview();
    expect(handler).toHaveBeenCalledTimes(1);
    window.removeEventListener(SCREENSAVER_PREVIEW_EVENT, handler);
  });
});

describe('screensaver settings helpers', () => {
  it('accepts known mode and idle values', () => {
    expect(isScreensaverModeId('diffuse')).toBe(true);
    expect(isScreensaverModeId('plasma')).toBe(true);
    expect(isScreensaverModeId('tunnel')).toBe(true);
    expect(isScreensaverModeId('bloom')).toBe(true);
    expect(isScreensaverModeId('kaleido')).toBe(true);
    expect(isScreensaverModeId('liquid')).toBe(true);
    expect(isScreensaverModeId('waveform')).toBe(true);
    expect(isScreensaverModeId('pulse')).toBe(true);
    expect(isScreensaverModeId('vizbars')).toBe(true);
    expect(isScreensaverModeId('vizflower')).toBe(true);
    expect(isScreensaverModeId('vizstars')).toBe(true);
    expect(isScreensaverModeId('vizspiral')).toBe(true);
    expect(isScreensaverModeId('vizswarm')).toBe(true);
    expect(isScreensaverModeId('vizflame')).toBe(true);
    expect(isScreensaverModeId('random')).toBe(true);
    expect(isScreensaverModeId('nope')).toBe(false);
    expect(isScreensaverIdleMs(10000)).toBe(true);
    expect(isScreensaverIdleMs(45000)).toBe(true);
    expect(isScreensaverIdleMs(90000)).toBe(true);
    expect(isScreensaverIdleMs(123)).toBe(false);
    expect(isScreensaverIdleMs('10000')).toBe(true);
    expect(isScreensaverIdleMs('nope')).toBe(false);
  });

  it('resolveScreensaverEffect keeps concrete modes and picks from the set for random', () => {
    expect(resolveScreensaverEffect('melt')).toBe('melt');
    for (let i = 0; i < 20; i++) {
      expect(SCREENSAVER_EFFECT_IDS).toContain(resolveScreensaverEffect('random'));
    }
  });

  it('normalizeSettings clamps screensaver fields and keeps defaults for junk', () => {
    const ok = normalizeSettings({
      screensaverEnabled: false,
      screensaverMode: 'phosphor',
      screensaverIdleMs: 180000,
    });
    expect(ok.screensaverEnabled).toBe(false);
    expect(ok.screensaverMode).toBe('phosphor');
    expect(ok.screensaverIdleMs).toBe(180000);

    const junk = normalizeSettings({
      screensaverEnabled: 'yes' as unknown as boolean,
      screensaverMode: 'vhs' as 'random',
      screensaverIdleMs: 12 as 90000,
    });
    expect(junk.screensaverEnabled).toBe(true);
    expect(junk.screensaverMode).toBe('kaleido');
    expect(junk.screensaverIdleMs).toBe(90000);

    const fromJson = normalizeSettings({
      screensaverIdleMs: '10000' as unknown as 90000,
    });
    expect(fromJson.screensaverIdleMs).toBe(10000);
  });
});
