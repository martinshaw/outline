import { toCanvas } from 'html-to-image';

/** Max edge length for the capture texture (keeps GPU work bounded). */
const MAX_EDGE = 1600;

const CAPTURE_TIMEOUT_MS = 4000;

function readThemeColors(): { paper: string; ink: string } {
  const styles = getComputedStyle(document.documentElement);
  return {
    paper: styles.getPropertyValue('--paper').trim() || '#f4f1ea',
    ink: styles.getPropertyValue('--ink').trim() || '#1a1a1a',
  };
}

function scaleSize(width: number, height: number): { w: number; h: number } {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  let w = Math.max(1, Math.floor(width * dpr));
  let h = Math.max(1, Math.floor(height * dpr));
  const edge = Math.max(w, h);
  if (edge > MAX_EDGE) {
    const s = MAX_EDGE / edge;
    w = Math.max(1, Math.floor(w * s));
    h = Math.max(1, Math.floor(h * s));
  }
  return { w, h };
}

function downscaleCanvas(
  source: HTMLCanvasElement,
  targetW: number,
  targetH: number,
): HTMLCanvasElement {
  if (source.width === targetW && source.height === targetH) return source;
  const out = document.createElement('canvas');
  out.width = targetW;
  out.height = targetH;
  const ctx = out.getContext('2d');
  if (!ctx) return source;
  ctx.drawImage(source, 0, 0, targetW, targetH);
  return out;
}

/** Skip chrome that would never appear in a static snapshot. */
function captureFilter(node: Node): boolean {
  if (!(node instanceof HTMLElement)) return true;
  if (node.classList.contains('editor-placeholder')) return false;
  if (node.classList.contains('outline-block-handle-layer')) return false;
  if (node.classList.contains('outline-block-handle')) return false;
  if (node.classList.contains('screensaver-overlay')) return false;
  return true;
}

/**
 * True when the bitmap has meaningful ink (not empty foreignObject / flat paper).
 */
export function captureLooksLikeContent(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  paperRgb: [number, number, number],
): boolean {
  const paperL =
    paperRgb[0] * 0.299 + paperRgb[1] * 0.587 + paperRgb[2] * 0.114;
  const cols = 10;
  const rows = 10;
  let inkLike = 0;
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const x = Math.min(w - 1, Math.max(0, (((col + 0.5) / cols) * w) | 0));
      const y = Math.min(h - 1, Math.max(0, (((row + 0.5) / rows) * h) | 0));
      const d = ctx.getImageData(x, y, 1, 1).data;
      const l = (d[0] * 0.299 + d[1] * 0.587 + d[2] * 0.114) / 255;
      if (Math.abs(l - paperL) > 0.06) inkLike += 1;
    }
  }
  return inkLike >= 1;
}

/** Solid paper + ink noise when DOM capture fails. */
export function createFallbackBitmap(
  width: number,
  height: number,
): ImageBitmap | HTMLCanvasElement {
  const { w, h } = scaleSize(width, height);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;
  const { paper, ink } = readThemeColors();
  ctx.fillStyle = paper;
  ctx.fillRect(0, 0, w, h);
  const image = ctx.getImageData(0, 0, w, h);
  const data = image.data;
  for (let i = 0; i < data.length; i += 4) {
    const n = (Math.random() - 0.5) * 28;
    data[i] = Math.min(255, Math.max(0, data[i] + n));
    data[i + 1] = Math.min(255, Math.max(0, data[i + 1] + n));
    data[i + 2] = Math.min(255, Math.max(0, data[i + 2] + n));
  }
  const inkRgb = cssColorToRgb(ink);
  for (let k = 0; k < Math.floor((w * h) / 900); k++) {
    const x = (Math.random() * w) | 0;
    const y = (Math.random() * h) | 0;
    const i = (y * w + x) * 4;
    data[i] = Math.round(inkRgb[0] * 255);
    data[i + 1] = Math.round(inkRgb[1] * 255);
    data[i + 2] = Math.round(inkRgb[2] * 255);
  }
  ctx.putImageData(image, 0, 0);
  return canvas;
}

/**
 * Capture for the screensaver; never hangs — falls back to noise on timeout/failure.
 */
export async function captureForScreensaver(
  el: HTMLElement | null,
  width: number,
  height: number,
): Promise<ImageBitmap | HTMLCanvasElement> {
  const fallback = () =>
    createFallbackBitmap(
      width > 0 ? width : window.innerWidth,
      height > 0 ? height : window.innerHeight,
    );
  if (!el) return fallback();
  const captured = await Promise.race([
    captureElementToBitmap(el),
    new Promise<null>((resolve) =>
      window.setTimeout(() => resolve(null), CAPTURE_TIMEOUT_MS),
    ),
  ]);
  return captured ?? fallback();
}

/**
 * Rasterize the live note DOM (day title + editor) for the dissolve source.
 */
export async function captureElementToBitmap(
  el: HTMLElement,
): Promise<ImageBitmap | HTMLCanvasElement | null> {
  const layoutW = Math.max(el.clientWidth, el.getBoundingClientRect().width);
  const layoutH = Math.max(
    el.clientHeight,
    Math.min(el.scrollHeight, 12_000),
  );
  if (layoutW < 2 || layoutH < 2) return null;

  const { paper } = readThemeColors();
  const paperRgb = cssColorToRgb(paper);
  const pixelRatio = Math.min(2, window.devicePixelRatio || 1);

  let canvas: HTMLCanvasElement;
  try {
    canvas = await toCanvas(el, {
      width: layoutW,
      height: layoutH,
      pixelRatio,
      backgroundColor: paper,
      cacheBust: true,
      filter: captureFilter,
    });
  } catch {
    return null;
  }

  const { w, h } = scaleSize(layoutW, layoutH);
  canvas = downscaleCanvas(canvas, w, h);

  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  if (!captureLooksLikeContent(ctx, w, h, paperRgb)) {
    return null;
  }

  if (typeof createImageBitmap === 'function') {
    return await createImageBitmap(canvas);
  }
  return canvas;
}

export function themeColorUniforms(): {
  paper: [number, number, number];
  ink: [number, number, number];
} {
  const { paper, ink } = readThemeColors();
  return { paper: cssColorToRgb(paper), ink: cssColorToRgb(ink) };
}

function cssColorToRgb(value: string): [number, number, number] {
  const probe = document.createElement('div');
  probe.style.color = value;
  document.body.appendChild(probe);
  const computed = getComputedStyle(probe).color;
  probe.remove();
  const m = computed.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i);
  if (!m) return [0.96, 0.94, 0.91];
  return [Number(m[1]) / 255, Number(m[2]) / 255, Number(m[3]) / 255];
}
