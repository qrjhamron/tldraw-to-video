/** Canvas-direct rendering for font-mode text shapes in offline export.
 *
 * tldraw renders text shapes via `<foreignObject>` HTML, which taints canvas
 * rasterization through the SVG→img path. For export frames, font-mode text
 * is drawn directly with canvas fillText using the same vendored webfonts the
 * live editor uses. This is honest font rendering (never pen geometry) and is
 * deterministic under seeking: position derives from shape page bounds and
 * the export camera, content from the shape's rich text at time t.
 */
import type { Editor, TLTextShape } from "tldraw";
import type { Camera } from "./schema";

const FONT_SIZE_SCALE: Record<string, number> = { s: 1.125, m: 1.5, l: 2.25, xl: 2.75 };
const THEME_FONT_SIZE = 16;

const INK: Record<string, string> = {
  black: "#263238",
  blue: "#285d92",
  red: "#b84d46",
  green: "#3e7869",
  orange: "#b47a25",
  grey: "#78817f",
  gray: "#78817f",
};

function plaintextOf(richText: unknown): string {
  // TLRichText: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] }
  try {
    const doc = richText as {
      content?: { content?: { text?: string; type?: string }[] }[];
    };
    if (!doc || !Array.isArray(doc.content)) return "";
    return doc.content
      .map((p) =>
        (p.content ?? [])
          .filter((n) => n.type === "text" && typeof n.text === "string")
          .map((n) => n.text)
          .join(""),
      )
      .join("\n");
  } catch {
    return "";
  }
}

function familyOf(shape: TLTextShape): string {
  const meta = shape.meta as { fontFamily?: string };
  if (
    meta.fontFamily === "Patrick Hand" ||
    meta.fontFamily === "Kalam" ||
    meta.fontFamily === "Caveat"
  )
    return `'${meta.fontFamily}'`;
  switch (shape.props.font) {
    case "sans":
      return "'Kalam'";
    case "serif":
      return "'Caveat'";
    case "mono":
      return "monospace";
    default:
      return "'Patrick Hand'";
  }
}

let fontsReady: Promise<void> | null = null;

/** Ensure vendored handwriting fonts are loaded before export drawing. */
export function ensureExportFonts(): Promise<void> {
  if (!fontsReady) {
    fontsReady = (async () => {
      try {
        await Promise.all([
          document.fonts.load('16px "Patrick Hand"'),
          document.fonts.load('16px "Kalam"'),
          document.fonts.load('16px "Caveat"'),
          document.fonts.ready,
        ]);
      } catch {
        // Fall back to whatever the browser has; shapes still render.
      }
    })();
  }
  return fontsReady;
}

/** Draw text shapes onto the export canvas in screen space. */
export function drawTextShapes(
  ctx: CanvasRenderingContext2D,
  editor: Editor,
  shapes: TLTextShape[],
  camera: Camera,
): void {
  if (!shapes.length) return;
  ctx.save();
  for (const shape of shapes) {
    const text = plaintextOf(shape.props.richText);
    if (!text) continue;
    const bounds = editor.getShapePageBounds(shape);
    if (!bounds) continue;
    const pageFontSize =
      THEME_FONT_SIZE *
      (FONT_SIZE_SCALE[shape.props.size] ?? 1.5) *
      shape.props.scale;
    const px = pageFontSize * camera.z;
    const sx = (bounds.x + camera.x) * camera.z;
    const sy = (bounds.y + camera.y) * camera.z;
    ctx.globalAlpha = shape.opacity;
    ctx.fillStyle = INK[shape.props.color] ?? INK.black;
    ctx.font = `${px.toFixed(2)}px ${familyOf(shape)}, cursive`;
    ctx.textBaseline = "top";
    ctx.textAlign = "left";
    const lineHeight = px * 1.35;
    const lines = text.split("\n");
    lines.forEach((line, i) => {
      ctx.fillText(line, sx, sy + i * lineHeight);
    });
  }
  ctx.restore();
}
