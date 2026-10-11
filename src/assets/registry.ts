/** Visual asset registry: workspace-safe paths, provenance, SVG sanitization.
 *
 * Supported: PNG, JPEG, WebP, SVG. Assets live under `assets/` (source) and
 * are served offline from `public/assets/`. Every asset requires provenance
 * metadata (title, source, author, license). Online images are NEVER assumed
 * free to reuse: `license` defaults to "unknown – do not reuse" and the
 * compiler refuses assets without an explicit license.
 *
 * Rendering is reproducible: asset ids derive from content hashes, placements
 * are deterministic from lesson seeds, and the manifest pins sha256 + bytes.
 */
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

export type AssetKind = "portrait" | "illustration" | "diagram" | "photo";
export type AssetMime =
  | "image/png"
  | "image/jpeg"
  | "image/webp"
  | "image/svg+xml";

export interface AssetRecord {
  id: string;
  file: string;
  mime: AssetMime;
  kind: AssetKind;
  w: number;
  h: number;
  bytes: number;
  sha256: string;
  title: string;
  author: string;
  license: string;
  source: string;
  provenance: string;
}

export interface AssetManifest {
  version: 1;
  assets: AssetRecord[];
}

const ALLOWED_EXT: Record<string, AssetMime> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
};

/** Enforce workspace-safe asset paths. Only `assets/<name>.<ext>` with a
 * safe filename and supported extension. Rejects absolute paths, `..`,
 * URL schemes, and anything outside the workspace assets directory. */
export function assertWorkspaceSafeAssetPath(file: string): AssetMime {
  if (typeof file !== "string" || !file.length)
    throw Error("Asset path must be a non-empty string");
  if (/^[a-zA-Z]+:\/\//.test(file) || file.startsWith("data:"))
    throw Error(`Remote asset URLs are not allowed: ${file}`);
  if (file.startsWith("/") || file.startsWith("\\"))
    throw Error(`Absolute asset paths are not allowed: ${file}`);
  if (file.includes("..") || file.includes("\\"))
    throw Error(`Unsafe asset path: ${file}`);
  const normalized = file.replace(/^\.\//, "");
  if (!normalized.startsWith("assets/"))
    throw Error(`Asset must live under assets/: ${file}`);
  const rest = normalized.slice("assets/".length);
  if (!rest || rest.includes("/") || !/^[\w][\w\-. ]*[\w]$/.test(rest))
    throw Error(`Unsafe asset filename: ${file}`);
  const dot = rest.lastIndexOf(".");
  if (dot < 0) throw Error(`Asset needs an extension: ${file}`);
  const ext = rest.slice(dot).toLowerCase();
  const mime = ALLOWED_EXT[ext];
  if (!mime) throw Error(`Unsupported asset type: ${file}`);
  return mime;
}

/** Minimal deterministic SVG sanitizer for untrusted sources. Strips scripts,
 * event handlers, foreign objects, animations that fetch, and external refs.
 * Throws when the SVG is not plausibly safe rather than silently passing it. */
export function sanitizeSvg(svg: string): string {
  if (typeof svg !== "string" || svg.length > 2_000_000)
    throw Error("Invalid SVG input");
  if (!/<svg[\s>]/i.test(svg)) throw Error("Not an SVG document");
  let out = svg;
  // Remove comments, processing instructions, doctype.
  out = out.replace(/<!--[\s\S]*?-->/g, "");
  out = out.replace(/<\?[\s\S]*?\?>/g, "");
  out = out.replace(/<!DOCTYPE[\s\S]*?>/gi, "");
  // Drop dangerous elements entirely.
  out = out.replace(
    /<\s*(script|foreignObject|iframe|object|embed|link|meta|base|form|input|button|video|audio|source|track)[\s\S]*?<\/\s*\1\s*>/gi,
    "",
  );
  out = out.replace(
    /<\s*(script|foreignObject|iframe|object|embed|link|meta|base)[^>]*\/?>/gi,
    "",
  );
  // Drop event-handler attributes (on*) and javascript:/data:text/html hrefs.
  out = out.replace(/\s+on[a-zA-Z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "");
  out = out.replace(
    /\s+(href|xlink:href)\s*=\s*("javascript:[^"]*"|'javascript:[^']*')/gi,
    "",
  );
  out = out.replace(
    /url\s*\(\s*["']?javascript:[^)]*\)/gi,
    "url(#blocked)",
  );
  // Block external references in href/src: only allow #fragments and relative
  // asset-local paths without a scheme.
  out = out.replace(
    /\s+(href|xlink:href|src)\s*=\s*("[^"]*"|'[^']*')/gi,
    (m, attr, quoted: string) => {
      const value = quoted.slice(1, -1).trim();
      if (
        value.startsWith("#") ||
        /^[\w.\-./]+$/.test(value) ||
        value.startsWith("data:image/png;base64,") ||
        value.startsWith("data:image/jpeg;base64,") ||
        value.startsWith("data:image/webp;base64,")
      )
        return m;
      throw Error(`SVG external reference blocked: ${value.slice(0, 80)}`);
    },
  );
  if (/<\s*script/i.test(out) || /\son\w+\s*=/i.test(out))
    throw Error("SVG sanitization failed");
  return out;
}

/** Serve path for an asset file inside the offline app/export server. */
export function assetServeUrl(file: string): string {
  assertWorkspaceSafeAssetPath(file);
  return "/" + file.replace(/^assets\//, "assets/");
}

/** Deterministic content id: `asset-<first 12 hex of sha256>`. */
export function assetContentId(bytes: Uint8Array): string {
  return `asset-${createHash("sha256").update(bytes).digest("hex").slice(0, 12)}`;
}

export async function loadManifest(path = "assets/manifest.json"): Promise<AssetManifest> {
  const raw = JSON.parse(await readFile(path, "utf8")) as AssetManifest;
  if (!raw || raw.version !== 1 || !Array.isArray(raw.assets))
    throw Error("Invalid asset manifest");
  for (const a of raw.assets) {
    assertWorkspaceSafeAssetPath(a.file);
    if (!a.id || !a.sha256 || !a.title || !a.source || !a.author || !a.license)
      throw Error(`Asset ${a.id} is missing provenance metadata`);
    if (a.license.toLowerCase().includes("unknown"))
      throw Error(
        `Asset ${a.id} has no explicit license; do not assume reuse rights`,
      );
  }
  return raw;
}

export function listAssets(manifest: AssetManifest): AssetRecord[] {
  return [...manifest.assets];
}

export function inspectAsset(
  manifest: AssetManifest,
  idOrFile: string,
): AssetRecord {
  const found = manifest.assets.find(
    (a) => a.id === idOrFile || a.file === idOrFile,
  );
  if (!found) throw Error(`Unknown asset: ${idOrFile}`);
  return found;
}
