/** Offline SVG inlining for export rasterization.
 *
 * SVG rendered via `<img>` cannot load external resources. For lessons with
 * image assets or font-mode text, this module inlines:
 * - `/assets/*` image hrefs as data URLs (cached, deterministic)
 * - vendored handwriting webfonts as `@font-face` data URLs
 * - tldraw CSS font vars as explicit families
 *
 * Draw-only lessons use the fast path and never touch this module.
 */

let fontStyleCache: string | null = null;
const imageCache = new Map<string, string>();

async function fetchDataUrl(url: string): Promise<string> {
  const cached = imageCache.get(url);
  if (cached) return cached;
  const res = await fetch(url);
  if (!res.ok) throw Error(`Asset fetch failed: ${url}`);
  const blob = await res.blob();
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
  imageCache.set(url, dataUrl);
  return dataUrl;
}

async function handwritingFontStyle(): Promise<string> {
  if (fontStyleCache) return fontStyleCache;
  const faces: [string, string, string][] = [
    ["Patrick Hand", "400", "/fonts/PatrickHand-latin.woff2"],
    ["Kalam", "400", "/fonts/Kalam-latin-400.woff2"],
    ["Kalam", "700", "/fonts/Kalam-latin-700.woff2"],
    ["Caveat", "400", "/fonts/Caveat-latin.woff2"],
  ];
  const blocks: string[] = [];
  for (const [family, weight, url] of faces) {
    try {
      const dataUrl = await fetchDataUrl(url);
      blocks.push(
        `@font-face{font-family:'${family}';font-style:normal;font-weight:${weight};font-display:swap;src:url(${dataUrl}) format('woff2');}`,
      );
    } catch {
      // Offline export without vendored fonts falls back to SDK defaults;
      // font-mode shapes still render, just not in the named family.
    }
  }
  fontStyleCache = blocks.length ? `<style>${blocks.join("")}</style>` : "";
  return fontStyleCache;
}

/** Inline external refs so isolated SVG rasterization stays faithful. */
export async function inlineAssetsForExport(svg: string): Promise<string> {
  let out = svg;
  // Resolve tldraw font vars to explicit handwriting families.
  out = out
    .replaceAll("var(--tl-font-draw)", "'Patrick Hand','Shantell Sans',cursive")
    .replaceAll("var(--tl-font-sans)", "'Kalam','Shantell Sans',cursive")
    .replaceAll("var(--tl-font-serif)", "'Caveat','Shantell Sans',cursive")
    .replaceAll("var(--tl-font-mono)", "monospace");
  // Inline /assets/* image references (both href and xlink:href).
  const urls = new Set<string>();
  for (const m of out.matchAll(/(?:href|xlink:href)="(\/assets\/[^"]+)"/g))
    urls.add(m[1]);
  for (const url of urls) {
    try {
      const dataUrl = await fetchDataUrl(url);
      out = out.split(`"${url}"`).join(`"${dataUrl}"`);
    } catch {
      throw Error(`Export cannot inline asset: ${url}`);
    }
  }
  // Prepend vendored fonts so font-mode text rasterizes offline.
  if (
    out.includes("Patrick Hand") ||
    out.includes("Kalam") ||
    out.includes("Caveat") ||
    out.includes("<text")
  ) {
    const style = await handwritingFontStyle();
    if (style) out = out.replace(/<svg([^>]*)>/, `<svg$1>${style}`);
  }
  return out;
}

export function clearInlineCache(): void {
  fontStyleCache = null;
  imageCache.clear();
}
