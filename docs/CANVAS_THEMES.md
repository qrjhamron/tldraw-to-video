# Canvas themes

Four page backgrounds (`src/story/canvas-themes.ts`):

- `whiteboard`: clean whiteboard (lesson default).
- `graph`: academic graph paper, minor/major grid.
- `notebook`: ruled lines plus red margin.
- `darkboard`: minimal dark board with faint grid.

Grids and rules are camera-anchored: they move with the infinite canvas and
stay stable under seeking. Rendering is deterministic (`paintCanvasTheme`).

## Transitions without rebuild

- Lessons declare a default via `canvasTheme`.
- `setCanvas` actions append `theme` events to the recording at their timestamp;
  `themeAt(recording, t)` evaluates them, so seeking, replay, and export follow
  theme switches with no recompilation of shapes.
- `set_canvas_style` (MCP) sets the lesson default or appends a `setCanvas`
  action. Recording schema v1 accepts `theme` events and `canvasTheme`
  metadata; older recordings without them render as whiteboard.

The flagship uses notebook for the history chapter, graph paper for the
derivation chapters (limits through the fundamental theorem), and whiteboard
for the opening and final challenge.
