import type { Camera } from "../engine/schema";
export function frameBounds(
  bounds: { x: number; y: number; w: number; h: number },
  viewport = { width: 1920, height: 1080 },
  margin = 64,
): Camera {
  if (
    bounds.w <= 0 ||
    bounds.h <= 0 ||
    margin < 0 ||
    margin * 2 >= Math.min(viewport.width, viewport.height)
  )
    throw Error("Invalid framing bounds");
  const z = Math.min(
    (viewport.width - 2 * margin) / bounds.w,
    (viewport.height - 2 * margin) / bounds.h,
  );
  return {
    x: viewport.width / (2 * z) - (bounds.x + bounds.w / 2),
    y: viewport.height / (2 * z) - (bounds.y + bounds.h / 2),
    z,
  };
}
export function screenPoint(c: Camera, p: { x: number; y: number }) {
  return { x: (p.x + c.x) * c.z, y: (p.y + c.y) * c.z };
}
