import type { ScreensaverEffectId } from './types';

export const VERT_SRC = `#version 300 es
in vec2 aPos;
out vec2 vUv;
void main() {
  vUv = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}
`;

const COMMON = `
precision highp float;
in vec2 vUv;
uniform sampler2D uSource;
uniform sampler2D uPrev;
uniform float uTime;
uniform float uDt;
uniform vec2 uResolution;
uniform vec3 uPaper;
uniform vec3 uInk;
out vec4 fragColor;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  float a = hash(i);
  float b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0));
  float d = hash(i + vec2(1.0, 1.0));
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(a, b, u.x) + (c - a) * u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
}

vec3 sampleSource(vec2 uv) {
  uv = clamp(uv, 0.001, 0.999);
  return texture(uSource, uv).rgb;
}

vec3 samplePrev(vec2 uv) {
  uv = clamp(uv, 0.001, 0.999);
  return texture(uPrev, uv).rgb;
}

vec3 hsv2rgb(vec3 c) {
  vec3 p = abs(fract(c.xxx + vec3(0.0, 2.0 / 3.0, 1.0 / 3.0)) * 6.0 - 3.0);
  return c.z * mix(vec3(1.0), clamp(p - 1.0, 0.0, 1.0), c.y);
}

float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 4; i++) {
    v += a * noise(p);
    p = p * 2.03 + vec2(17.1, 9.3);
    a *= 0.5;
  }
  return v;
}
`;

const FRAG_DIFFUSE = `#version 300 es
${COMMON}
void main() {
  vec2 px = 1.0 / uResolution;
  vec3 c = samplePrev(vUv);
  vec3 n = samplePrev(vUv + vec2(0.0, px.y));
  vec3 s = samplePrev(vUv - vec2(0.0, px.y));
  vec3 e = samplePrev(vUv + vec2(px.x, 0.0));
  vec3 w = samplePrev(vUv - vec2(px.x, 0.0));
  vec3 lap = n + s + e + w - 4.0 * c;
  float feed = 0.035 + 0.02 * noise(vUv * 3.0 + uTime * 0.05);
  float kill = 0.06 + 0.01 * noise(vUv * 5.0 - uTime * 0.03);
  vec3 src = sampleSource(vUv);
  float inkAmt = clamp(length(src - uPaper) * 1.8, 0.0, 1.0);
  vec3 chem = c + lap * 0.22 + (src - c) * feed * inkAmt - (c - uPaper) * kill;
  float breathe = 0.5 + 0.5 * sin(uTime * 0.35 + vUv.x * 6.0);
  chem = mix(chem, uPaper, 0.004 + 0.01 * breathe * (1.0 - inkAmt));
  fragColor = vec4(clamp(chem, 0.0, 1.0), 1.0);
}
`;

const FRAG_MELT = `#version 300 es
${COMMON}
void main() {
  float t = uTime;
  float drip = noise(vec2(vUv.x * 8.0, t * 0.15)) * 0.04
    + noise(vec2(vUv.x * 22.0, t * 0.4)) * 0.015;
  float pull = pow(max(0.0, vUv.y), 1.4) * (0.02 + drip);
  vec2 uv = vUv + vec2(
    (noise(vUv * 6.0 + t * 0.2) - 0.5) * 0.01,
    pull + uDt * (0.015 + drip * 2.0)
  );
  vec3 src = sampleSource(uv);
  vec3 prev = samplePrev(vUv + vec2(0.0, uDt * 0.02));
  float smear = smoothstep(0.0, 0.6, vUv.y);
  vec3 col = mix(src, prev, 0.55 * smear);
  col = mix(col, uPaper, 0.008 * smear);
  fragColor = vec4(col, 1.0);
}
`;

const FRAG_RIPPLE = `#version 300 es
${COMMON}
void main() {
  float t = uTime;
  vec2 p = vUv - 0.5;
  float r = length(p);
  float wave = sin(r * 28.0 - t * 2.2) * 0.012
    + sin(r * 54.0 - t * 3.5 + 1.7) * 0.005;
  float ang = atan(p.y, p.x) + wave * 4.0;
  vec2 dir = vec2(cos(ang), sin(ang));
  vec2 uv = vUv + dir * wave + vec2(
    noise(vUv * 4.0 + t * 0.1) - 0.5,
    noise(vUv * 4.0 - t * 0.12) - 0.5
  ) * 0.004;
  vec3 src = sampleSource(uv);
  vec3 prev = samplePrev(vUv);
  float caustic = 0.5 + 0.5 * sin(r * 40.0 - t * 2.5);
  vec3 col = mix(src, prev, 0.25);
  col += (uInk - uPaper) * caustic * 0.04 * (1.0 - smoothstep(0.0, 0.7, r));
  fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
`;

const FRAG_PHOSPHOR = `#version 300 es
${COMMON}
void main() {
  float t = uTime;
  float scan = sin((vUv.y + t * 0.08) * uResolution.y * 0.7) * 0.04;
  float drift = sin(t * 0.7 + vUv.y * 10.0) * 0.003;
  vec2 uv = vUv + vec2(drift + scan * 0.2, 0.0);
  vec3 src = sampleSource(uv);
  vec3 prev = samplePrev(vUv);
  // Phosphor persistence
  vec3 col = max(src, prev * (0.92 - 0.04 * noise(vUv * 20.0 + t)));
  float mask = 0.92 + 0.08 * sin(vUv.x * uResolution.x * 3.14159);
  col *= mask;
  float vignette = smoothstep(1.2, 0.35, length(vUv - 0.5));
  col = mix(uPaper * 0.15 + uInk * 0.05, col, vignette);
  // Slow burn toward paper in bright areas
  float bright = dot(col, vec3(0.299, 0.587, 0.114));
  col = mix(col, uPaper, 0.006 * bright);
  fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
`;

