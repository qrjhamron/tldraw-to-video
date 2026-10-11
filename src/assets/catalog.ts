/** Bundled asset catalog for the browser compiler.
 *
 * The browser cannot read `assets/manifest.json` synchronously during
 * compilation, so this module embeds the same records at build time. A unit
 * test verifies it stays in sync with the manifest. Source of truth for
 * provenance remains `assets/manifest.json`; update both together.
 */
import type { AssetRecord } from "./registry";

export const assetCatalog: AssetRecord[] = [
  {
    id: "newton-portrait",
    file: "assets/newton-portrait.jpg",
    mime: "image/jpeg",
    kind: "portrait",
    w: 1364,
    h: 1916,
    bytes: 987984,
    sha256:
      "d2d2c6b74b70428a3fc997786c8a179b503d0f8e17bd2dd73a1ec36f7a0fdc1f",
    title: "Portrait of Isaac Newton (1689)",
    author: "Godfrey Kneller (1646-1723)",
    license:
      "Public domain (painting, 1689); photographic reproduction via Wikimedia Commons",
    source:
      "https://commons.wikimedia.org/wiki/File:GodfreyKneller-IsaacNewton-1689.jpg",
    provenance:
      "Wikimedia Commons File:GodfreyKneller-IsaacNewton-1689.jpg; sitter Isaac Newton (1643-1727)",
  },
  {
    id: "leibniz-portrait",
    file: "assets/leibniz-portrait.jpg",
    mime: "image/jpeg",
    kind: "portrait",
    w: 1280,
    h: 1580,
    bytes: 325713,
    sha256:
      "78be125a085de1aebed20a9068e42357b2e97f218d9e16f80081b6926d525068",
    title: "Portrait of Gottfried Wilhelm Leibniz (ca. 1695)",
    author: "Christoph Bernhard Francke (1665-1729)",
    license:
      "Public domain (painting, ca. 1695, Herzog Anton Ulrich Museum GG 558); photographic reproduction via Wikimedia Commons",
    source:
      "https://commons.wikimedia.org/wiki/File:Christoph_Bernhard_Francke_-_Bildnis_des_Philosophen_Leibniz_(ca._1695).jpg",
    provenance:
      "Wikimedia Commons File:Christoph_Bernhard_Francke_-_Bildnis_des_Philosophen_Leibniz_(ca._1695).jpg; sitter Gottfried Wilhelm Leibniz (1646-1716)",
  },
  {
    id: "secant-tangent-diagram",
    file: "assets/secant-tangent.svg",
    mime: "image/svg+xml",
    kind: "diagram",
    w: 640,
    h: 420,
    bytes: 1042,
    sha256:
      "32f54d906ef929add51aa15c1b7703558606b9ff80c9ae4a9693ef90ee90c669",
    title: "Garis sekan dan garis singgung",
    author: "tldraw-to-video project (authored for this repository)",
    license: "CC0-1.0 (authored diagram, same repository)",
    source: "assets/secant-tangent.svg",
    provenance:
      "Authored SVG illustration of secant vs tangent lines; sanitized at compile time",
  },
  {
    id: "area-under-curve",
    file: "assets/area-under-curve.svg",
    mime: "image/svg+xml",
    kind: "diagram",
    w: 640,
    h: 420,
    bytes: 1110,
    sha256:
      "64ca6a7a827962cbd859568eae0a3bc7ab558528157229b63a122c043ac36786",
    title: "Luas daerah di bawah kurva",
    author: "tldraw-to-video project (authored for this repository)",
    license: "CC0-1.0 (authored diagram, same repository)",
    source: "assets/area-under-curve.svg",
    provenance:
      "Authored SVG illustration of area under y=x^2 with Riemann rectangles; sanitized at compile time",
  },
];

export function lookupAsset(id: string): AssetRecord {
  const found = assetCatalog.find((a) => a.id === id);
  if (!found) throw Error(`Unknown asset: ${id}`);
  return found;
}
