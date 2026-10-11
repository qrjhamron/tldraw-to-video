import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  EditorProvider,
  type Editor,
  type TLDrawShape,
  type SvgExportContext,
} from "tldraw";
import type { Camera } from "./schema";
/** Draw-only offline adapter. Uses the SDK's public ShapeUtil.toSvg, not a reimplementation.
 * Immutable fragments avoid mounting a second reactive export tree for every video frame.
 * The generic getSvgString pipeline remains available for all other shape types. */
export class NativeDrawSvg {
  private cache = new Map<
    string,
    { record: TLDrawShape; theme: string; svg: string }
  >();
  constructor(private editor: Editor) {}
  render(shapes: TLDrawShape[], camera: Camera): string {
    const theme = this.editor.getCurrentThemeId(),
      pieces: string[] = [];
    const ctx: SvgExportContext = {
      isDarkMode: false,
      colorMode: "light",
      scale: 1,
      pixelRatio: null,
      addExportDef() {},
      waitUntil() {
        throw Error(
          "Asynchronous native draw export requires generic SVG pipeline",
        );
      },
      async resolveAssetUrl() {
        return null;
      },
    };
    for (const shape of shapes) {
      if (
        shape.props.fill !== "none" ||
        shape.parentId !== this.editor.getCurrentPageId()
      )
        throw Error(
          "Native draw adapter requires unfilled top-level shapes; use generic SVG export",
        );
      let entry = this.cache.get(shape.id);
      if (!entry || entry.record !== shape || entry.theme !== theme) {
        const util = this.editor.getShapeUtil(shape);
        if (!util.toSvg) throw Error("Missing native SVG exporter");
        const svg = util.toSvg(shape, ctx);
        const transform =
          this.editor.getShapePageTransform(shape).toCssString() +
          ` scale(${shape.props.scale})`;
        entry = {
          record: shape,
          theme,
          svg: renderToStaticMarkup(
            <EditorProvider editor={this.editor}>
              <g transform={transform} opacity={shape.opacity}>
                {svg}
              </g>
            </EditorProvider>,
          ),
        };
        this.cache.set(shape.id, entry);
      }
      pieces.push(entry.svg);
    }
    // Page transforms come from the editor; camera is applied once in screen space.
    return `<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080" viewBox="0 0 1920 1080" stroke-linecap="round" stroke-linejoin="round"><g transform="translate(${camera.x * camera.z} ${camera.y * camera.z}) scale(${camera.z})">${pieces.join("")}</g></svg>`;
  }
  clear() {
    this.cache.clear();
  }
}