const FRAG_GLITCH = `#version 300 es
${COMMON}
void main() {
  float t = uTime;
  float band = floor(vUv.y * 48.0);
  float rowHash = hash(vec2(band, floor(t * 2.0)));
  float slice = step(0.82, rowHash);
  float shift = (rowHash - 0.5) * 0.08 * slice;
  float sort = noise(vec2(band * 0.3, t * 0.25));
  vec2 uvR = vUv + vec2(shift + sort * 0.02, 0.0);
  vec2 uvG = vUv + vec2(shift * 0.6, (noise(vec2(t, band)) - 0.5) * 0.004);
  vec2 uvB = vUv + vec2(shift * 1.3, 0.0);
  float r = sampleSource(uvR).r;
  float g = sampleSource(uvG).g;
  float b = sampleSource(uvB).b;
  vec3 src = vec3(r, g, b);
  vec3 prev = samplePrev(vUv + vec2(shift * 0.2, 0.0));
  vec3 col = mix(src, prev, 0.35 + 0.4 * slice);
  // Occasional block tear
  float block = step(0.97, hash(vec2(floor(vUv * 12.0) + floor(t))));
  col = mix(col, sampleSource(fract(vUv + vec2(0.1, -0.05))), block * 0.7);
  fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
`;

/** Classic iTunes plasma — page stays primary; neon is a tint. */
const FRAG_PLASMA = `#version 300 es
${COMMON}
void main() {
  float t = uTime;
  vec2 p = vUv - 0.5;
  float r = length(p);
  float a = atan(p.y, p.x);

  vec2 flow = vec2(
    sin(p.y * 8.0 + t * 1.4) + cos(p.x * 6.0 - t * 0.9),
    cos(p.x * 7.0 - t * 1.2) + sin(p.y * 5.0 + t * 1.1)
  ) * 0.01;
  flow += vec2(
    fbm(vUv * 3.0 + t * 0.15) - 0.5,
    fbm(vUv * 3.0 - t * 0.12 + 4.0) - 0.5
  ) * 0.028;
  flow += normalize(p + 1e-4) * sin(r * 18.0 - t * 2.8) * 0.008;

  vec3 src = sampleSource(vUv + flow);
  vec3 prev = samplePrev(vUv + flow * 0.85);
  // Page-first composite
  vec3 page = mix(src, prev, 0.35);

  float field = sin(p.x * 10.0 + t * 1.6)
    + sin(p.y * 12.0 - t * 1.3)
    + sin((p.x + p.y) * 8.0 + t * 2.1)
    + sin(r * 22.0 - t * 3.0 + a * 3.0);
  field = field * 0.25 + 0.5;
  vec3 neon = hsv2rgb(vec3(fract(field * 0.55 + t * 0.08), 0.7, 1.0));
  float wash = 0.12 + 0.1 * sin(t * 2.0 + r * 10.0);

  vec3 col = mix(page, page * neon * 1.15, wash);
  col = mix(col, src, 0.25);
  fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
`;

/** Hyperspace tunnel that samples the note into the tube. */
const FRAG_TUNNEL = `#version 300 es
${COMMON}
void main() {
  float t = uTime;
  vec2 p = (vUv - 0.5) * vec2(uResolution.x / max(uResolution.y, 1.0), 1.0);
  float r = length(p);
  float a = atan(p.y, p.x);

  float spin = t * 1.1;
  float rad = 0.32 / max(r, 0.05) + t * 1.5;
  float ang = a + spin + sin(rad * 2.0) * 0.2;

  // Unwrap page into tunnel coordinates, then re-project
  vec2 pageUv = vec2(fract(ang / 6.28318), fract(1.0 - rad * 0.08));
  pageUv = mix(pageUv, vUv, 0.35);
  pageUv += (noise(vec2(ang, rad) + t) - 0.5) * 0.02;

  vec3 src = sampleSource(pageUv);
  vec3 prev = samplePrev(pageUv + p * 0.015);
  vec3 page = mix(src, prev, 0.4);

  float rings = abs(sin(rad * 6.28318 * 2.0));
  float spokes = abs(sin(ang * 6.0));
  vec3 neon = hsv2rgb(vec3(fract(rad * 0.12 + t * 0.08), 0.75, 1.0));
  float accent = 0.12 + 0.18 * rings * spokes;

  vec3 col = mix(page, page * neon * 1.2, accent);
  col = mix(col, src, 0.2);
  float vig = smoothstep(1.05, 0.2, r);
  col = mix(uPaper * 0.15, col, 0.45 + 0.55 * vig);
  fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
`;

