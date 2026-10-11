/** Narration director: Indonesian math speech, cues, and timing honesty.
 *
 * - numberWordsId: integers → Indonesian words (seratus, dua belas, ribu…).
 * - speakMath: mathematical reading rules (x² → "x kuadrat", √144 → …).
 * - alignCues: match cue phrases against measured TTS word boundaries when
 *   the exact words exist; otherwise fall back to an explicitly ESTIMATED
 *   position. Estimated timestamps are never reported as measured.
 */
import type { AudioClip } from "./timeline";

const ONES = [
  "",
  "satu",
  "dua",
  "tiga",
  "empat",
  "lima",
  "enam",
  "tujuh",
  "delapan",
  "sembilan",
];
function under100(n: number): string {
  if (n < 10) return ONES[n];
  if (n === 10) return "sepuluh";
  if (n === 11) return "sebelas";
  if (n < 20) return `${ONES[n - 10]} belas`;
  const t = Math.floor(n / 10),
    r = n % 10;
  return r === 0 ? `${ONES[t]} puluh` : `${ONES[t]} puluh ${ONES[r]}`;
}
function under1000(n: number): string {
  if (n < 100) return under100(n);
  const h = Math.floor(n / 100),
    r = n % 100;
  const head = h === 1 ? "seratus" : `${ONES[h]} ratus`;
  return r === 0 ? head : `${head} ${under100(r)}`;
}
/** Integer → Indonesian words. Supports |n| < 1e12. */
export function numberWordsId(n: number): string {
  if (!Number.isInteger(n) || Math.abs(n) >= 1e12)
    throw Error("numberWordsId needs an integer with |n| < 1e12");
  if (n === 0) return "nol";
  if (n < 0) return `negatif ${numberWordsId(-n)}`;
  if (n < 1000) return under1000(n);
  const scales: [number, string][] = [
    [1e9, "miliar"],
    [1e6, "juta"],
    [1e3, "ribu"],
  ];
  for (const [value, name] of scales) {
    if (n >= value) {
      const q = Math.floor(n / value),
        r = n % value;
      const head =
        value === 1e3 && q === 1 ? "seribu" : `${numberWordsId(q)} ${name}`;
      return r === 0 ? head : `${head} ${numberWordsId(r)}`;
    }
  }
  throw Error("unreachable");
}

const GREEK: Record<string, string> = {
  α: "alfa",
  β: "beta",
  γ: "gama",
  δ: "delta",
  θ: "teta",
  λ: "lamda",
  μ: "mu",
  π: "pi",
  ρ: "ro",
  σ: "sigma",
  φ: "fi",
  ω: "omega",
  Δ: "delta",
  Σ: "sigma",
  θ2: "teta",
};
const SUPERSCRIPT: Record<string, string> = {
  "²": "kuadrat",
  "³": "pangkat tiga",
  "⁴": "pangkat empat",
  "⁰": "pangkat nol",
  "¹": "pangkat satu",
  "⁵": "pangkat lima",
  "⁶": "pangkat enam",
  "⁷": "pangkat tujuh",
  "⁸": "pangkat delapan",
  "⁹": "pangkat sembilan",
};

export interface SpeechRules {
  /** Pronunciation dictionary applied first (exact substring match). */
  dictionary?: Record<string, string>;
  /** Spell integers as words (default true). */
  spellNumbers?: boolean;
}

