import { readFile, writeFile, readdir, mkdir, rename } from "node:fs/promises";
import { createHash } from "node:crypto";
import { parseRecording } from "../src/engine/schema";
import { segmentInput, canonical } from "../src/engine/segment-input";
const dir = process.argv[2] ?? "output/render-cache-v3",
  oldFile = process.argv[3] ?? `${dir}/previous.recording.json`,
  newFile = process.argv[4] ?? "public/flagship.recording.json";
const oldText = await readFile(oldFile, "utf8"),
  newText = await readFile(newFile, "utf8"),
  oldR = parseRecording(JSON.parse(oldText)),
  newR = parseRecording(JSON.parse(newText)),
  signature = JSON.parse(await readFile(`${dir}/signature.json`, "utf8"));
const hash = (input: string | Buffer) =>
  createHash("sha256").update(input).digest("hex");
if (signature.hash !== hash(oldText))
  throw Error("Old recording does not match the cache signature");
const moved = `${dir}/superseded`;
await mkdir(moved, { recursive: true });
const results: unknown[] = [];
for (const name of (await readdir(dir))
  .filter((n) => /^\d+\.mp4\.json$/.test(n))
  .sort()) {
  const meta = JSON.parse(await readFile(`${dir}/${name}`, "utf8")),
    file = name.slice(0, -5),
    oldInput = hash(
      canonical(segmentInput(oldR, meta.first, meta.frames, signature.fps)),
    ),
    newInput = hash(
      canonical(segmentInput(newR, meta.first, meta.frames, signature.fps)),
    );
  const verified = hash(await readFile(`${dir}/${file}`)) === meta.sha256,
    same = verified && oldInput === newInput;
  if (!same) {
    await rename(`${dir}/${file}`, `${moved}/${file}`);
    await rename(`${dir}/${name}`, `${moved}/${name}`);
  } else {
    meta.inputSha256 = newInput;
    await writeFile(`${dir}/${name}`, JSON.stringify(meta));
  }
  results.push({
    first: meta.first,
    frames: meta.frames,
    retained: same,
    oldInputSha256: oldInput,
    newInputSha256: newInput,
  });
  console.log(same ? "Retain" : "Rebuild", meta.first);
}
signature.hash = hash(newText);
await writeFile(`${dir}/signature.json`, JSON.stringify(signature));
await writeFile(
  "output/cache-reuse-validation.json",
  JSON.stringify(
    {
      method:
        "Exact canonical native state/event/camera inputs plus chunk file SHA256",
      oldRecordingSha256: hash(oldText),
      newRecordingSha256: hash(newText),
      results,
    },
    null,
    2,
  ),
);