/** Soft orbs light the captured note instead of replacing it. */
const FRAG_BLOOM = `#version 300 es
${COMMON}
void main() {
  float t = uTime;
  vec2 p = vUv - 0.5;

  vec2 flow = vec2(
    sin(t * 0.8 + vUv.y * 4.0),
    cos(t * 0.7 + vUv.x * 3.5)
  ) * 0.006;
  flow += (vec2(fbm(vUv * 2.0 + t * 0.1), fbm(vUv * 2.0 - t * 0.1)) - 0.5) * 0.015;

  vec3 src = sampleSource(vUv + flow * 0.5);
  vec3 prev = samplePrev(vUv + flow);
  vec3 page = mix(src, prev, 0.3);

  float mask = 0.0;
  vec3 glow = vec3(0.0);
  for (int i = 0; i < 5; i++) {
    float fi = float(i);
    vec2 c = vec2(
      sin(t * (0.6 + fi * 0.17) + fi * 1.7),
      cos(t * (0.5 + fi * 0.13) + fi * 2.3)
    ) * 0.35;
    float d = length(p - c);
    float soft = exp(-d * d * (16.0 + fi * 3.5));
    mask += soft;
    glow += hsv2rgb(vec3(fract(fi * 0.17 + t * 0.05), 0.65, 1.0)) * soft;
  }
  float ring = abs(length(p) - (0.22 + 0.12 * sin(t * 1.2)));
  float ringM = exp(-ring * ring * 70.0);
  mask += ringM * 0.8;
  glow += hsv2rgb(vec3(fract(t * 0.07 + 0.3), 0.7, 1.0)) * ringM;

  vec3 lit = page + page * glow * 0.55;
  vec3 col = mix(page, lit, clamp(mask * 0.85, 0.0, 0.75));
  col = mix(col, src, 0.22);
  fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
`;

/** Kaleidoscope mirrors of the note. */
const FRAG_KALEIDO = `#version 300 es
${COMMON}
void main() {
  float t = uTime;
  float aspect = uResolution.x / max(uResolution.y, 1.0);
  vec2 p = (vUv - 0.5) * vec2(aspect, 1.0);
  float r = length(p);
  float a = atan(p.y, p.x);

  // Fold into a wedge, then rotate the master wedge so it keeps
  // sweeping across real note content (not just empty margins).
  float segments = 8.0;
  float seg = 6.2831853 / segments;
  float fa = mod(a, seg);
  fa = abs(fa - seg * 0.5);
  float base = t * 0.22;
  float sampleR = min(r, 0.72);
  vec2 folded = vec2(cos(fa + base), sin(fa + base)) * sampleR;
  // Undo aspect for texture lookup
  folded.x /= aspect;
  vec2 uv = clamp(folded + 0.5, 0.001, 0.999);
  uv += vec2(
    sin(r * 10.0 - t * 1.8),
    cos(r * 8.0 + t * 1.4)
  ) * 0.008;

  // Cartesian mirror backup so the frame always has page ink
  vec2 mirror = abs(vUv - 0.5);
  mirror = 0.5 + (mirror - 0.5) * (0.85 + 0.05 * sin(t));
  // Spin the mirror softly
  float ms = sin(t * 0.4) * 0.15;
  float mc = cos(t * 0.4);
  vec2 mp = mirror - 0.5;
  mirror = 0.5 + vec2(mc * mp.x - ms * mp.y, ms * mp.x + mc * mp.y);

  vec3 src = sampleSource(uv);
  vec3 srcMirror = sampleSource(clamp(mirror, 0.001, 0.999));
  vec3 prev = samplePrev(uv);
  vec3 page = mix(mix(src, srcMirror, 0.35), prev, 0.22);

  float spark = 0.5 + 0.5 * sin(r * 24.0 - t * 3.5 + fa * 10.0);
  vec3 tint = hsv2rgb(vec3(fract(fa / seg + t * 0.05), 0.4, 1.0));
  vec3 col = mix(page, page * tint * 1.08, 0.16 * spark);
  // Keep the live note readable in the kaleidoscope
  col = mix(col, src, 0.25);
  col = mix(col, sampleSource(vUv), 0.12);
  fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
`;

/** Heavy liquid warp — page is the texture being liquified. */
const FRAG_LIQUID = `#version 300 es
${COMMON}
void main() {
  float t = uTime;
  vec2 p = vUv - 0.5;

  vec2 flow = vec2(0.0);
  flow += vec2(sin(vUv.y * 14.0 + t * 1.8), cos(vUv.x * 12.0 - t * 1.5)) * 0.02;
  flow += vec2(fbm(vUv * 4.0 + t * 0.25) - 0.5, fbm(vUv * 4.0 - t * 0.2) - 0.5) * 0.05;
  flow += normalize(p + 1e-4) * sin(length(p) * 20.0 - t * 3.2) * 0.015;
  // Curl-ish secondary pass
  flow += vec2(
    fbm(vUv.yx * 5.0 - t * 0.3) - 0.5,
    -(fbm(vUv * 5.0 + t * 0.28) - 0.5)
  ) * 0.025;

  float ch = 0.004;
  vec3 src = vec3(
    sampleSource(vUv + flow + vec2(ch, 0.0)).r,
    sampleSource(vUv + flow).g,
    sampleSource(vUv + flow - vec2(ch, 0.0)).b
  );
  vec3 prev = samplePrev(vUv + flow * 1.1);
  vec3 page = mix(src, prev, 0.4);

  float foam = fbm(vUv * 8.0 + t * 0.4);
  vec3 tint = hsv2rgb(vec3(fract(foam * 0.4 + t * 0.04), 0.35, 1.0));
  vec3 col = mix(page, page * tint, 0.15);
  col = mix(col, src, 0.28);
  fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
`;

