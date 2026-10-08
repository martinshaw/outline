/** Minimal typings for Chrome's Local Font Access API. */
export type LocalFontData = {
  readonly family: string;
  readonly fullName: string;
  readonly postscriptName: string;
  readonly style: string;
  blob(): Promise<Blob>;
};

declare global {
  interface Window {
    queryLocalFonts?: (options?: {
      postscriptNames?: string[];
    }) => Promise<LocalFontData[]>;
  }
}

const registeredFamilies = new Set<string>();

export function supportsLocalFonts(): boolean {
  return typeof window !== 'undefined' && typeof window.queryLocalFonts === 'function';
}

function escapeCssFontFamily(family: string): string {
  return family.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

/** CSS stack for a local family with sensible fallbacks. */
export function localFontCss(family: string): string {
  const safe = escapeCssFontFamily(family.trim());
  return `"${safe}", ui-sans-serif, system-ui, sans-serif`;
}

function inferFaceDescriptors(style: string): {
  style: string;
  weight: string;
} {
  const s = style.toLowerCase();
  const italic = s.includes('italic') || s.includes('oblique');
  let weight = '400';
  if (s.includes('thin') || s.includes('hairline')) weight = '100';
  else if (s.includes('extralight') || s.includes('ultralight')) weight = '200';
  else if (s.includes('light')) weight = '300';
  else if (s.includes('medium')) weight = '500';
  else if (s.includes('semibold') || s.includes('demibold')) weight = '600';
  else if (s.includes('extrabold') || s.includes('ultrabold')) weight = '800';
  else if (s.includes('black') || s.includes('heavy')) weight = '900';
  else if (s.includes('bold')) weight = '700';
  return { style: italic ? 'italic' : 'normal', weight };
}

/**
 * Enumerate unique font family names (requires user gesture + permission).
 */
export async function listLocalFontFamilies(): Promise<string[]> {
  if (!supportsLocalFonts() || !window.queryLocalFonts) {
    throw new Error('Local Font Access API is not available in this browser');
  }
  const fonts = await window.queryLocalFonts();
  const families = [...new Set(fonts.map((f) => f.family).filter(Boolean))];
  families.sort((a, b) => a.localeCompare(b));
  return families;
}

/**
 * Register SFNT faces for a family via FontFace so the editor can paint them
 * even when CSS local() lookup is unreliable.
 */
export async function ensureLocalFontLoaded(family: string): Promise<void> {
  const trimmed = family.trim();
  if (!trimmed || registeredFamilies.has(trimmed)) return;
  if (!supportsLocalFonts() || !window.queryLocalFonts) return;

  try {
    const fonts = await window.queryLocalFonts();
    const matches = fonts.filter((f) => f.family === trimmed);
    if (matches.length === 0) return;

    await Promise.all(
      matches.map(async (font) => {
        const blob = await font.blob();
        const buffer = await blob.arrayBuffer();
        const { style, weight } = inferFaceDescriptors(font.style);
        const face = new FontFace(trimmed, buffer, { style, weight });
        await face.load();
        document.fonts.add(face);
      }),
    );
    registeredFamilies.add(trimmed);
  } catch {
    // Permission denied or load failure — CSS family name may still work
  }
}
