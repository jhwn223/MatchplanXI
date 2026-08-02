// The dataset stores full legal names (often with extra middle names, or
// oddities like a repeated token — "Ronaldo Cristiano Ronaldo",
// "Lamine Yamal Yamal"). This derives the name each player actually goes by
// on a squad list: a curated map for recognizable internationals (checked
// against their national team rosters) plus a general first-name +
// surname(-with-particle) fallback for everyone else.

const OVERRIDES: Record<string, string> = {
  // --- South Korea (FIFA roster form: family name, hyphenated given name) ---
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
  // --- global stars: fix duplicated/awkward legal-name formatting ---
  "Lionel Andrés Messi": "Lionel Messi",
  "Ronaldo Cristiano Ronaldo": "Cristiano Ronaldo",
  "Kylian Mbappe": "Kylian Mbappé",
  "Erling Braut Haaland": "Erling Haaland",
  "Harry Edward Kane": "Harry Kane",
  "Jude Victor William Bellingham": "Jude Bellingham",
  "Virgil Van Dijk": "Virgil van Dijk",
  "Kevin De Bruyne": "Kevin De Bruyne",
  "Luka Modric": "Luka Modrić",
  "Kai Lukas Havertz": "Kai Havertz",
  "Lamine Yamal Yamal": "Lamine Yamal",
  "Rodrigo Rodri": "Rodri",
  "Vitor Vitinha": "Vitinha",
  "José Vinicius": "Vinícius Júnior",
  "James David Rodriguez": "James Rodríguez",
  "Hamed Mahrous Mohamed Salah": "Mohamed Salah",
  // --- other roster names the general heuristic below gets wrong ---
  "Francisco Guillermo Ochoa": "Guillermo Ochoa",
  "Paul Jan-Paul Van Hecke": "Jan-Paul van Hecke",
  "Joaquim Cj Dos Santos": "CJ dos Santos",
  "Jørgen Strand Strand Larsen": "Jørgen Strand Larsen",
  "Marcus Holmgren Holmgren Pedersen": "Marcus Holmgren Pedersen",
};

// surname particles that stay attached to the following surname token
const PARTICLES = new Set([
  "van", "de", "der", "den", "von", "la", "le", "du", "dos", "das", "do",
  "bin", "ibn", "al", "ter", "af", "el", "ten",
]);

function collapseAdjacentDuplicates(tokens: string[]): string[] {
  const out: string[] = [];
  for (const t of tokens) {
    if (out.length && out[out.length - 1].toLowerCase() === t.toLowerCase()) continue;
    out.push(t);
  }
  return out;
}

/** Derive the name a player commonly goes by from their full legal name:
 *  drop repeated tokens, drop a redundant leading/trailing duplicate of the
 *  surname, then keep first-name + surname (with any leading particle). */
function commonName(raw: string): string {
  let tokens = collapseAdjacentDuplicates(raw.trim().split(/\s+/).filter(Boolean));

  while (tokens.length >= 3 && tokens[0].toLowerCase() === tokens[tokens.length - 1].toLowerCase()) {
    tokens = tokens.slice(1);
  }
  if (tokens.length <= 2) return tokens.join(" ");

  let cut = tokens.length - 1;
  while (cut > 1 && PARTICLES.has(tokens[cut - 1].toLowerCase())) cut--;

  const surnameTokens = tokens.slice(cut);
  const surname = surnameTokens
    .map((t, i) => (i === surnameTokens.length - 1 ? t : t.toLowerCase()))
    .join(" ");
  return `${tokens[0]} ${surname}`;
}

const cache = new Map<string, string>();

/** The English name a player commonly goes by (roster/broadcast form). */
export function displayPlayerName(name: string): string {
  if (!name) return name;
  const hit = OVERRIDES[name.trim()];
  if (hit) return hit;
  const cached = cache.get(name);
  if (cached) return cached;
  const derived = commonName(name);
  cache.set(name, derived);
  return derived;
}