/** Spectrum-style horizontal waveforms bending the note. */
const FRAG_WAVEFORM = `#version 300 es
${COMMON}
void main() {
  float t = uTime;
  float band = floor(vUv.y * 24.0);
  float h = hash(vec2(band, floor(t * 2.0)));
  float amp = (0.02 + 0.04 * h) * (0.55 + 0.45 * sin(t * 3.0 + band * 0.4));
  float wave = sin(vUv.x * 28.0 - t * 5.0 + band * 0.7) * amp;
  wave += sin(vUv.x * 8.0 + t * 2.2 + band) * amp * 0.45;

  vec2 uv = vUv + vec2(wave, wave * 0.15);
  // Soft vertical smear between bands
  uv.y += sin(vUv.x * 6.0 + t * 1.5) * 0.004;

  vec3 src = sampleSource(uv);
  vec3 prev = samplePrev(uv + vec2(wave * 0.5, 0.0));
  vec3 page = mix(src, prev, 0.32);

  float bar = smoothstep(0.02, 0.0, abs(fract(vUv.y * 24.0) - 0.5));
  vec3 tint = hsv2rgb(vec3(fract(band * 0.07 + t * 0.06), 0.55, 1.0));
  vec3 col = mix(page, page * tint * 1.08, 0.14 + 0.2 * bar * abs(wave) * 20.0);
  col = mix(col, src, 0.3);
  fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
`;

/** Heartbeat radial pulses through the page. */
const FRAG_PULSE = `#version 300 es
${COMMON}
void main() {
  float t = uTime;
  vec2 p = vUv - 0.5;
  float r = length(p);
  float beat = 0.5 + 0.5 * sin(t * 4.2);
  beat = pow(beat, 2.2);

  float zoom = 1.0 - beat * 0.08 - 0.02 * sin(t * 1.3);
  vec2 uv = 0.5 + p / zoom;
  uv += normalize(p + 1e-4) * sin(r * 26.0 - t * 6.0) * 0.01 * beat;

  vec3 src = sampleSource(uv);
  vec3 prev = samplePrev(0.5 + p * (1.0 - beat * 0.04));
  vec3 page = mix(src, prev, 0.25 + 0.2 * beat);

  float ring = abs(r - (0.15 + 0.35 * fract(t * 0.65)));
  float ringM = exp(-ring * ring * 90.0) * beat;
  vec3 tint = hsv2rgb(vec3(fract(t * 0.08), 0.5, 1.0));

  vec3 col = mix(page, page * tint * 1.15, 0.12 + 0.35 * ringM);
  col = mix(col, src, 0.28);
  fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
`;

/**
 * Pure iTunes-style spectrum bars. Ignores editor capture;
 * uses feedback only for motion blur trails of the synth image.
 */
const FRAG_VIZBARS = `#version 300 es
${COMMON}
void main() {
  float t = uTime;
  vec2 uv = vUv;
  float bars = 32.0;
  float bx = floor(uv.x * bars);
  float h = hash(vec2(bx, floor(t * 8.0)));
  float h2 = hash(vec2(bx * 1.7, floor(t * 3.0)));
  float height = 0.12 + 0.75 * pow(0.5 + 0.5 * sin(t * (2.5 + h2 * 4.0) + bx * 0.55), 1.4);
  height *= 0.55 + 0.45 * h;
  float bar = step(1.0 - height, uv.y);
  // Peak cap sparkle
  float tip = smoothstep(0.02, 0.0, abs(uv.y - (1.0 - height)));
  vec3 neon = hsv2rgb(vec3(fract(bx / bars + t * 0.07), 0.9, 1.0));
  vec3 bg = hsv2rgb(vec3(fract(t * 0.03 + uv.y * 0.2), 0.55, 0.12));
  vec3 synth = mix(bg, neon, bar);
  synth += neon * tip * 1.4;
  // Mirror reflection on the "floor"
  float mirrorY = 1.0 - height - (uv.y - (1.0 - height)) * 0.35;
  float mBar = step(uv.y, 1.0 - height) * smoothstep(0.0, 0.45, uv.y);
  synth = mix(synth, neon * 0.35 * mBar, step(uv.y, 1.0 - height) * 0.5);

  vec2 trailUv = uv + vec2(0.0, -0.012);
  vec3 trail = samplePrev(trailUv);
  // Drop any leftover page seed quickly
  vec3 col = mix(synth, trail * vec3(0.85, 0.9, 1.05), 0.35);
  fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
`;

/** Pure spinning psychedelic flower / radial petals. */
const FRAG_VIZFLOWER = `#version 300 es
${COMMON}
void main() {
  float t = uTime;
  vec2 p = (vUv - 0.5) * vec2(uResolution.x / max(uResolution.y, 1.0), 1.0);
  float r = length(p);
  float a = atan(p.y, p.x);

  float petals = 7.0 + 2.0 * sin(t * 0.4);
  float petal = abs(sin(a * petals * 0.5 + t * 1.2));
  float bloom = smoothstep(0.55, 0.05, r / (0.25 + 0.45 * petal));
  float core = exp(-r * r * 40.0);
  float ring = exp(-pow(r - (0.35 + 0.1 * sin(t * 2.0)), 2.0) * 80.0);

  // Nested spinning layer
  float a2 = a - t * 0.8;
  float petal2 = abs(sin(a2 * 5.0 - t));
  float bloom2 = smoothstep(0.4, 0.0, r / (0.15 + 0.3 * petal2));

  vec3 c1 = hsv2rgb(vec3(fract(a / 6.28318 + t * 0.05), 0.85, 1.0));
  vec3 c2 = hsv2rgb(vec3(fract(r * 2.0 - t * 0.08), 0.7, 1.0));
  vec3 c3 = hsv2rgb(vec3(fract(t * 0.1 + 0.4), 0.6, 1.0));

  vec3 synth = c1 * bloom + c2 * bloom2 * 0.85 + c3 * ring * 0.9 + vec3(1.0) * core;
  synth += c1 * pow(petal, 4.0) * exp(-r * 3.0) * 0.4;

  // Feedback swirl of the synth itself
  float sa = a + 0.04;
  vec2 suv = 0.5 + vec2(cos(sa), sin(sa)) * r * 0.98;
  vec3 trail = samplePrev(suv);
  vec3 col = mix(synth, trail * 0.92 + synth * 0.4, 0.45);
  fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
`;

