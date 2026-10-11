import {
  fraction,
  mathLayout,
  row,
  script,
  type MathExpr,
} from "../handwriting/math-layout";
import type { Graph } from "../math/geometry";
import type { FunctionModel } from "../math/models";
import type { Action, Chapter, Lesson } from "./types";
const square: FunctionModel = { kind: "polynomial", coefficients: [0, 0, 1] };
const linear: FunctionModel = { kind: "polynomial", coefficients: [0, 1] };
const velocity: FunctionModel = { kind: "polynomial", coefficients: [0, 2] };
const area: FunctionModel = { kind: "polynomial", coefficients: [0, 0, 0.5] };
let serial = 0;
function chapter(
  id: string,
  title: string,
  start: number,
  duration: number,
  index: number,
  objectives: string[],
): Chapter {
  return {
    id,
    title,
    start: start * 1000,
    duration: duration * 1000,
    origin: { x: index * 1900, y: 0 },
    objectives,
    actions: [],
  };
}
function add(
  c: Chapter,
  type: Action["type"],
  at: number,
  duration: number,
  data: object,
): string {
  const id = `${c.id}-${serial++}`;
  c.actions.push({
    id,
    type,
    at: at * 1000,
    duration: duration * 1000,
    ...data,
  } as Action);
  return id;
}
function write(
  c: Chapter,
  content: MathExpr,
  x: number,
  y: number,
  at: number,
  duration: number,
  height = 34,
  color: "black" | "blue" | "red" | "orange" = "black",
  group?: string,
  maxWidth = 1560 - x,
) {
  return add(c, "write", at, duration, {
    content,
    x,
    y,
    height,
    color,
    group,
    maxWidth,
  });
}
function say(
  c: Chapter,
  at: number,
  duration: number,
  text: string,
  visual?: string,
) {
  add(c, "narrate", at, duration, { text, visual });
}
function frame(
  c: Chapter,
  at = 0,
  duration = 2.8,
  bounds = { x: 0, y: 0, w: 1640, h: 920 },
) {
  add(c, "moveCamera", at, duration, { bounds });
}
function header(c: Chapter, title: string) {
  frame(c);
  write(c, title, 80, 50, 3, 4, 42, "blue");
  add(c, "underline", 7.2, 0.8, { x: 80, y: 118, width: 1480 });
}
const graph = (xMin = 0, xMax = 4, yMin = 0, yMax = 16): Graph => ({
  x: 145,
  y: 330,
  width: 630,
  height: 420,
  xMin,
  xMax,
  yMin,
  yMax,
});
function chart(c: Chapter, g: Graph, fn: FunctionModel, at: number) {
  add(c, "drawAxes", at, 3, { graph: g });
  add(c, "drawGraph", at + 3.3, 3, { graph: g, fn });
}
/** Content only. No editor, browser, encoder, or RAF dependency. Times in helpers are seconds. */
export function flagshipLesson(): Lesson {
  serial = 0;
  const c1 = chapter("motion", "1 · Masalah perubahan", 0, 65, 0, [
    "Membedakan kecepatan rata-rata dan sesaat",
    "Membaca grafik posisi terhadap waktu",
  ]);
  header(c1, "KALKULUS: MEMAHAMI PERUBAHAN");
  write(c1, "Kecepatan mobil tepat pada satu detik?", 80, 160, 8.2, 5, 36);
  say(
    c1,
    0,
    18,
    "Bayangkan sebuah mobil yang mulai bergerak. Bagaimana kita mengetahui kecepatannya tepat pada detik tertentu? Jarak total dibagi waktu memberi kecepatan rata-rata. Tetapi rata-rata tidak menceritakan setiap saat dalam perjalanan.",
  );
  const car = [
    [
      [0, 30],
      [15, 30],
      [30, 5],
      [80, 5],
      [105, 30],
      [125, 30],
      [125, 55],
      [0, 55],
      [0, 30],
    ],
    Array.from({ length: 21 }, (_, i) => [
      25 + 11 * Math.cos((i * Math.PI) / 10),
      55 + 11 * Math.sin((i * Math.PI) / 10),
    ]),
    Array.from({ length: 21 }, (_, i) => [
      100 + 11 * Math.cos((i * Math.PI) / 10),
      55 + 11 * Math.sin((i * Math.PI) / 10),
    ]),
  ];
  add(c1, "moveObject", 14, 12, {
    points: car.map((p) => p.map(([x, y]) => [x + 170, y + 220])),
    dx: 450,
    dy: 0,
    color: "blue",
    motion: { fn: square, from: 0, to: 4 },
  });
  const g1 = graph();
  chart(c1, g1, square, 18);
  write(c1, "posisi s (m)", 140, 286, 25, 2, 26);
  write(c1, "waktu t (s)", 500, 790, 27, 2, 26);
  write(c1, "s(t) = t^2", 920, 300, 29, 3, 38, "blue");
  say(
    c1,
    20,
    19,
    "Model sederhana kita adalah posisi sama dengan waktu kuadrat. Kurvanya makin curam. Mobil menempuh jarak lebih besar pada selang waktu yang sama. Jadi kecepatannya berubah, meskipun kita belum punya rumus kecepatan sesaat.",
  );
  add(c1, "plotPoint", 33, 1, { graph: g1, x: 1, y: 1, label: "(1,1)" });
  add(c1, "plotPoint", 34.5, 1, { graph: g1, x: 3, y: 9, label: "(3,9)" });
  write(c1, "Selang 1 sampai 3 detik:", 920, 390, 36, 3, 29);
  write(
    c1,
    row("v rata-rata =", fraction("9 - 1", "3 - 1")),
    920,
    453,
    40,
    5,
    30,
  );
  write(c1, "= 4 m/s", 1100, 585, 46, 2, 38, "orange");
  say(
    c1,
    40,
    19,
    "Antara detik satu dan tiga, posisi berubah dari satu menjadi sembilan meter. Delapan meter dalam dua detik berarti rata-rata empat meter per detik. Tapi pada detik dua, apakah nilainya juga empat? Kita perlu memperkecil selang waktu, bukan sekadar menghitung perjalanan penuh.",
  );
  write(c1, "Bagaimana jika selangnya mengecil?", 80, 856, 51, 5, 34, "red");
  add(c1, "pause", 57, 5, {
    reason: "Bandingkan kecepatan rata-rata dengan pertanyaan sesaat",
  });

  const c2 = chapter("history", "2 · Ide yang bertumbuh", 65, 45, 1, [
    "Memahami kontribusi Newton dan Leibniz tanpa mitos penemu tunggal",
  ]);
  header(c2, "IDE YANG BERTUMBUH");
  write(c2, "Tangen, luas, dan gerak", 80, 170, 9, 4, 40);
  say(
    c2,
    2,
    18,
    "Pertanyaan tentang gerak dan luas sudah lama menarik perhatian para matematikawan. Metode tangen, luas, dan gagasan besaran sangat kecil berkembang sebelum kalkulus modern. Fermat, Cavalieri, dan Barrow termasuk bagian dari perjalanan itu.",
  );
  write(c2, "Fermat · Cavalieri · Barrow", 80, 265, 14, 4, 36);
  add(c2, "draw", 19, 1, {
    points: [
      [
        [80, 345],
        [1500, 345],
      ],
      [
        [400, 335],
        [400, 355],
      ],
      [
        [980, 335],
        [980, 355],
      ],
    ],
    color: "orange",
  });
  write(c2, "Newton", 130, 410, 21, 2.5, 46, "blue");
  write(c2, "Leibniz", 920, 410, 24, 2.5, 46, "blue");
  write(c2, "Gerak dan laju perubahan", 130, 505, 27, 3.5, 30);
  write(c2, "Notasi dan metode umum", 920, 505, 30.5, 3.5, 29);
  say(
    c2,
    21,
    21,
    "Pada abad ketujuh belas, Isaac Newton dan Gottfried Wilhelm Leibniz mengembangkan pendekatan kalkulus secara independen. Newton banyak memikirkan gerak dan perubahan. Leibniz membangun notasi yang sangat berguna. Kerja mereka menghubungkan masalah-masalah ini dalam metode umum, di atas fondasi para pendahulu.",
  );
  write(c2, "Perubahan ↔ akumulasi", 430, 660, 35, 4, 44, "red");
  write(c2, "Satu bahasa untuk gerak dan geometri.", 180, 796, 39.5, 3, 32);

  const c3 = chapter("limits", "3 · Mendekati, bukan membagi nol", 110, 75, 2, [
    "Memahami limit lewat sekan yang mendekati tangen",
    "Membedakan pendekatan dengan substitusi nol",
  ]);
  header(c3, "LIMIT: APA YANG DIDEKATI?");
  const g3 = graph(0, 3, 0, 9);
  chart(c3, g3, square, 9);
  write(c3, "f(x) = x^2", 930, 170, 10, 3, 40, "blue");
  add(c3, "plotPoint", 17, 1, { graph: g3, x: 1, y: 1, label: "P(1,1)" });
  write(c3, "P tetap. Q bergerak.", 930, 270, 18, 3, 30);
  write(c3, "Sekan: dua titik", 930, 335, 23, 3, 34, "orange");
  say(
    c3,
    9,
    18,
    "Sekarang lihat parabola. Titik P tetap di satu koma satu. Titik Q berada pada kurva di sebelah kanannya. Garis melalui dua titik itu adalah sekan. Kemiringannya mengukur perubahan rata-rata antara P dan Q.",
  );
  const sec = add(c3, "animateSecant", 27, 29, {
    graph: g3,
    fn: square,
    x: 1,
    from: 2.7,
    to: 1.005,
    labelX: 960,
    labelY: 580,
  });
  write(c3, "Q makin dekat ke P", 930, 410, 29, 3, 30);
  write(c3, "Selang makin kecil", 930, 476, 35, 3, 30);
  say(
    c3,
    28,
    22,
    "Perhatikan Q bergerak mendekati P. Garis sekan berputar, lalu makin mirip sebuah garis tertentu. Kemiringan mendekati dua. Limit berbicara tentang nilai yang didekati, ketika selangnya makin kecil. Kita tidak perlu menempatkan dua titik berbeda di posisi yang persis sama.",
  );
  add(c3, "erase", 57, 1, { target: sec });
  add(c3, "animateTangent", 59, 2, {
    graph: g3,
    fn: square,
    x: 1,
    triangle: 1,
  });
  write(c3, "Tangen: laju sesaat", 930, 675, 59, 4, 30, "red");
  write(c3, "Δx = 1   Δy = 2", 290, 845, 63, 3, 30, "red");
  say(
    c3,
    53,
    19,
    "Garis batas itu adalah tangen. Di titik P, kemiringannya dua: bergerak satu satuan ke kanan pada garis tangen berarti naik dua. Ini intuisi laju sesaat. Pada langkah berikutnya kita akan membuktikannya, sambil memastikan tidak pernah membagi dengan nol.",
  );

  const c4 = chapter("derivative", "4 · Turunan dari definisi", 185, 95, 3, [
    "Menurunkan x kuadrat dari hasil bagi selisih",
    "Menjelaskan pembatalan h untuk h bukan nol",
    "Menafsirkan turunan sebagai kemiringan",
  ]);
  header(c4, "TURUNAN: DARI RATA-RATA KE SESAAT");
  write(c4, "f(x) = x^2", 80, 160, 9, 3, 40, "blue");
  const def = row("f'(x) =", {
    type: "limit",
    under: "h → 0",
    body: fraction("f(x+h) - f(x)", "h"),
  });
  write(c4, def, 80, 255, 14, 8, 38);
  write(c4, "h ≠ 0", 1310, 325, 22, 2, 30, "red");
  say(
    c4,
    10,
    22,
    "Kita tulis rata-rata perubahan sebagai selisih nilai fungsi dibagi selisih masukan. Masukan bertambah h, jadi selisihnya h. Turunan adalah limit hasil bagi ini saat h mendekati nol. Selama menyederhanakan, h tetap bukan nol.",
  );
  const expansion = "expansion";
  write(
    c4,
    row("q(h) =", fraction("(x+h)^2 - x^2", "h")),
    80,
    460,
    26,
    7,
    36,
    "black",
    expansion,
  );
  write(
    c4,
    row("q(h) =", fraction("x^2 + 2xh + h^2 - x^2", "h")),
    80,
    635,
    35,
    8,
    36,
    "black",
    expansion,
  );
  say(
    c4,
    32,
    19,
    "Untuk fungsi kuadrat, gantikan nilai fungsi dengan rumusnya. Kuadrat dari x tambah h adalah x kuadrat tambah dua x h tambah h kuadrat. Ini berasal dari mengalikan x tambah h dengan dirinya sendiri. Kedua suku x kuadrat kemudian saling menghapus.",
  );
  // Locate the cancellable x² terms from the same vector layout, rather than fixed pixels.
  const expandedIndex = c4.actions.findIndex(
    (a) =>
      a.type === "write" &&
      typeof a.content === "object" &&
      a.content.type === "row" &&
      JSON.stringify(a.content).includes("x^2 + 2xh"),
  );
  const cancellationStyle = {
    seed:
      20261011 +
      (c1.actions.length +
        c2.actions.length +
        c3.actions.length +
        expandedIndex +
        1) *
        271,
    height: 36,
  };
  const numeratorText = "x^2 + 2xh + h^2 - x^2";
  const equationLayout = mathLayout(
    row("q(h) =", fraction(numeratorText, "h")),
    cancellationStyle,
  );
  const prefixCount = mathLayout("q(h) =", cancellationStyle).paths.length;
  const numeratorCount = mathLayout(numeratorText, cancellationStyle).paths
    .length;
  const termCount = mathLayout("x^2", cancellationStyle).paths.length;
  const xCount = mathLayout("x", cancellationStyle).paths.length;
  const strikeTerm = (start: number) => {
    const term = equationLayout.paths
      .slice(start, start + termCount)
      .flatMap((p) => p.points);
    const glyph = equationLayout.paths
      .slice(start, start + xCount)
      .flatMap((p) => p.points);
    const xMin = Math.min(...term.map((p) => p.x)),
      xMax = Math.max(...term.map((p) => p.x)),
      y =
        (Math.min(...glyph.map((p) => p.y)) +
          Math.max(...glyph.map((p) => p.y))) /
        2;
    return [
      [80 + xMin - 4, 635 + y],
      [80 + xMax + 4, 635 + y],
    ];
  };
  add(c4, "draw", 45, 1, {
    points: [
      strikeTerm(prefixCount),
      strikeTerm(prefixCount + numeratorCount - termCount),
    ],
    color: "red",
    group: expansion,
  });
  write(
    c4,
    "(x+h)(x+h) = x^2 + 2xh + h^2",
    700,
    850,
    46,
    4,
    26,
    "black",
    expansion,
  );
  add(c4, "erase", 52, 3, { target: expansion });
  write(
    c4,
    row(
      "q(h) =",
      fraction("2xh + h^2", "h"),
      "=",
      fraction("h(2x+h)", "h"),
      "= 2x + h",
    ),
    80,
    485,
    56,
    9,
    34,
  );
  say(
    c4,
    54,
    20,
    "Pembilang yang tersisa adalah dua x h tambah h kuadrat. Keduanya memiliki faktor h. Karena h bukan nol, kita boleh membagi pembilang dan penyebut dengan h. Hasilnya dua x tambah h. Barulah sekarang ambil limit: ketika h mendekati nol, hasilnya mendekati dua x.",
  );
  write(c4, "f'(x) = 2x", 80, 740, 71, 4, 52, "red");
  add(c4, "underline", 75.5, 1, { x: 80, y: 825, width: 600, color: "red" });
  write(c4, "x = 3 → f'(3) = 6", 900, 765, 77, 4, 32, "red");
  say(
    c4,
    76,
    17,
    "Jadi turunan x kuadrat adalah dua x. Kita tidak mengganti h dengan nol di pecahan awal; itu akan menghasilkan pembagian yang tidak terdefinisi. Penyederhanaan menunjukkan perilaku nilai-nilai di dekat nol. Di x sama dengan tiga, kemiringan tangen adalah enam.",
  );

  const c5 = chapter("application", "5 · Gerak sebagai aplikasi", 280, 60, 4, [
    "Menghubungkan posisi, kecepatan, percepatan",
    "Menghitung jarak dari model gerak",
  ]);
  header(c5, "POSISI → KECEPATAN → PERCEPATAN");
  const g5 = graph(0, 4, 0, 8);
  chart(c5, g5, velocity, 9);
  write(c5, "v(t) = 2t", 930, 170, 10, 3, 40, "blue");
  write(c5, "s(t) = t^2 meter", 930, 285, 17, 3, 34);
  write(c5, "v(t) = s'(t) = 2t", 930, 360, 22, 4, 34, "blue");
  write(c5, "a(t) = v'(t)\n= 2 m/s^2", 930, 437, 28, 4, 34, "red");
  say(
    c5,
    9,
    22,
    "Kembali ke mobil. Posisi adalah waktu kuadrat meter, dengan waktu dalam detik. Turunan posisi memberi kecepatan dua t meter per detik. Turunan kecepatan memberi percepatan dua meter per detik kuadrat. Grafik kecepatan berupa garis lurus yang naik: mobil bertambah cepat dengan laju tetap.",
  );
  add(c5, "plotPoint", 34, 1, { graph: g5, x: 3, y: 6, label: "(3,6)" });
  write(c5, "Pada t = 3 detik:", 930, 555, 34, 3, 32);
  write(c5, "v(3) = 6 m/s", 930, 625, 38, 3, 38, "blue");
  write(c5, "Jarak 0 sampai 3 detik?", 80, 842, 42, 4, 34, "orange");
  add(c5, "shadeArea", 46, 3, { graph: g5, fn: velocity, a: 0, b: 3 });
  say(
    c5,
    33,
    22,
    "Pada detik tiga, kecepatan mobil enam meter per detik. Turunan juga membantu optimasi dan analisis perubahan dalam sains serta teknik. Dalam model yang sama ini, kita dapat bertanya sebaliknya: jika tahu kecepatan, bagaimana mengumpulkan jarak yang ditempuh? Luas di bawah grafik kecepatan akan membawa kita ke integral.",
  );

  const c6 = chapter("integration", "6 · Luas menjadi akumulasi", 340, 85, 5, [
    "Memahami jumlah Riemann",
    "Menghitung integral tentu sederhana",
    "Membedakan hasil eksak dan pendekatan",
  ]);
  header(c6, "INTEGRAL: MENGUMPULKAN BAGIAN KECIL");
  write(c6, "Bagaimana menghitung luas di bawah kurva?", 80, 165, 9, 4, 34);
  const g6 = graph(0, 2.4, 0, 5);
  chart(c6, g6, square, 14);
  write(c6, "y = x^2, 0 ≤ x ≤ 2", 920, 280, 19, 4, 30, "blue");
  say(
    c6,
    9,
    20,
    "Bagaimana menghitung luas daerah yang batas atasnya melengkung? Kita bagi interval menjadi beberapa bagian. Pada tiap bagian, buat persegi panjang dengan tinggi dari kurva. Lebar kali tinggi memberi luas kecil. Jumlahkan semuanya untuk mendekati luas total.",
  );
  let rect = add(c6, "drawRiemannRectangles", 24, 3, {
    graph: g6,
    fn: square,
    a: 0,
    b: 2,
    n: 4,
  });
  write(c6, "Awal: 4 bagian", 920, 375, 26, 3, 30, "orange");
  write(c6, "Luas ≈ 2.625", 920, 435, 30, 3, 32, "orange");
  add(c6, "erase", 34, 1, { target: rect });
  rect = add(c6, "drawRiemannRectangles", 36, 3, {
    graph: g6,
    fn: square,
    a: 0,
    b: 2,
    n: 12,
  });
  write(c6, "12 → 36 → makin halus", 920, 510, 36, 4, 28);
  say(
    c6,
    31,
    21,
    "Di sini kita memakai tinggi pada titik tengah setiap interval. Empat persegi panjang memberi dua koma enam dua lima. Ketika pembagiannya lebih banyak, celah terhadap kurva mengecil. Yang penting bukan satu gambar tertentu, tetapi limit dari jumlah luas saat lebar interval menuju nol.",
  );
  add(c6, "erase", 41, 1, { target: rect });
  rect = add(c6, "drawRiemannRectangles", 43, 4, {
    graph: g6,
    fn: square,
    a: 0,
    b: 2,
    n: 36,
  });
  add(c6, "erase", 49, 2, { target: rect });
  add(c6, "shadeArea", 52, 3, { graph: g6, fn: square, a: 0, b: 2 });
  write(
    c6,
    { type: "integral", lower: "0", upper: "2", body: "x^2 dx" },
    920,
    600,
    53,
    5,
    38,
    "blue",
  );
  say(
    c6,
    53,
    15,
    "Notasi integral merangkum proses akumulasi itu. Untuk x kuadrat dari nol sampai dua, kita akan memakai fungsi yang turunannya x kuadrat, yaitu x pangkat tiga dibagi tiga. Ambil nilainya di batas atas, lalu kurangi nilai di batas bawah.",
  );
  // Adjacent workspace retains graph context during a smooth pan.
  add(c6, "moveCamera", 60, 2.5, {
    bounds: { x: 1710, y: 0, w: 1640, h: 920 },
  });
  write(
    c6,
    "MENGHITUNG NILAI EKSAK",
    1710,
    160,
    63,
    3,
    36,
    "blue",
    undefined,
    1500,
  );
  write(
    c6,
    row("F(x) =", fraction("x^3", "3")),
    1720,
    285,
    67,
    4,
    38,
    "black",
    undefined,
    1400,
  );
  write(
    c6,
    row("F(2) - F(0) =", fraction("8", "3"), "- 0"),
    1720,
    475,
    72,
    5,
    38,
    "black",
    undefined,
    1400,
  );
  write(
    c6,
    row("Luas =", fraction("8", "3"), "≈ 2.667"),
    1720,
    675,
    78,
    4,
    42,
    "red",
    undefined,
    1400,
  );
  say(
    c6,
    69,
    14,
    "Dua pangkat tiga dibagi tiga, dikurangi nol, menghasilkan delapan per tiga. Itu nilai eksak. Dua koma enam enam tujuh hanyalah pembulatan. Luas pendekatan tadi makin mendekati nilai ini. Integral tentu memberi total bertanda; daerah kita berada di atas sumbu, sehingga totalnya adalah luas positif.",
  );

  const c7 = chapter("connection", "7 · Dua arah dari satu ide", 425, 60, 7, [
    "Memahami teorema dasar kalkulus secara visual",
    "Menghubungkan penambahan luas dengan tinggi kurva",
  ]);
  header(c7, "PERUBAHAN DAN AKUMULASI TERHUBUNG");
  const g7 = graph(0, 3, 0, 4.5);
  chart(c7, g7, linear, 9);
  write(c7, "f(x) = x", 930, 170, 9, 3, 38, "blue");
  add(c7, "shadeArea", 17, 4, { graph: g7, fn: linear, a: 0, b: 2 });
  write(c7, "A(x) = luas dari 0 ke x", 930, 285, 17, 4, 30);
  write(c7, row("A(x) =", fraction("x^2", "2")), 930, 380, 23, 5, 38, "orange");
  say(
    c7,
    10,
    22,
    "Perhatikan garis y sama dengan x. Luas dari nol sampai x membentuk segitiga: setengah kali alas x kali tinggi x. Jadi fungsi akumulasi A adalah setengah x kuadrat. Jika batas kanan maju sedikit, luas bertambah berupa pita sempit. Tinggi pita hampir sama dengan nilai fungsi di batas kanan.",
  );
  add(c7, "shadeArea", 33, 2, { graph: g7, fn: linear, a: 2, b: 2.12 });
  write(c7, "ΔA ≈ f(x) Δx", 930, 570, 34, 4, 34);
  write(c7, "A'(x) = x = f(x)", 930, 657, 41, 4, 34, "red");
  say(
    c7,
    34,
    23,
    "Tambahan luas kira-kira tinggi kali tambahan lebar. Dibagi tambahan lebar, laju perubahan luas mendekati tinggi kurva. Jadi turunan fungsi akumulasi mengembalikan fungsi semula. Inilah inti teorema dasar kalkulus untuk fungsi kontinu. Sebaliknya, mengintegralkan turunan memberi perubahan total, lewat nilai fungsi di dua batas.",
  );
  write(c7, "Turunan A → f; integral f → A", 80, 844, 49, 5, 32, "red");

  const c8 = chapter("challenge", "8 · Coba, lalu hubungkan", 485, 55, 8, [
    "Menyelesaikan tantangan kecepatan dan jarak",
    "Merangkum turunan dan integral",
  ]);
  header(c8, "TANTANGAN: DUA PERTANYAAN, SATU GERAK");
  write(c8, "v(t) = 2t m/s, mulai dari s(0)=0", 80, 170, 9, 4, 36, "blue");
  write(c8, "Pada t=2: kecepatan? Jarak total?", 80, 280, 14, 4, 36);
  say(
    c8,
    8,
    15,
    "Sekarang giliranmu. Mobil mulai di posisi nol dengan kecepatan dua t meter per detik. Pada detik dua, berapa kecepatannya, dan berapa jarak total yang sudah ditempuh? Dua pertanyaan ini meminta dua cara berpikir. Coba jawab sebelum kita lanjut.",
  );
  add(c8, "pause", 23, 7, { reason: "Waktu berpikir untuk tantangan" });
  write(c8, "Kecepatan: v(2) = 2(2) = 4 m/s", 80, 407, 30, 5, 36, "blue");
  write(
    c8,
    row(
      "Jarak:",
      { type: "integral", lower: "0", upper: "2", body: "2t dt" },
      "= [t^2] dari 0 ke 2 = 4 m",
    ),
    80,
    515,
    36,
    6,
    32,
    "orange",
  );
  say(
    c8,
    30,
    15,
    "Kecepatan sesaatnya empat meter per detik. Untuk jarak, akumulasikan kecepatan dari nol sampai dua. Integral dua t adalah t kuadrat, sehingga jaraknya empat meter. Angkanya sama dalam contoh ini, tetapi makna dan satuannya berbeda: satu laju sesaat, satu total yang terkumpul.",
  );
  write(c8, "Turunan membantu memahami perubahan.", 80, 725, 44, 4, 34, "red");
  write(
    c8,
    "Integral membantu memahami akumulasi.",
    80,
    805,
    48,
    4,
    34,
    "blue",
  );
  say(
    c8,
    45.5,
    9,
    "Turunan membantu kita memahami perubahan. Integral membantu kita memahami akumulasi. Dua arah dari satu ide: memahami dunia dengan membagi perubahan menjadi bagian kecil, lalu menghubungkannya kembali.",
  );
  const connectionFrame = c7.actions.find((a) => a.type === "moveCamera")!;
  connectionFrame.at = 5000;
  c7.actions.unshift({
    id: "connection-overview",
    type: "zoomCamera",
    at: 0,
    duration: 3000,
    bounds: { x: -2250, y: 0, w: 3890, h: 920 },
  });
  return {
    format: "stroke-lesson",
    version: 1,
    id: "calculus-flagship",
    title: "Kalkulus: Matematika untuk Memahami Perubahan",
    language: "id",
    seed: 20261011,
    duration: 540000,
    chapters: [c1, c2, c3, c4, c5, c6, c7, c8],
    sources: [
      {
        title: "MacTutor: The rise of calculus",
        url: "https://mathshistory.st-andrews.ac.uk/HistTopics/The_rise_of_calculus/",
      },
    ],
  };
}
