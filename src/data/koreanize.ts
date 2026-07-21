// Display player names in Korean.
// The dataset has no Korean names, so we use hand-mapped names for the Korea
// squad + global stars, and a phonetic Latin→Hangul transliteration for the rest.

const OVERRIDES: Record<string, string> = {
  // --- Korea (대한민국) ---
  "Seunggyu Kim": "김승규",
  "Hanbeom Lee": "이한범",
  "Gihyuk Lee": "이기혁",
  "Minjae Kim": "김민재",
  "Taehyeon Kim": "김태현",
  "Inbeom Hwang": "황인범",
  "Heung Min Son": "손흥민",
  "Seungho Paik": "백승호",
  "Guesung Cho": "조규성",
  "Jae Sung Lee": "이재성",
  "Hee Chan Hwang": "황희찬",
  "Bumkeun Song": "송범근",
  "Taeseok Lee": "이태석",
  "Wije Cho": "조위제",
  "Moonhwan Kim": "김문환",
  "Jinseob Park": "박진섭",
  "Junho Bae": "배준호",
  "Hyeongyu Oh": "오현규",
  "Kangin Lee": "이강인",
  "Hyunjun Yang": "양현준",
  "Hyeonwoo Jo": "조현우",
  "Youngwoo Seol": "설영우",
  "Jens Castrop": "옌스 카스트로프",
  "Jingyu Kim": "김진규",
  "Jisung Eom": "엄지성",
  "Donggyeong Lee": "이동경",
  // --- global stars ---
  "Lionel Andrés Messi": "리오넬 메시",
  "Ronaldo Cristiano Ronaldo": "크리스티아누 호날두",
  "Kylian Mbappe": "킬리안 음바페",
  "Erling Braut Haaland": "엘링 홀란",
  "Harry Edward Kane": "해리 케인",
  "Jude Victor William Bellingham": "주드 벨링엄",
  "Virgil Van Dijk": "버질 판데이크",
  "Kevin De Bruyne": "케빈 더브라위너",
  "Luka Modric": "루카 모드리치",
  "Kai Lukas Havertz": "카이 하베르츠",
  "Jamal Musiala": "자말 무시알라",
  "Lamine Yamal Yamal": "라민 야말",
  "Rodrigo Rodri": "로드리",
  "Vitor Vitinha": "비티냐",
  "José Vinicius": "비니시우스",
  "James David Rodriguez": "하메스 로드리게스",
  "Hamed Mahrous Mohamed Salah": "모하메드 살라",
};

// ---- phonetic Latin → Hangul ----
const VOW: Record<string, number> = { a: 0, e: 5, i: 20, o: 8, u: 13 };
// consonant sound → Hangul initial-jamo index
const CONS: Record<string, number> = {
  b: 7, c: 15, d: 3, f: 17, g: 0, h: 18, j: 12, k: 15, l: 5, m: 6, n: 2,
  p: 17, q: 15, r: 5, s: 9, t: 16, v: 7, w: 11, x: 15, y: 11, z: 12,
};
// initial-jamo index → 받침(final) code. Korean loanword phonology only closes
// syllables with ㄱ/ㄴ/ㄹ/ㅁ/ㅇ; every other trailing consonant becomes its own
// ㅡ-syllable (z→즈, f→프, d→드 …), which reads far more naturally.
const FINAL_OF: Record<number, number> = {
  0: 1, // ㄱ (g)
  15: 1, // ㅋ (k/c/ck/q) → 받침 ㄱ
  2: 4, // ㄴ (n)
  5: 8, // ㄹ (l/r)
  6: 16, // ㅁ (m)
  11: 21, // ㅇ (ng)
};

type Tok = { t: "C"; i: number } | { t: "V"; m: number };

function compose(init: number, med: number, fin: number): string {
  return String.fromCharCode(0xac00 + (init * 21 + med) * 28 + fin);
}

