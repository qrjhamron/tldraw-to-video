import { mkdir, writeFile } from "node:fs/promises";
import { openStudio } from "./browser";

// Strike-visible window (from prior evidence, aligned timing unchanged for c4),
// plus history portrait mid-reveal.
await mkdir("output/flagship-inspection/handwriting-detail", { recursive: true });
const session = await openStudio("?export=1&offline=1");
try {
  for (const t of [86000, 90000, 232896, 441572]) {
    const jpeg = await session.page.evaluate(
      (t) => window.studio!.renderFrame(t),
      t,
    );
    await writeFile(
      `output/flagship-inspection/handwriting-detail/spot-${t}.jpg`,
      Buffer.from(jpeg.split(",")[1], "base64"),
    );
    console.log("saved", t);
  }
  if (session.errors.length) throw Error(session.errors.join("\n"));
} finally {
  await session.close();
}
