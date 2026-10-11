import assert from "node:assert/strict";
import { test } from "node:test";
import {
  numberWordsId,
  speakMath,
  splitSentences,
  alignCues,
  DEFAULT_NARRATION,
} from "../src/audio/speech";
import type { AudioClip } from "../src/audio/timeline";

test("Indonesian number words cover special forms", () => {
  assert.equal(numberWordsId(0), "nol");
  assert.equal(numberWordsId(10), "sepuluh");
  assert.equal(numberWordsId(11), "sebelas");
  assert.equal(numberWordsId(12), "dua belas");
  assert.equal(numberWordsId(25), "dua puluh lima");
  assert.equal(numberWordsId(100), "seratus");
  assert.equal(numberWordsId(125), "seratus dua puluh lima");
  assert.equal(numberWordsId(1000), "seribu");
  assert.equal(numberWordsId(2026), "dua ribu dua puluh enam");
  assert.equal(numberWordsId(1000000), "satu juta");
  assert.equal(numberWordsId(-5), "negatif lima");
  assert.throws(() => numberWordsId(1.5), /integer/);
});

test("math reading rules preserve meaning in words", () => {
  assert.equal(speakMath("x²"), "x kuadrat");
  assert.equal(speakMath("2³"), "dua pangkat tiga");
  assert.equal(
    speakMath("√144"),
    "akar kuadrat dari seratus empat puluh empat",
  );
  assert.equal(speakMath("∫ 2x dx"), "integral dua x terhadap x");
  assert.equal(speakMath("SPLDV"), "sistem persamaan linear dua variabel");
  assert.equal(speakMath("a% dari b = b% dari a"), "a persen dari b sama dengan b persen dari a");
  assert.equal(speakMath("hasilnya 125"), "hasilnya seratus dua puluh lima");
  assert.equal(speakMath("x²", { spellNumbers: false }), "x kuadrat");
  assert.equal(
    speakMath("hitung FPB dan KPK", { dictionary: { hitung: "hitunglah" } }).slice(0, 8),
    "hitungla",
  );
});

test("sentence splitter keeps pause planning units", () => {
  assert.deepEqual(splitSentences("Halo. Apa kabar? Baik!"), ["Halo.", "Apa kabar?", "Baik!"]);
  assert.deepEqual(splitSentences("Tanpa akhir"), ["Tanpa akhir"]);
});

test("cue alignment reports measured vs estimated honestly", () => {
  const clip: AudioClip = {
    id: "n1",
    provider: "edge",
    voice: "v",
    file: "f",
    durationMs: 4000,
    sha256: "x",
    words: [
      { offsetMs: 0, durationMs: 500, text: "Perhatikan" },
      { offsetMs: 500, durationMs: 400, text: "angka" },
      { offsetMs: 900, durationMs: 600, text: "sembilan." },
    ],
  };
  const text = "Perhatikan angka sembilan.";
  const [hit, miss] = alignCues(["angka sembilan", "tidak ada"], clip, 10000, text);
  assert.equal(hit.measured, true);
  assert.equal(hit.tMs, 10500);
  assert.equal(miss.measured, false);
  assert.ok(miss.tMs >= 10000 && miss.tMs <= 14000);
  // No provider words → everything estimated, never measured.
  const [est] = alignCues(["angka"], { ...clip, words: [] }, 0, text);
  assert.equal(est.measured, false);
});

test("default narration keeps the Indonesian voice", () => {
  assert.equal(DEFAULT_NARRATION.voice, "id-ID-GadisNeural");
  assert.equal(DEFAULT_NARRATION.rules.spellNumbers, true);
});
