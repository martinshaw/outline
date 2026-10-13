/** Concrete dissolve modes (excludes `random`). */
export type ScreensaverEffectId =
  | 'diffuse'
  | 'melt'
  | 'ripple'
  | 'phosphor'
  | 'glitch'
  | 'plasma'
  | 'tunnel'
  | 'bloom'
  | 'kaleido'
  | 'liquid'
  | 'waveform'
  | 'pulse'
  | 'flame'
  | 'vizbars'
  | 'vizflower'
  | 'vizstars'
  | 'vizspiral'
  | 'vizgrid'
  | 'vizrings'
  | 'vizribbons'
  | 'vizorbit'
  | 'vizburst'
  | 'vizstripe'
  | 'vizblob'
  | 'vizhelix'
  | 'vizlattice'
  | 'vizripple'
  | 'vizdiamond'
  | 'vizflame'
  | 'vizswarm';

export type ScreensaverModeId = 'random' | ScreensaverEffectId;

export type ScreensaverIdleMs =
  | 10000
  | 30000
  | 45000
  | 60000
  | 90000
  | 180000
  | 300000;

export const SCREENSAVER_EFFECT_IDS: ScreensaverEffectId[] = [
  'diffuse',
  'melt',
  'ripple',
  'phosphor',
  'glitch',
  'plasma',
  'tunnel',
  'bloom',
  'kaleido',
  'liquid',
  'waveform',
  'pulse',
  'flame',
  'vizbars',
  'vizflower',
  'vizstars',
  'vizspiral',
  'vizgrid',
  'vizrings',
  'vizribbons',
  'vizorbit',
  'vizburst',
  'vizstripe',
  'vizblob',
  'vizhelix',
  'vizlattice',
  'vizripple',
  'vizdiamond',
  'vizflame',
  'vizswarm',
];

export const SCREENSAVER_MODE_OPTIONS: {
  id: ScreensaverModeId;
  label: string;
  description: string;
}[] = [
  {
    id: 'random',
    label: 'Random',
    description: 'Pick a new dissolve each time you go idle',
  },
  {
    id: 'kaleido',
    label: 'Kaleido',
    description: 'Mirrored slices of the note spinning like a kaleidoscope',
  },
  {
    id: 'diffuse',
    label: 'Ink bleed',
    description: 'Reaction-diffusion that eats the page',
  },
  {
    id: 'melt',
    label: 'Melt',
    description: 'Viscous drip warping downward',
  },
  {
    id: 'ripple',
    label: 'Ripple',
    description: 'Soft caustic waves through the ink',
  },
  {
    id: 'phosphor',
    label: 'Phosphor',
    description: 'CRT decay with drifting scanlines',
  },
  {
    id: 'glitch',
    label: 'Glitch',
    description: 'Slow pixel-sort and channel slip',
  },
  {
    id: 'plasma',
    label: 'Plasma',
    description: 'iTunes-style color wash with the note still readable',
  },
  {
    id: 'tunnel',
    label: 'Tunnel',
    description: 'Hyperspace tunnel that keeps warping the page itself',
  },
  {
    id: 'bloom',
    label: 'Bloom',
    description: 'Soft orbs lighting and trailing the captured note',
  },
  {
    id: 'liquid',
    label: 'Liquid',
    description: 'Heavy liquid warp of the page with subtle chroma trails',
  },
  {
    id: 'waveform',
    label: 'Waveform',
    description: 'Spectrum-bar waves that bend the note horizontally',
  },
  {
    id: 'pulse',
    label: 'Pulse',
    description: 'Heartbeat zoom pulses through the captured page',
  },
  {
    id: 'flame',
    label: 'Flame',
    description: 'Rising flames over the captured note',
  },
  {
    id: 'vizbars',
    label: 'Viz Bars',
    description: 'Pure classic spectrum bars — no note capture',
  },
  {
    id: 'vizflower',
    label: 'Viz Flower',
    description: 'Spinning psychedelic flower petals — no note capture',
  },
  {
    id: 'vizstars',
    label: 'Viz Stars',
    description: 'Warping starfield hyperspace — no note capture',
  },
  {
    id: 'vizspiral',
    label: 'Viz Spiral',
    description: 'Spinning galaxy arms — no note capture',
  },
  {
    id: 'vizgrid',
    label: 'Viz Grid',
    description: 'Warping neon wireframe grid — no note capture',
  },
  {
    id: 'vizrings',
    label: 'Viz Rings',
    description: 'Pulsing concentric neon rings — no note capture',
  },
  {
    id: 'vizribbons',
    label: 'Viz Ribbons',
    description: 'Flowing ribbon streams — no note capture',
  },
  {
    id: 'vizorbit',
    label: 'Viz Orbit',
    description: 'Orbiting glowing bodies — no note capture',
  },
  {
    id: 'vizburst',
    label: 'Viz Burst',
    description: 'Radial firework bursts — no note capture',
  },
  {
    id: 'vizstripe',
    label: 'Viz Stripe',
    description: 'Rotating candy-stripe field — no note capture',
  },
  {
    id: 'vizblob',
    label: 'Viz Blob',
    description: 'Merging neon metaballs — no note capture',
  },
  {
    id: 'vizhelix',
    label: 'Viz Helix',
    description: 'Twisting double helix — no note capture',
  },
  {
    id: 'vizlattice',
    label: 'Viz Lattice',
    description: 'Perspective 3D lattice fly-through — no note capture',
  },
  {
    id: 'vizripple',
    label: 'Viz Ripple',
    description: 'Interference ripples in neon — no note capture',
  },
  {
    id: 'vizdiamond',
    label: 'Viz Diamond',
    description: 'Spinning diamond checker warp — no note capture',
  },
  {
    id: 'vizflame',
    label: 'Viz Flame',
    description: 'Rising psychedelic flame tongues — no note capture',
  },
  {
    id: 'vizswarm',
    label: 'Viz Swarm',
    description: 'Chaotic particle swarm trails — no note capture',
  },
];

export const SCREENSAVER_IDLE_OPTIONS: {
  ms: ScreensaverIdleMs;
  label: string;
}[] = [
  { ms: 10000, label: '10 seconds' },
  { ms: 30000, label: '30 seconds' },
  { ms: 45000, label: '45 seconds' },
  { ms: 60000, label: '1 minute' },
  { ms: 90000, label: '90 seconds' },
  { ms: 180000, label: '3 minutes' },
  { ms: 300000, label: '5 minutes' },
];

export function isScreensaverModeId(v: unknown): v is ScreensaverModeId {
  return SCREENSAVER_MODE_OPTIONS.some((o) => o.id === v);
}

export function isScreensaverIdleMs(v: unknown): v is ScreensaverIdleMs {
  const n =
    typeof v === 'string' && v.trim() !== '' ? Number(v) : v;
  return (
    typeof n === 'number' &&
    Number.isFinite(n) &&
    SCREENSAVER_IDLE_OPTIONS.some((o) => o.ms === n)
  );
}

export function resolveScreensaverEffect(
  mode: ScreensaverModeId,
): ScreensaverEffectId {
  if (mode !== 'random') return mode;
  const i = Math.floor(Math.random() * SCREENSAVER_EFFECT_IDS.length);
  return SCREENSAVER_EFFECT_IDS[i] ?? 'diffuse';
}
