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
import {
  createMathExpression,
  transformMathExpression,
  expressionMathExpr,
  validateMathSteps,
} from "../src/mcp/math-tools.js";
import {
  animateMathGraph,
  animateGeometry,
  setSemanticColors,
  planLessonScenes,
  directSceneTool,
  autoLayoutScene,
  validateSceneLayout,
  reframeCamera,
  inspectTimeline,
  runVisualQa,
  renderLessonPreview,
  alignNarrationTool,
} from "../src/mcp/director-tools.js";

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

// --- Math engine tools ---

server.tool(
  "create_math_expression",
  "Parse/validate a math expression into the semantic AST with stable ids",
  { source: z.string() },
  async (args) => ({ content: [{ type: "text", text: JSON.stringify(createMathExpression(args)) }] }),
);

server.tool(
  "transform_math_expression",
  "Apply a verified AST transform and numerically verify the step",
  {
    source: z.string(),
    op: z.enum(["expand", "factor-common", "factor-diffsq", "factor-trinomial", "simplify", "substitute", "balance", "solve-linear", "complete-square", "cancel"]),
    arg: z.string().optional(),
    operand: z.string().optional(),
    verify: z.boolean().optional(),
  },
  async (args) => ({ content: [{ type: "text", text: JSON.stringify(transformMathExpression(args)) }] }),
);

server.tool(
  "validate_math_steps",
  "Verify a rewrite chain; reports equivalent/conditional/implication/approximation/heuristic/invalid",
  { steps: z.array(z.object({ source: z.string(), rule: z.string().optional(), conditions: z.array(z.string()).optional() })) },
  async (args) => ({ content: [{ type: "text", text: JSON.stringify(validateMathSteps(args)) }] }),
);

server.tool(
  "math_expression_layout",
  "Lower a parsed expression to MathExpr layout JSON",
  { source: z.string() },
  async (args) => ({ content: [{ type: "text", text: JSON.stringify(expressionMathExpr(args)) }] }),
);

// --- Director tools ---

const sceneSchema = z.any().describe("ScenePlan JSON");

server.tool(
  "animate_math_graph",
  "Append axes/curves/morph/secant/tangent/shade/riemann/points graph actions",
  {
    lesson: lessonSchema, chapterId: z.string().optional(), at: z.number(), duration: z.number().optional(),
    graph: z.any().describe("Graph frame { x,y,width,height,xMin,xMax,yMin,yMax }"),
    axes: z.boolean().optional(), curves: z.array(z.any()).optional(), morph: z.any().optional(),
    secant: z.any().optional(), tangent: z.any().optional(), shade: z.any().optional(),
    riemann: z.any().optional(), points: z.array(z.any()).optional(),
  },
  async (args) => {
    const { lesson, ...params } = args as { lesson: unknown } & import("../src/mcp/director-tools.js").GraphAnimationInput;
    return { content: [{ type: "text", text: JSON.stringify(animateMathGraph(lesson, params)) }] };
  },
);

server.tool(
  "animate_geometry",
  "Append diagram construction steps (rect/ellipse/areaModel/fractionBar/triangle/...)",
  { lesson: lessonSchema, chapterId: z.string().optional(), at: z.number(), duration: z.number().optional(), shapes: z.array(z.any()) },
  async (args) => {
    const { lesson, ...params } = args as { lesson: unknown; chapterId?: string; at: number; duration?: number; shapes: never[] };
    return { content: [{ type: "text", text: JSON.stringify(animateGeometry(lesson, params)) }] };
  },
);

server.tool(
  "set_semantic_colors",
  "Split a write action into per-symbol painted MathExpr colors",
  {
    lesson: lessonSchema, chapterId: z.string().optional(), actionId: z.string(),
    colors: z.record(z.string(), z.enum(["black", "blue", "red", "green", "orange", "grey"])),
    color: z.enum(["black", "blue", "red", "green", "orange", "grey"]).optional(),
  },
  async (args) => {
    const { lesson, ...params } = args as { lesson: unknown } & Parameters<typeof setSemanticColors>[1];
    return { content: [{ type: "text", text: JSON.stringify(setSemanticColors(lesson, params)) }] };
  },
);

