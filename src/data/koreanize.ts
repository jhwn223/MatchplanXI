// Display player names.
// Korea's squad + global stars get a hand-mapped Korean name; everyone else is
// shown with their real (English/Latin-script) name as-is — a phonetic
// transliteration reads as garbled nonsense for most non-Korean names, so we
// don't attempt one.

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
  "Lamine Yamal": "라민 야말",
  "Rodrigo Rodri": "로드리",
  "Vitor Vitinha": "비티냐",
  "José Vinicius": "비니시우스",
  "James David Rodriguez": "하메스 로드리게스",
  "Hamed Mahrous Mohamed Salah": "모하메드 살라",
};

/** Curated Korean name where known, otherwise the player's real name unchanged. */
export function koreanizeName(name: string): string {
  if (!name) return name;
  return OVERRIDES[name.trim()] ?? name;
}