/** Pure warping starfield / hyperspace. */
const FRAG_VIZSTARS = `#version 300 es
${COMMON}
void main() {
  float t = uTime;
  vec2 p = (vUv - 0.5) * vec2(uResolution.x / max(uResolution.y, 1.0), 1.0);
  float r = length(p);
  float a = atan(p.y, p.x);

  // Zoom / warp tunnel in UV
  float z = fract(1.2 / max(r, 0.02) + t * 0.55);
  vec2 dir = normalize(p + 1e-4);
  vec2 suv = 0.5 + dir * (0.2 + z * 0.55);

  // Star field from hash cells
  vec2 cell = floor(suv * 40.0);
  float star = step(0.97, hash(cell + floor(t * 2.0)));
  float twinkle = hash(cell + 9.1);
  vec3 starCol = hsv2rgb(vec3(fract(twinkle + t * 0.02), 0.4, 1.0));

  // Streaks along radius
  float streak = pow(max(0.0, 1.0 - abs(fract(a * 3.183 + t) - 0.5) * 2.0), 8.0);
  streak *= smoothstep(0.05, 0.4, r) * (0.4 + 0.6 * z);

  vec3 neon = hsv2rgb(vec3(fract(z * 0.5 + t * 0.04), 0.8, 1.0));
  vec3 synth = neon * 0.08;
  synth += starCol * star * (1.2 + twinkle);
  synth += neon * streak * 1.5;
  // Soft nebula
  synth += hsv2rgb(vec3(fract(a / 6.28318 + t * 0.03), 0.7, 0.35))
    * (0.15 + 0.25 * fbm(p * 3.0 + t * 0.1));

  vec2 trailUv = 0.5 + dir * (r * 0.97);
  vec3 trail = samplePrev(trailUv);
  vec3 col = mix(synth, trail * vec3(0.9, 0.88, 1.05) + synth, 0.5);
  fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
`;

const FRAG_VIZSPIRAL = `#version 300 es
${COMMON}
void main() {
  float t = uTime;
  vec2 p = (vUv - 0.5) * vec2(uResolution.x / max(uResolution.y, 1.0), 1.0);
  float r = length(p);
  float a = atan(p.y, p.x);
  float arms = 4.0;
  float spiral = fract((a / 6.28318) * arms + log(max(r, 0.001)) * 1.8 - t * 0.35);
  float band = smoothstep(0.18, 0.0, abs(spiral - 0.5));
  float core = exp(-r * r * 28.0);
  vec3 neon = hsv2rgb(vec3(fract(a / 6.28318 + t * 0.04), 0.85, 1.0));
  vec3 synth = neon * band * (0.5 + 0.5 / (r * 4.0 + 0.2));
  synth += hsv2rgb(vec3(fract(t * 0.06), 0.5, 1.0)) * core;
  synth += neon * 0.08 * fbm(p * 5.0 + t * 0.2);
  vec2 suv = 0.5 + vec2(cos(a + 0.03), sin(a + 0.03)) * r * 0.98;
  vec3 trail = samplePrev(suv);
  fragColor = vec4(clamp(mix(synth, trail * 0.9 + synth * 0.45, 0.5), 0.0, 1.0), 1.0);
}
`;

const FRAG_VIZGRID = `#version 300 es
${COMMON}
void main() {
  float t = uTime;
  vec2 p = vUv - 0.5;
  float z = 0.35 + 0.25 * sin(t * 0.7);
  vec2 q = p / z;
  q.y += t * 0.25;
  q.x += sin(q.y * 3.0 + t) * 0.08;
  vec2 g = abs(fract(q * 8.0) - 0.5);
  float line = 1.0 - smoothstep(0.0, 0.04, min(g.x, g.y));
  float horizon = smoothstep(0.55, 0.05, abs(p.y + 0.15));
  vec3 neon = hsv2rgb(vec3(fract(q.y * 0.1 + t * 0.05), 0.9, 1.0));
  vec3 synth = neon * line * horizon;
  synth += neon * 0.06;
  vec3 trail = samplePrev(vUv + vec2(0.0, -0.01));
  fragColor = vec4(clamp(mix(synth, trail * 0.88 + synth, 0.4), 0.0, 1.0), 1.0);
}
`;

