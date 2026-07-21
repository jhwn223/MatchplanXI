// The dataset stores full legal names (often with extra middle names, or
// oddities like a repeated token — "Ronaldo Cristiano Ronaldo",
// "Lamine Yamal Yamal"). This derives the name each player actually goes by
// on a squad list: a curated map for recognizable internationals (checked
// against their national team rosters) plus a general first-name +
// surname(-with-particle) fallback for everyone else.

const OVERRIDES: Record<string, string> = {
  // --- South Korea (FIFA roster form: family name, hyphenated given name) ---
  "Seunggyu Kim": "Kim Seung-gyu",
  "Hanbeom Lee": "Lee Han-beom",
  "Gihyuk Lee": "Lee Gi-hyuk",
  "Minjae Kim": "Kim Min-jae",
  "Taehyeon Kim": "Kim Tae-hyeon",
  "Inbeom Hwang": "Hwang In-beom",
  "Heung Min Son": "Son Heung-min",
  "Seungho Paik": "Paik Seung-ho",
  "Guesung Cho": "Cho Gue-sung",
  "Jae Sung Lee": "Lee Jae-sung",
  "Hee Chan Hwang": "Hwang Hee-chan",
  "Bumkeun Song": "Song Bum-keun",
  "Taeseok Lee": "Lee Tae-seok",
  "Wije Cho": "Cho Wi-je",
  "Moonhwan Kim": "Kim Moon-hwan",
  "Jinseob Park": "Park Jin-seob",
  "Junho Bae": "Bae Jun-ho",
  "Hyeongyu Oh": "Oh Hyeon-gyu",
  "Kangin Lee": "Lee Kang-in",
  "Hyunjun Yang": "Yang Hyun-jun",
  "Hyeonwoo Jo": "Jo Hyeon-woo",
  "Youngwoo Seol": "Seol Young-woo",
  "Jingyu Kim": "Kim Jin-gyu",
  "Jisung Eom": "Eom Ji-sung",
  "Donggyeong Lee": "Lee Dong-gyeong",
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
