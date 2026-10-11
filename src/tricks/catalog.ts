import type { Trick } from "./types";
import { CHAPTER_1 } from "./ch1";
import { CHAPTER_2 } from "./ch2";
import { CHAPTER_3 } from "./ch3";
import { CHAPTER_4 } from "./ch4";
import { CHAPTER_5 } from "./ch5";

export type { Trick } from "./types";
export { trickToScene } from "./types";

/** All 50 tricks in chapter order. */
export const ALL_TRICKS: Trick[] = [...CHAPTER_1, ...CHAPTER_2, ...CHAPTER_3, ...CHAPTER_4, ...CHAPTER_5];

export const CHAPTERS: { chapter: number; title: string; tricks: Trick[] }[] = [
  { chapter: 1, title: "Aritmetika dan berhitung cepat", tricks: CHAPTER_1 },
  { chapter: 2, title: "Pecahan, akar, dan pangkat", tricks: CHAPTER_2 },
  { chapter: 3, title: "Aljabar dan persamaan", tricks: CHAPTER_3 },
  { chapter: 4, title: "Pola, geometri, dan teori bilangan", tricks: CHAPTER_4 },
  { chapter: 5, title: "Pangkat, fungsi, dan kalkulus pengantar", tricks: CHAPTER_5 },
];