const FRAG_VIZRINGS = `#version 300 es
${COMMON}
void main() {
  float t = uTime;
  vec2 p = (vUv - 0.5) * vec2(uResolution.x / max(uResolution.y, 1.0), 1.0);
  float r = length(p);
  float rings = 0.0;
  for (int i = 0; i < 6; i++) {
    float fi = float(i);
    float rad = fract(t * (0.15 + fi * 0.03) + fi * 0.17);
    rings += exp(-pow(r - rad * 0.85, 2.0) * 120.0);
  }
  float spin = abs(sin(atan(p.y, p.x) * 8.0 + t * 2.0));
  vec3 neon = hsv2rgb(vec3(fract(r * 1.5 - t * 0.08), 0.85, 1.0));
  vec3 synth = neon * rings * (0.7 + 0.3 * spin);
  synth += neon * 0.05;
  vec3 trail = samplePrev(0.5 + (vUv - 0.5) * 0.98);
  fragColor = vec4(clamp(mix(synth, trail * 0.9 + synth * 0.5, 0.45), 0.0, 1.0), 1.0);
}
`;

const FRAG_VIZRIBBONS = `#version 300 es
${COMMON}
void main() {
  float t = uTime;
  vec2 uv = vUv;
  vec3 synth = vec3(0.04, 0.02, 0.08);
  for (int i = 0; i < 5; i++) {
    float fi = float(i);
    float y = 0.5 + 0.28 * sin(uv.x * (3.0 + fi) + t * (1.0 + fi * 0.25) + fi);
    float d = abs(uv.y - y);
    float ribbon = exp(-d * d * (900.0 + fi * 120.0));
    vec3 c = hsv2rgb(vec3(fract(fi * 0.13 + t * 0.04 + uv.x * 0.1), 0.8, 1.0));
    synth += c * ribbon;
  }
  vec3 trail = samplePrev(uv + vec2(-0.008, 0.0));
  fragColor = vec4(clamp(mix(synth, trail * 0.9 + synth * 0.4, 0.45), 0.0, 1.0), 1.0);
}
`;

const FRAG_VIZORBIT = `#version 300 es
${COMMON}
void main() {
  float t = uTime;
  vec2 p = vUv - 0.5;
  vec3 synth = vec3(0.03, 0.02, 0.06);
  for (int i = 0; i < 8; i++) {
    float fi = float(i);
    float ang = t * (0.6 + fi * 0.11) + fi * 0.9;
    float rad = 0.12 + 0.08 * sin(fi + t * 0.5);
    vec2 c = vec2(cos(ang), sin(ang)) * rad * (1.0 + 0.4 * sin(fi));
    float d = length(p - c);
    float soft = exp(-d * d * (70.0 + fi * 8.0));
    synth += hsv2rgb(vec3(fract(fi * 0.11 + t * 0.05), 0.75, 1.0)) * soft;
  }
  float sun = exp(-dot(p, p) * 55.0);
  synth += vec3(1.0, 0.9, 0.6) * sun;
  vec3 trail = samplePrev(vUv);
  fragColor = vec4(clamp(mix(synth, trail * 0.86 + synth, 0.5), 0.0, 1.0), 1.0);
}
`;

/** Flames rising over the captured note (page stays the background). */
const FRAG_FLAME = `#version 300 es
${COMMON}
void main() {
  float t = uTime;
  vec2 uv = vUv;
  // Slight heat shimmer on the page
  vec2 shimmer = vec2(
    (fbm(vec2(uv.x * 6.0, uv.y * 3.0 - t * 1.2)) - 0.5) * 0.012,
    (fbm(vec2(uv.x * 5.0 + 2.0, uv.y * 4.0 - t * 1.5)) - 0.5) * 0.008
  );
  vec3 src = sampleSource(uv + shimmer);
  vec3 prev = samplePrev(uv + vec2(0.0, 0.01));
  vec3 page = mix(src, prev, 0.2);

  float n = fbm(vec2(uv.x * 4.0, uv.y * 2.0 - t * 1.4));
  float n2 = fbm(vec2(uv.x * 7.0 + 3.0, uv.y * 3.0 - t * 2.0));
  float flame = (n * 0.65 + n2 * 0.35);
  flame = flame * (1.15 - uv.y);
  flame = smoothstep(0.38, 0.78, flame);

  vec3 c1 = hsv2rgb(vec3(fract(0.02 + flame * 0.12 + t * 0.01), 0.9, 1.0));
  vec3 c2 = hsv2rgb(vec3(fract(0.08 + uv.x * 0.1), 0.8, 1.0));
  vec3 fire = mix(c2, c1, flame) * flame;
  fire += c1 * pow(flame, 3.0) * 0.9;

  // Composite: note underneath, flames on top
  vec3 col = mix(page, page * vec3(1.15, 0.85, 0.55) + fire, flame * 0.85);
  col = mix(col, src, 0.18 * (1.0 - flame));
  fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
`;

const FRAG_VIZBURST = `#version 300 es
${COMMON}
void main() {
  float t = uTime;
  vec2 p = (vUv - 0.5) * vec2(uResolution.x / max(uResolution.y, 1.0), 1.0);
  float r = length(p);
  float a = atan(p.y, p.x);
  float burst = fract(t * 0.55);
  float wave = abs(r - burst * 0.9);
  float ring = exp(-wave * wave * 90.0);
  float rays = pow(abs(sin(a * 10.0 + t * 3.0)), 6.0) * smoothstep(0.7, 0.0, r);
  vec3 neon = hsv2rgb(vec3(fract(burst + a * 0.1), 0.85, 1.0));
  vec3 synth = neon * (ring * 1.3 + rays * 0.8);
  synth += neon * 0.05 * exp(-r * 2.0);
  vec3 trail = samplePrev(0.5 + (vUv - 0.5) * 1.02);
  fragColor = vec4(clamp(mix(synth, trail * 0.88 + synth, 0.42), 0.0, 1.0), 1.0);
}
`;