function stripDiacritics(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

function tokenize(word: string): Tok[] {
  const w = stripDiacritics(word).toLowerCase().replace(/[^a-z]/g, "");
  const toks: Tok[] = [];
  let i = 0;
  while (i < w.length) {
    const two = w.slice(i, i + 2);
    // digraphs
    if (two === "ch") { toks.push({ t: "C", i: 14 }); i += 2; continue; }
    if (two === "sh") { toks.push({ t: "C", i: 9 }); i += 2; continue; }
    if (two === "th") { toks.push({ t: "C", i: 9 }); i += 2; continue; }
    if (two === "ph") { toks.push({ t: "C", i: 17 }); i += 2; continue; }
    if (two === "gh") { toks.push({ t: "C", i: 0 }); i += 2; continue; }
    if (two === "ck") { toks.push({ t: "C", i: 15 }); i += 2; continue; }
    if (two === "ng") { toks.push({ t: "C", i: 11 }); i += 2; continue; }
    if (two === "ll") { toks.push({ t: "C", i: 5 }); i += 2; continue; }
    if (two === "ss") { toks.push({ t: "C", i: 10 }); i += 2; continue; }
    if (two === "zz") { toks.push({ t: "C", i: 12 }); i += 2; continue; }
    if (two === "oo") { toks.push({ t: "V", m: 13 }); i += 2; continue; }
    if (two === "ee") { toks.push({ t: "V", m: 20 }); i += 2; continue; }
    if (two === "ou") { toks.push({ t: "V", m: 13 }); i += 2; continue; }
    if (two === "ai") { toks.push({ t: "V", m: 1 }); i += 2; continue; }

    const ch = w[i];
    // y-glide before a vowel
    if (ch === "y" && VOW[w[i + 1]] != null) {
      const yv: Record<string, number> = { a: 2, e: 6, o: 12, u: 17, i: 20 };
      toks.push({ t: "V", m: yv[w[i + 1]] ?? 20 });
      i += 2;
      continue;
    }
    // soft c before e/i/y sounds like 's' (Rice → 리세, Vinicius → 비니시우스)
    if (ch === "c" && "eiy".includes(w[i + 1] ?? "")) { toks.push({ t: "C", i: 9 }); i++; continue; }
    // a 'y' not before a vowel acts as the vowel ㅣ (e.g. Cody → 코디)
    if (ch === "y") { toks.push({ t: "V", m: 20 }); i++; continue; }
    if (VOW[ch] != null) { toks.push({ t: "V", m: VOW[ch] }); i++; continue; }
    if (CONS[ch] != null) { toks.push({ t: "C", i: CONS[ch] }); i++; continue; }
    i++;
  }
  return toks;
}

function transliterateWord(word: string): string {
  const toks = tokenize(word);
  let out = "";
  let i = 0;
  while (i < toks.length) {
    const t = toks[i];
    if (t.t === "V") {
      let fin = 0;
      const nx = toks[i + 1];
      const nx2 = toks[i + 2];
      if (nx && nx.t === "C" && (!nx2 || nx2.t === "C") && FINAL_OF[nx.i] != null) {
        fin = FINAL_OF[nx.i];
        out += compose(11, t.m, fin);
        i += 2;
        continue;
      }
      out += compose(11, t.m, 0);
      i++;
    } else {
      const nx = toks[i + 1];
      if (nx && nx.t === "V") {
        const c2 = toks[i + 2];
        const c3 = toks[i + 3];
        if (c2 && c2.t === "C" && (!c3 || c3.t === "C") && FINAL_OF[c2.i] != null) {
          out += compose(t.i, nx.m, FINAL_OF[c2.i]);
          i += 3;
          continue;
        }
        out += compose(t.i, nx.m, 0);
        i += 2;
      } else {
        // lone consonant → attach ㅡ
        out += compose(t.i, 18, 0);
        i++;
      }
    }
  }
  return out || word;
}

const cache = new Map<string, string>();

/** Convert a Latin player name to Korean (curated where known, else phonetic). */
export function koreanizeName(name: string): string {
  if (!name) return name;
  const hit = OVERRIDES[name.trim()];
  if (hit) return hit;
  const cached = cache.get(name);
  if (cached) return cached;
  const ko = name
    .split(/\s+/)
    .filter(Boolean)
    .map(transliterateWord)
    .join(" ");
  cache.set(name, ko);
  return ko;
}
