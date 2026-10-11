import { writeFile } from "node:fs/promises";
import { openStudio } from "./browser";
const session = await openStudio("?export=1&offline=1"),
  { page } = session;
try {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Profiler.enable");
  await cdp.send("Profiler.start");
  const start = Date.now();
  for (let i = 0; i < 30; i++)
    await page.evaluate(
      (t) => window.studio!.renderFrame(t),
      30000 + (i * 1000) / 30,
    );
  const { profile } = await cdp.send("Profiler.stop");
  await writeFile("output/render-profile.json", JSON.stringify(profile));
  console.log("30 frames:", Date.now() - start, "ms");
  const hit = new Map<string, number>();
  for (const node of profile.nodes) {
    const label =
      node.callFrame.functionName + " " + node.callFrame.url.split("/").at(-1);
    hit.set(label, (hit.get(label) ?? 0) + (node.hitCount ?? 0));
  }
  console.log([...hit].sort((a, b) => b[1] - a[1]).slice(0, 20));
} finally {
  await session.close();
}