const FRAG_VIZSTRIPE = `#version 300 es
${COMMON}
void main() {
  float t = uTime;
  vec2 p = vUv - 0.5;
  float ang = t * 0.4;
  float cs = cos(ang);
  float sn = sin(ang);
  vec2 q = vec2(cs * p.x - sn * p.y, sn * p.x + cs * p.y);
  q += 0.05 * sin(q.yx * 12.0 + t);
  float stripe = step(0.5, fract(q.x * 14.0 + t * 0.5));
  vec3 aCol = hsv2rgb(vec3(fract(t * 0.05), 0.8, 1.0));
  vec3 bCol = hsv2rgb(vec3(fract(t * 0.05 + 0.45), 0.8, 0.35));
  vec3 synth = mix(bCol, aCol, stripe);
  vec3 trail = samplePrev(vUv + vec2(0.004, -0.004));
  fragColor = vec4(clamp(mix(synth, trail * 0.7 + synth * 0.5, 0.3), 0.0, 1.0), 1.0);
}
`;

const FRAG_VIZBLOB = `#version 300 es
${COMMON}
void main() {
  float t = uTime;
  vec2 p = vUv - 0.5;
  float field = 0.0;
  for (int i = 0; i < 6; i++) {
    float fi = float(i);
    vec2 c = vec2(
      0.3 * sin(t * (0.7 + fi * 0.13) + fi * 1.1),
      0.28 * cos(t * (0.55 + fi * 0.17) + fi * 1.7)
    );
    float d = length(p - c);
    field += 0.09 / (d * d + 0.02);
  }
  float iso = smoothstep(1.4, 1.6, field) - smoothstep(1.6, 2.2, field);
  vec3 neon = hsv2rgb(vec3(fract(field * 0.15 + t * 0.05), 0.8, 1.0));
  vec3 synth = neon * max(iso, 0.0) * 1.4;
  synth += neon * 0.04 * field;
  vec3 trail = samplePrev(vUv);
  fragColor = vec4(clamp(mix(synth, trail * 0.87 + synth, 0.48), 0.0, 1.0), 1.0);
}
`;

const FRAG_VIZHELIX = `#version 300 es
${COMMON}
void main() {
  float t = uTime;
  vec2 uv = vUv;
  float z = uv.y * 8.0 - t * 1.5;
  float x1 = 0.5 + 0.22 * sin(z);
  float x2 = 0.5 + 0.22 * sin(z + 3.14159);
  float d1 = abs(uv.x - x1);
  float d2 = abs(uv.x - x2);
  float s1 = exp(-d1 * d1 * 700.0);
  float s2 = exp(-d2 * d2 * 700.0);
  // Cross links
  float link = step(0.92, fract(z * 0.5)) * step(min(x1, x2), uv.x) * step(uv.x, max(x1, x2));
  link *= smoothstep(0.02, 0.0, abs(uv.y - (floor(uv.y * 16.0) + 0.5) / 16.0));
  vec3 c1 = hsv2rgb(vec3(fract(0.55 + t * 0.03), 0.85, 1.0));
  vec3 c2 = hsv2rgb(vec3(fract(0.12 + t * 0.03), 0.85, 1.0));
  vec3 synth = c1 * s1 + c2 * s2 + (c1 + c2) * 0.5 * link * 0.8;
  vec3 trail = samplePrev(uv + vec2(0.0, 0.01));
  fragColor = vec4(clamp(mix(synth, trail * 0.9 + synth * 0.4, 0.4), 0.0, 1.0), 1.0);
}
`;

const FRAG_VIZLATTICE = `#version 300 es
${COMMON}
void main() {
  float t = uTime;
  vec2 p = vUv - 0.5;
  float z = fract(t * 0.2);
  float depth = 0.15 + z;
  vec2 q = p / depth;
  q.y += t * 0.1;
  float gx = abs(fract(q.x * 5.0) - 0.5);
  float gy = abs(fract(q.y * 5.0) - 0.5);
  float gz = abs(fract((1.0 / depth) * 3.0) - 0.5);
  float line = 1.0 - smoothstep(0.0, 0.05, min(min(gx, gy), gz));
  vec3 neon = hsv2rgb(vec3(fract(depth + t * 0.05), 0.75, 1.0));
  vec3 synth = neon * line * smoothstep(0.7, 0.1, length(p));
  synth += neon * 0.05;
  vec3 trail = samplePrev(vUv + p * 0.01);
  fragColor = vec4(clamp(mix(synth, trail * 0.88 + synth, 0.42), 0.0, 1.0), 1.0);
}
`;

const FRAG_VIZRIPPLE = `#version 300 es
${COMMON}
void main() {
  float t = uTime;
  vec2 p = vUv - 0.5;
  float f = 0.0;
  for (int i = 0; i < 4; i++) {
    float fi = float(i);
    vec2 c = vec2(
      0.25 * sin(t * 0.4 + fi * 2.0),
      0.25 * cos(t * 0.35 + fi * 1.3)
    );
    f += sin(length(p - c) * 28.0 - t * 4.0);
  }
  f = f * 0.25 + 0.5;
  vec3 neon = hsv2rgb(vec3(fract(f * 0.6 + t * 0.05), 0.8, 1.0));
  float edge = smoothstep(0.15, 0.55, abs(f - 0.5));
  vec3 synth = neon * edge;
  synth += neon * 0.06;
  vec3 trail = samplePrev(vUv);
  fragColor = vec4(clamp(mix(synth, trail * 0.9 + synth * 0.4, 0.4), 0.0, 1.0), 1.0);
}
`;

