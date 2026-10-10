import type confetti from 'canvas-confetti';
import { getSettings } from '../settings/settingsStore';

const FALLBACK_COLORS = [
  '#39ff14',
  '#ff2bd6',
  '#00f0ff',
  '#ffb347',
  '#ffff00',
  '#ffffff',
  '#ff6ec7',
  '#7aa2ff',
  '#ff5533',
  '#c8ff33',
  '#ff80ff',
  '#40e0d0',
];

type ConfettiFn = typeof confetti;
type CreateTypes = confetti.CreateTypes;
type Options = confetti.Options;

let canvas: HTMLCanvasElement | null = null;
let fire: CreateTypes | null = null;
let confettiMod: ConfettiFn | null = null;

function ensureFire(mod: ConfettiFn): CreateTypes {
  if (fire && canvas?.isConnected) return fire;

  canvas = document.createElement('canvas');
  canvas.setAttribute('aria-hidden', 'true');
  canvas.style.cssText =
    'position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:2147483647';
  document.body.appendChild(canvas);
  fire = mod.create(canvas, { resize: true, useWorker: true });
  return fire;
}

function themeColors(): string[] {
  if (typeof document === 'undefined') return FALLBACK_COLORS;
  const style = getComputedStyle(document.documentElement);
  const read = (name: string) => style.getPropertyValue(name).trim();
  const fromTheme = [
    read('--accent'),
    read('--task'),
    read('--subtask'),
    read('--danger'),
    read('--ink'),
  ].filter((c) => c.length > 0);
  return [...fromTheme, ...FALLBACK_COLORS];
}

function burst(shoot: CreateTypes, opts: Options): void {
  void shoot(opts);
}

function randomBetween(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

function runShow(mod: ConfettiFn): void {
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)')
    .matches;
  const shoot = ensureFire(mod);
  const colors = themeColors();

  if (reduceMotion) {
    burst(shoot, {
      particleCount: 220,
      spread: 360,
      startVelocity: 40,
      ticks: 140,
      colors,
      origin: { x: 0.5, y: 0.45 },
      disableForReducedMotion: false,
    });
    return;
  }

  const base = {
    colors,
    disableForReducedMotion: false as const,
    ticks: 420,
    gravity: 0.7,
    scalar: 1.2,
  };

  // Opening wall of confetti
  for (let i = 0; i < 6; i++) {
    burst(shoot, {
      ...base,
      particleCount: 200,
      spread: 180,
      startVelocity: 80,
      origin: { x: 0.5, y: 0.55 },
    });
  }

  // Continuous random bombardment for ~2.5s
  const endAt = performance.now() + 2500;
  const pump = () => {
    if (performance.now() > endAt) return;

    burst(shoot, {
      ...base,
      particleCount: Math.round(randomBetween(90, 160)),
      spread: 360,
      startVelocity: randomBetween(45, 85),
      scalar: randomBetween(0.9, 1.4),
      origin: {
        x: randomBetween(0, 1),
        y: randomBetween(0, 1),
      },
    });

    // Side cannons every few ticks
    burst(shoot, {
      ...base,
      particleCount: 80,
      angle: randomBetween(45, 75),
      spread: 70,
      startVelocity: 90,
      origin: { x: 0, y: randomBetween(0.15, 0.85) },
    });
    burst(shoot, {
      ...base,
      particleCount: 80,
      angle: randomBetween(105, 135),
      spread: 70,
      startVelocity: 90,
      origin: { x: 1, y: randomBetween(0.15, 0.85) },
    });

    window.setTimeout(pump, 55);
  };
  pump();

  // Top rain strips
  for (let i = 0; i < 16; i++) {
    window.setTimeout(() => {
      burst(shoot, {
        ...base,
        particleCount: 140,
        angle: 270,
        spread: 200,
        startVelocity: 40,
        gravity: 1.15,
        origin: { x: (i + 0.5) / 16, y: 0 },
      });
    }, i * 40);
  }

  // Bottom upward blasts
  for (let i = 0; i < 12; i++) {
    window.setTimeout(() => {
      burst(shoot, {
        ...base,
        particleCount: 120,
        angle: 90,
        spread: 160,
        startVelocity: 70,
        origin: { x: (i + 0.5) / 12, y: 1 },
      });
    }, 200 + i * 45);
  }

  // Dense grid encore
  window.setTimeout(() => {
    for (let row = 0; row < 5; row++) {
      for (let col = 0; col < 6; col++) {
        window.setTimeout(() => {
          burst(shoot, {
            ...base,
            particleCount: 100,
            spread: 360,
            startVelocity: 55,
            origin: {
              x: (col + 0.5) / 6,
              y: (row + 0.5) / 5,
            },
          });
        }, row * 40 + col * 20);
      }
    }
  }, 900);

  // Final nuke
  window.setTimeout(() => {
    for (let i = 0; i < 8; i++) {
      burst(shoot, {
        ...base,
        particleCount: 220,
        spread: 360,
        startVelocity: 95,
        origin: { x: 0.5, y: 0.5 },
      });
    }
  }, 1600);
}

/** Full-screen confetti when every subtask under a task becomes done/archived. */
export function fireTaskCompleteConfetti(): void {
  if (typeof document === 'undefined') return;
  if (!getSettings().taskCompleteConfetti) return;

  if (confettiMod) {
    runShow(confettiMod);
    return;
  }

  void import('canvas-confetti').then((mod) => {
    confettiMod = mod.default;
    runShow(confettiMod);
  });
}
