const KOREAN_ARENA_NAMES: Record<string, string> = {
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
  "Wije Cho": "조유제",
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
};

export function displayArenaName(name: string) {
  const koreanName = KOREAN_ARENA_NAMES[name];
  if (koreanName) return koreanName;
  const parts = name.trim().split(/\s+/);
  if (parts.length <= 2) return name;
  return `${parts[0]} ${parts[parts.length - 1]}`;
}