const FRAG_VIZDIAMOND = `#version 300 es
${COMMON}
void main() {
  float t = uTime;
  vec2 p = vUv - 0.5;
  float ang = t * 0.55;
  float cs = cos(ang);
  float sn = sin(ang);
  vec2 q = vec2(cs * p.x - sn * p.y, sn * p.x + cs * p.y);
  q *= 1.0 + 0.15 * sin(t * 1.2);
  float d = abs(q.x) + abs(q.y);
  float cell = fract(d * 10.0 - t);
  float diamond = smoothstep(0.15, 0.0, abs(cell - 0.5));
  vec3 neon = hsv2rgb(vec3(fract(d * 0.4 + t * 0.06), 0.85, 1.0));
  vec3 synth = neon * diamond;
  synth += neon * 0.05 * (1.0 - smoothstep(0.0, 0.8, d));
  vec3 trail = samplePrev(0.5 + p * 0.97);
  fragColor = vec4(clamp(mix(synth, trail * 0.88 + synth, 0.4), 0.0, 1.0), 1.0);
}
`;

const FRAG_VIZFLAME = `#version 300 es
${COMMON}
void main() {
  float t = uTime;
  vec2 uv = vUv;
  float n = fbm(vec2(uv.x * 4.0, uv.y * 2.0 - t * 1.4));
  float n2 = fbm(vec2(uv.x * 7.0 + 3.0, uv.y * 3.0 - t * 2.0));
  float flame = (n * 0.65 + n2 * 0.35);
  flame = flame * (1.1 - uv.y);
  flame = smoothstep(0.35, 0.75, flame);
  vec3 c1 = hsv2rgb(vec3(fract(0.02 + flame * 0.12 + t * 0.01), 0.9, 1.0));
  vec3 c2 = hsv2rgb(vec3(fract(0.08 + uv.x * 0.1), 0.85, 1.0));
  vec3 synth = mix(c2 * 0.15, c1, flame);
  synth += c1 * pow(flame, 3.0) * 0.8;
  vec3 trail = samplePrev(uv + vec2(0.0, 0.015));
  fragColor = vec4(clamp(mix(synth, trail * 0.85 + synth * 0.45, 0.4), 0.0, 1.0), 1.0);
}
`;

const FRAG_VIZSWARM = `#version 300 es
${COMMON}
void main() {
  float t = uTime;
  vec2 p = vUv - 0.5;
  vec3 synth = vec3(0.02, 0.02, 0.05);
  for (int i = 0; i < 12; i++) {
    float fi = float(i);
    float seed = hash(vec2(fi, 3.1));
    vec2 c = vec2(
      sin(t * (0.8 + seed) + fi * 1.3 + seed * 6.0),
      cos(t * (0.7 + seed * 0.7) + fi * 1.9)
    ) * (0.15 + 0.25 * seed);
    c += 0.08 * vec2(sin(t * 2.0 + fi), cos(t * 1.6 + fi * 0.5));
    float d = length(p - c);
    float soft = exp(-d * d * 180.0);
    synth += hsv2rgb(vec3(fract(seed + t * 0.05), 0.75, 1.0)) * soft;
  }
  vec3 trail = samplePrev(vUv + vec2(sin(t) * 0.002, cos(t) * 0.002));
  fragColor = vec4(clamp(mix(synth, trail * 0.9 + synth * 0.35, 0.55), 0.0, 1.0), 1.0);
}
`;

/** Passthrough / seed: copy source into feedback buffer. */
export const FRAG_SEED = `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uSource;
out vec4 fragColor;
void main() {
  fragColor = texture(uSource, vUv);
}
`;

export const FRAG_BY_MODE: Record<ScreensaverEffectId, string> = {
  diffuse: FRAG_DIFFUSE,
  melt: FRAG_MELT,
  ripple: FRAG_RIPPLE,
  phosphor: FRAG_PHOSPHOR,
  glitch: FRAG_GLITCH,
  plasma: FRAG_PLASMA,
  tunnel: FRAG_TUNNEL,
  bloom: FRAG_BLOOM,
  kaleido: FRAG_KALEIDO,
  liquid: FRAG_LIQUID,
  waveform: FRAG_WAVEFORM,
  pulse: FRAG_PULSE,
  flame: FRAG_FLAME,
  vizbars: FRAG_VIZBARS,
  vizflower: FRAG_VIZFLOWER,
  vizstars: FRAG_VIZSTARS,
  vizspiral: FRAG_VIZSPIRAL,
  vizgrid: FRAG_VIZGRID,
  vizrings: FRAG_VIZRINGS,
  vizribbons: FRAG_VIZRIBBONS,
  vizorbit: FRAG_VIZORBIT,
  vizburst: FRAG_VIZBURST,
  vizstripe: FRAG_VIZSTRIPE,
  vizblob: FRAG_VIZBLOB,
  vizhelix: FRAG_VIZHELIX,
  vizlattice: FRAG_VIZLATTICE,
  vizripple: FRAG_VIZRIPPLE,
  vizdiamond: FRAG_VIZDIAMOND,
  vizflame: FRAG_VIZFLAME,
  vizswarm: FRAG_VIZSWARM,
};
