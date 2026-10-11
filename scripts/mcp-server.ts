/** MCP stdio server exposing visual-asset and handwriting tools.
 *
 * Tools: add_image, add_portrait, place_asset, animate_image, annotate_image,
 * set_handwriting_style, set_canvas_style, create_visual_comparison,
 * list_assets, inspect_asset.
 *
 * Lesson tools take a lesson JSON object plus tool params and return the
 * updated lesson. Asset tools read `assets/manifest.json`.
 *
 * Run: `npm run mcp` (stdio).
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import {
  addImage,
  addPortrait,
  placeAsset,
  animateImage,
  annotateImage,
  setHandwritingStyle,
  setCanvasStyle,
  createVisualComparison,
  listAssetsTool,
  inspectAssetTool,
} from "../src/mcp/tools.js";

const server = new McpServer({
  name: "tldraw-visual-studio",
  version: "4.0.0",
});

const lessonSchema = z.any().describe("Lesson JSON object (stroke-lesson v1)");

server.tool(
  "add_image",
  "Place a registered asset on the canvas",
  { lesson: lessonSchema, assetId: z.string(), x: z.number(), y: z.number(), w: z.number(), h: z.number(), at: z.number().optional(), duration: z.number().optional(), rotation: z.number().optional(), opacity: z.number().optional(), chapterId: z.string().optional(), altText: z.string().optional() },
  async (args) => {
    const { lesson, ...params } = args as { lesson: unknown } & Parameters<typeof addImage>[1];
    const r = addImage(lesson, params);
    return { content: [{ type: "text", text: JSON.stringify(r) }] };
  },
);

server.tool(
  "add_portrait",
  "Place a Newton/Leibniz portrait with attribution caption",
  { lesson: lessonSchema, who: z.enum(["newton", "leibniz"]), x: z.number(), y: z.number(), w: z.number().optional(), at: z.number().optional(), duration: z.number().optional(), chapterId: z.string().optional(), withCaption: z.boolean().optional() },
  async (args) => {
    const { lesson, ...params } = args as { lesson: unknown } & Parameters<typeof addPortrait>[1];
    const r = addPortrait(lesson, params);
    return { content: [{ type: "text", text: JSON.stringify(r) }] };
  },
);

server.tool(
  "place_asset",
  "Place any asset with layer/crop control",
  { lesson: lessonSchema, assetId: z.string(), x: z.number(), y: z.number(), w: z.number(), h: z.number(), at: z.number().optional(), duration: z.number().optional(), rotation: z.number().optional(), opacity: z.number().optional(), layer: z.number().optional(), chapterId: z.string().optional() },
  async (args) => {
    const { lesson, ...params } = args as { lesson: unknown } & Parameters<typeof placeAsset>[1];
    const r = placeAsset(lesson, params);
    return { content: [{ type: "text", text: JSON.stringify(r) }] };
  },
);

server.tool(
  "animate_image",
  "Animate a placed image (reveal/fade/slide/zoom/mask/cameraFollow)",
  { lesson: lessonSchema, target: z.string(), effect: z.enum(["reveal", "fade", "slide", "zoom", "mask", "cameraFollow"]), at: z.number(), duration: z.number(), dx: z.number().optional(), dy: z.number().optional(), scale: z.number().optional(), fromOpacity: z.number().optional(), toOpacity: z.number().optional(), chapterId: z.string().optional() },
  async (args) => {
    const { lesson, ...params } = args as { lesson: unknown } & Parameters<typeof animateImage>[1];
    const r = animateImage(lesson, params);
    return { content: [{ type: "text", text: JSON.stringify(r) }] };
  },
);

server.tool(
  "annotate_image",
  "Add a handwritten caption/label/arrow over an image",
  { lesson: lessonSchema, content: z.string(), x: z.number(), y: z.number(), at: z.number(), duration: z.number(), height: z.number().optional(), color: z.enum(["black", "blue", "red", "green", "orange", "grey"]).optional(), chapterId: z.string().optional(), font: z.enum(["stroke", "Patrick Hand", "Kalam", "Caveat"]).optional() },
  async (args) => {
    const { lesson, ...params } = args as { lesson: unknown } & Parameters<typeof annotateImage>[1];
    const r = annotateImage(lesson, params);
    return { content: [{ type: "text", text: JSON.stringify(r) }] };
  },
);

server.tool(
  "set_handwriting_style",
  "Set handwriting role/font default (lesson or chapter)",
  { lesson: lessonSchema, role: z.enum(["title", "heading", "explanation", "annotation", "math"]).optional(), font: z.enum(["stroke", "Patrick Hand", "Kalam", "Caveat"]).optional(), chapterId: z.string().optional(), at: z.number().optional() },
  async (args) => {
    const { lesson, ...params } = args as { lesson: unknown } & Parameters<typeof setHandwritingStyle>[1];
    const r = setHandwritingStyle(lesson, params);
    return { content: [{ type: "text", text: JSON.stringify(r) }] };
  },
);

server.tool(
  "set_canvas_style",
  "Switch canvas theme (whiteboard/graph/notebook/darkboard) without rebuilding",
  { lesson: lessonSchema, theme: z.string(), chapterId: z.string().optional(), at: z.number().optional() },
  async (args) => {
    const { lesson, ...params } = args as { lesson: unknown } & Parameters<typeof setCanvasStyle>[1];
    const r = setCanvasStyle(lesson, params);
    return { content: [{ type: "text", text: JSON.stringify(r) }] };
  },
);

server.tool(
  "create_visual_comparison",
  "Build a side-by-side handwriting comparison lesson",
  { id: z.string().optional(), title: z.string().optional(), seed: z.number().optional(), theme: z.string().optional() },
  async (args) => {
    const r = createVisualComparison(args);
    return { content: [{ type: "text", text: JSON.stringify(r) }] };
  },
);

server.tool("list_assets", "List registered visual assets with provenance", {}, async () => {
  const r = await listAssetsTool();
  return { content: [{ type: "text", text: JSON.stringify(r) }] };
});

server.tool("inspect_asset", "Inspect one asset by id or file", { id: z.string() }, async (args) => {
  const r = await inspectAssetTool(args.id);
  return { content: [{ type: "text", text: JSON.stringify(r) }] };
});

const transport = new StdioServerTransport();
await server.connect(transport);