server.tool(
  "plan_lesson_scenes",
  "Validate/normalize a lesson plan (checks ids, tricks, scene refs, budgets)",
  { plan: z.any() },
  async (args) => ({ content: [{ type: "text", text: JSON.stringify(planLessonScenes(args)) }] }),
);

server.tool(
  "direct_scene",
  "Lower a ScenePlan into timed lesson actions with budget scaling and contrast QA",
  { scene: sceneSchema, seed: z.number().optional() },
  async (args) => ({ content: [{ type: "text", text: JSON.stringify(directSceneTool(args)) }] }),
);

server.tool(
  "auto_layout_scene",
  "Direct a scene and report overlaps/out-of-frame regions plus per-beat frames",
  { scene: sceneSchema, seed: z.number().optional() },
  async (args) => ({ content: [{ type: "text", text: JSON.stringify(autoLayoutScene(args)) }] }),
);

server.tool(
  "validate_scene_layout",
  "Static QA: overlap/clipping/contrast/reading-order for a compiled chapter lesson",
  { lesson: lessonSchema, chapterId: z.string().optional() },
  async (args) => ({ content: [{ type: "text", text: JSON.stringify(validateSceneLayout(args)) }] }),
);

server.tool(
  "reframe_camera",
  "Append a context-preserving camera frame over bounds or measured actions",
  {
    lesson: lessonSchema, chapterId: z.string().optional(), at: z.number(), duration: z.number().optional(),
    bounds: z.object({ x: z.number(), y: z.number(), w: z.number(), h: z.number() }).optional(),
    actionIds: z.array(z.string()).optional(), margin: z.number().optional(),
  },
  async (args) => {
    const { lesson, ...params } = args as { lesson: unknown } & Parameters<typeof reframeCamera>[1];
    return { content: [{ type: "text", text: JSON.stringify(reframeCamera(lesson, params)) }] };
  },
);

server.tool(
  "align_narration",
  "Synthesize Indonesian narration (measured durations) and warp visuals to fit",
  { lesson: lessonSchema, outputDir: z.string().optional(), voice: z.string().optional(), rate: z.string().optional(), applySpeechRules: z.boolean().optional(), regenerate: z.boolean().optional() },
  async (args) => {
    const { lesson, ...params } = args as { lesson: unknown } & Omit<Parameters<typeof alignNarrationTool>[0], "lesson">;
    return { content: [{ type: "text", text: JSON.stringify(await alignNarrationTool({ lesson, ...params })) }] };
  },
);

server.tool(
  "inspect_timeline",
  "Summarize a lesson timeline: actions, narrations, cues, measured vs estimated",
  { lesson: lessonSchema },
  async (args) => ({ content: [{ type: "text", text: JSON.stringify(inspectTimeline(args.lesson)) }] }),
);

server.tool(
  "run_visual_qa",
  "Static visual QA: layout issues, narration coverage, camera coverage",
  { lesson: lessonSchema, chapterId: z.string().optional(), minContrast: z.number().optional() },
  async (args) => ({ content: [{ type: "text", text: JSON.stringify(runVisualQa(args)) }] }),
);

server.tool(
  "render_lesson_preview",
  "Render 1-12 preview frames (ms timestamps) via the real headless studio",
  { lesson: lessonSchema, timesMs: z.array(z.number()).min(1).max(12), outDir: z.string().optional(), timeoutMs: z.number().optional() },
  async (args) => ({ content: [{ type: "text", text: JSON.stringify(await renderLessonPreview(args)) }] }),
);

const transport = new StdioServerTransport();
await server.connect(transport);