/** Apply mathematical reading rules to narration text (meaning-preserving). */
export function speakMath(text: string, rules: SpeechRules = {}): string {
  let out = ` ${text} `;
  if (rules.dictionary)
    for (const [from, to] of Object.entries(rules.dictionary))
      out = out.split(from).join(to);
  // Acronyms and named methods.
  out = out
    .split("SPLDV")
    .join("sistem persamaan linear dua variabel")
    .split("FPB")
    .join("faktor persekutuan terbesar")
    .split("KPK")
    .join("kelipatan persekutuan terkecil");
  // Integrals: ∫ <body> dx → "integral <body> terhadap x".
  out = out.replace(/∫\s*([^∫]+?)\s*dx\b/g, (_m, body) => `integral ${body} terhadap x`);
  // Square roots: √144 / √(x+1) → "akar kuadrat dari …".
  out = out.replace(/√\s*\(?([^√()]+?)\)?(?=[\s,.;:?!]|$)/g, (_m, body) => `akar kuadrat dari ${body}`);
  // Caret powers: x^2, 2^3, x^n.
  out = out.replace(
    /([A-Za-z\)\d])\s*\^\s*(\d+|[A-Za-z])/g,
    (_m, base, exp) => {
      if (exp === "2") return `${base} kuadrat`;
      if (exp === "3") return `${base} pangkat tiga`;
      return `${base} pangkat ${exp}`;
    },
  );
  // Unicode superscripts attached to a base.
  for (const [sup, words] of Object.entries(SUPERSCRIPT))
    out = out.split(sup).join(` ${words}`);
  // Fractions a/b → "a per b".
  out = out.replace(/(\d+)\s*\/\s*(\d+)/g, "$1 per $2");
  // Operators and symbols.
  const ops: [RegExp, string][] = [
    [/×/g, " kali "],
    [/÷/g, " bagi "],
    [/≠/g, " tidak sama dengan "],
    [/≈/g, " kira-kira "],
    [/≤/g, " kurang dari atau sama dengan "],
    [/≥/g, " lebih dari atau sama dengan "],
    [/↔/g, " berhubungan dengan "],
    [/→/g, " menjadi "],
    [/∞/g, " tak hingga "],
    [/±/g, " plus minus "],
    [/\*/g, " kali "],
    [/([^a-zA-Z])\/([^a-zA-Z])/g, "$1 per $2"],
  ];
  for (const [re, words] of ops) out = out.replace(re, words);
  out = out.replace(/=/g, " sama dengan ").replace(/%/g, " persen ");
  for (const [g, words] of Object.entries(GREEK))
    out = out.split(g).join(` ${words} `);
  // Separate coefficients from symbols (2x → 2 x) before spelling.
  out = out.replace(/(\d)(?=[A-Za-z])/g, "$1 ").replace(/([A-Za-z])(?=\d)/g, "$1 ");
  // Bare integers → words (keeps decimals like 2.667 digit-by-digit safe: skip).
  if (rules.spellNumbers !== false) {
    out = out.replace(/(?<![\d.])(\d{1,9})(?![\d.])/g, (m) => {
      try {
        return numberWordsId(Number(m));
      } catch {
        return m;
      }
    });
  }
  return out.replace(/\s+/g, " ").trim();
}

export interface NarrationSegment {
  clipId: string;
  text: string;
  /** Scene/beat-local start offset in the authored (pre-warp) timeline. */
  atMs: number;
}
export interface AlignedCue {
  phrase: string;
  /** Absolute ms in the authored timeline. */
  tMs: number;
  clipId: string;
  measured: boolean;
}

/** Split narration into sentences (keeps delimiters for pause planning). */
export function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?…])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Normalize for word matching: lowercase, strip punctuation. */
function wordsOf(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter(Boolean);
}

/**
 * Align cue phrases to a clip. Exact word-subsequence matches against measured
 * provider boundaries yield measured:true; anything else is estimated by
 * character proportion and flagged measured:false.
 */
export function alignCues(
  phrases: string[],
  clip: AudioClip,
  clipStartMs: number,
  clipText: string,
): AlignedCue[] {
  const clipWords = (clip.words ?? []).flatMap((w) => wordsOf(w.text));
  // Map word index → boundary for measured hits.
  const boundaries = clip.words ?? [];
  const wordToBoundary: number[] = [];
  {
    let bi = 0;
    for (const b of boundaries) {
      const n = Math.max(1, wordsOf(b.text).length);
      for (let k = 0; k < n; k++) wordToBoundary.push(bi);
      bi++;
    }
  }
  return phrases.map((phrase) => {
    const pw = wordsOf(phrase);
    let measured: AlignedCue | null = null;
    if (pw.length > 0 && clipWords.length > 0) {
      outer: for (let i = 0; i + pw.length <= clipWords.length; i++) {
        for (let j = 0; j < pw.length; j++)
          if (clipWords[i + j] !== pw[j]) continue outer;
        const b = boundaries[wordToBoundary[i]];
        measured = {
          phrase,
          tMs: Math.round(clipStartMs + b.offsetMs),
          clipId: clip.id,
          measured: true,
        };
        break;
      }
    }
    if (measured) return measured;
    const idx = clipText.toLowerCase().indexOf(phrase.toLowerCase());
    const frac = idx < 0 ? 0.5 : idx / Math.max(1, clipText.length);
    return {
      phrase,
      tMs: Math.round(clipStartMs + clip.durationMs * frac),
      clipId: clip.id,
      measured: false,
    };
  });
}

export interface NarrationConfig {
  voice?: string;
  rate?: string;
  /** Extra pause appended after ask/pause beats (ms of silence attribution). */
  thinkingPauseMs?: number;
  rules?: SpeechRules;
}
export const DEFAULT_NARRATION: Required<NarrationConfig> = {
  voice: "id-ID-GadisNeural",
  rate: "+15%",
  thinkingPauseMs: 1800,
  rules: { spellNumbers: true },
};
