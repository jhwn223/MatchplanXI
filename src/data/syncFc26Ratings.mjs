import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Papa from "papaparse";

const API_BASE = "https://api.msmc.cc/api/fc26";
const here = path.dirname(fileURLToPath(import.meta.url));
const publicData = path.resolve(here, "../../public/data");
const outputPath = path.join(here, "fc26PlayerRatings.json");
const correctionsPath = path.join(here, "playerIdentityCorrections.json");
const teamFilter = process.argv.find((argument) => argument.startsWith("--team="))?.split("=")[1]?.toUpperCase();

const NATION_NAMES = {
  "South Korea": "Korea Republic",
  Czechia: "Czech Republic",
  USA: "United States",
  "Türkiye": "Turkey",
  Netherlands: "Holland",
  "IR Iran": "Iran",
  "Cabo Verde": "Cape Verde Islands",
};

const NUMBER_FIELDS = {
  overall: "OVR",
  pace: "PAC",
  shooting: "SHO",
  passing: "PAS",
  dribbling: "DRI",
  defending: "DEF",
  physical: "PHY",
  acceleration: "Acceleration",
  sprintSpeed: "Sprint Speed",
  positioning: "Positioning",
  finishing: "Finishing",
  shotPower: "Shot Power",
  longShots: "Long Shots",
  volleys: "Volleys",
  penalties: "Penalties",
  vision: "Vision",
  crossing: "Crossing",
  freeKickAccuracy: "Free Kick Accuracy",
  shortPassing: "Short Passing",
  longPassing: "Long Passing",
  curve: "Curve",
  agility: "Agility",
  balance: "Balance",
  reactions: "Reactions",
  ballControl: "Ball Control",
  composure: "Composure",
  interceptions: "Interceptions",
  headingAccuracy: "Heading Accuracy",
  defensiveAwareness: "Def Awareness",
  standingTackle: "Standing Tackle",
  slidingTackle: "Sliding Tackle",
  jumping: "Jumping",
  stamina: "Stamina",
  strength: "Strength",
  aggression: "Aggression",
  gkDiving: "GK Diving",
  gkHandling: "GK Handling",
  gkKicking: "GK Kicking",
  gkPositioning: "GK Positioning",
  gkReflexes: "GK Reflexes",
  weakFoot: "Weak foot",
  skillMoves: "Skill moves",
};

function parseCsv(text) {
  return Papa.parse(text, { header: true, dynamicTyping: true, skipEmptyLines: true }).data;
}

function normalizedTokens(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

function aliases(name) {
  const tokens = normalizedTokens(name);
  if (!tokens.length) return new Set();
  const first = tokens[0];
  const last = tokens[tokens.length - 1];
  return new Set([
    tokens.join(""),
    [...tokens].sort().join(""),
    `${first}${last}`,
    `${last}${first}`,
  ]);
}

function dice(a, b) {
  if (a === b) return 1;
  if (a.length < 2 || b.length < 2) return 0;
  const counts = new Map();
  for (let i = 0; i < a.length - 1; i++) {
    const pair = a.slice(i, i + 2);
    counts.set(pair, (counts.get(pair) ?? 0) + 1);
  }
  let matches = 0;
  for (let i = 0; i < b.length - 1; i++) {
    const pair = b.slice(i, i + 2);
    const count = counts.get(pair) ?? 0;
    if (count > 0) {
      matches++;
      counts.set(pair, count - 1);
    }
  }
  return (2 * matches) / (a.length + b.length - 2);
}

function matchScore(player, candidate) {
  const leftAliases = aliases(player.player_name);
  const rightAliases = aliases(candidate.Name);
  for (const value of leftAliases) if (rightAliases.has(value)) return 1;

  let nameScore = 0;
  for (const left of leftAliases) {
    for (const right of rightAliases) nameScore = Math.max(nameScore, dice(left, right));
  }
  const clubScore = dice(
    normalizedTokens(player.club_team).join(""),
    normalizedTokens(candidate.Team).join("")
  );
  return nameScore * 0.88 + clubScore * 0.12;
}

function findCandidate(player, candidates, claimed) {
  const ranked = candidates
    .filter((candidate) => !claimed.has(candidate.ID))
    .map((candidate) => ({ candidate, score: matchScore(player, candidate) }))
    .sort((a, b) => b.score - a.score);
  if (!ranked.length) return null;
  const best = ranked[0];
  const gap = best.score - (ranked[1]?.score ?? 0);
  return best.score >= 0.91 || (best.score >= 0.82 && gap >= 0.08) ? best : null;
}

function number(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function fromFc26(candidate) {
  const ability = {
    source: "fc26",
    sourcePlayerId: String(candidate.ID),
    sourceName: candidate.Name,
  };
  for (const [local, remote] of Object.entries(NUMBER_FIELDS)) ability[local] = number(candidate[remote]);
  ability.preferredFoot = candidate["Preferred foot"] || undefined;
  return ability;
}

function estimated(player) {
  const value = Math.max(0, number(player.market_value_eur));
  const caps = Math.max(0, number(player.caps));
  const goals = Math.max(0, number(player.goals));
  const overall = Math.round(Math.min(82, Math.max(58, 57 + Math.log10(value + 1) * 2.35 + Math.min(4, caps / 35))));
  const base = overall - 3;
  const position = player.position;
  const goalBoost = Math.min(8, goals / Math.max(1, caps) * 35);
  const pace = Math.round(base + (position === "FWD" ? 4 : position === "DEF" ? -1 : 1));
  const shooting = Math.round(base + (position === "FWD" ? 5 : position === "MID" ? 0 : -8) + goalBoost);
  const passing = Math.round(base + (position === "MID" ? 5 : position === "FWD" ? 0 : -1));
  const dribbling = Math.round(base + (position === "FWD" ? 4 : position === "MID" ? 3 : -3));
  const defending = Math.round(base + (position === "DEF" ? 7 : position === "MID" ? 0 : -11));
  const physical = Math.round(base + (position === "DEF" ? 5 : 1));
  const gk = position === "GK" ? overall : 12;
  const clamp = (v) => Math.min(99, Math.max(1, Math.round(v)));
  return {
    source: "estimated",
    overall,
    pace: clamp(position === "GK" ? 45 : pace),
    shooting: clamp(position === "GK" ? 18 : shooting),
    passing: clamp(position === "GK" ? overall - 12 : passing),
    dribbling: clamp(position === "GK" ? 25 : dribbling),
    defending: clamp(position === "GK" ? 20 : defending),
    physical: clamp(physical),
    acceleration: clamp(pace), sprintSpeed: clamp(pace),
    positioning: clamp(shooting), finishing: clamp(shooting), shotPower: clamp(shooting + 2),
    longShots: clamp(shooting), volleys: clamp(shooting - 2), penalties: clamp(shooting - 3),
    vision: clamp(passing), crossing: clamp(passing - 2), freeKickAccuracy: clamp(passing - 4),
    shortPassing: clamp(passing + 2), longPassing: clamp(passing), curve: clamp(passing - 1),
    agility: clamp(dribbling), balance: clamp(dribbling), reactions: clamp(overall),
    ballControl: clamp(dribbling), composure: clamp(overall),
    interceptions: clamp(defending), headingAccuracy: clamp(defending), defensiveAwareness: clamp(defending + 2),
    standingTackle: clamp(defending + 1), slidingTackle: clamp(defending),
    jumping: clamp(physical), stamina: clamp(physical + 2), strength: clamp(physical),
    aggression: clamp(physical), gkDiving: gk, gkHandling: gk, gkKicking: gk,
    gkPositioning: gk, gkReflexes: gk, weakFoot: 3, skillMoves: 2,
  };
}

async function fetchNation(name) {
  const response = await fetch(`${API_BASE}/nation/${encodeURIComponent(name)}/M`);
  if (!response.ok) throw new Error(`${name}: HTTP ${response.status}`);
  const payload = await response.json();
  if (!Array.isArray(payload)) throw new Error(`${name}: unexpected response`);
  return payload;
}

async function main() {
  const [teamsText, playersText, correctionsText] = await Promise.all([
    fs.readFile(path.join(publicData, "teams.csv"), "utf8"),
    fs.readFile(path.join(publicData, "squads_and_players.csv"), "utf8"),
    fs.readFile(correctionsPath, "utf8"),
  ]);
  const teams = parseCsv(teamsText);
  const corrections = JSON.parse(correctionsText);
  const players = parseCsv(playersText).map((player) => ({
    ...player,
    player_name: corrections[String(player.player_id)] ?? player.player_name,
  }));
  let output = {};
  if (teamFilter) {
    try {
      output = JSON.parse(await fs.readFile(outputPath, "utf8"));
    } catch {
      output = {};
    }
  }
  const unmatched = [];
  let matched = 0;

  for (const team of teams.filter((item) => !teamFilter || String(item.fifa_code).toUpperCase() === teamFilter)) {
    const nation = NATION_NAMES[team.team_name] ?? team.team_name;
    let candidates = [];
    try {
      candidates = await fetchNation(nation);
    } catch (error) {
      console.warn(`Could not fetch ${nation}: ${error.message}`);
    }
    const claimed = new Set();
    for (const player of players.filter((item) => item.team_id === team.team_id)) {
      const result = findCandidate(player, candidates, claimed);
      if (result) {
        output[player.player_id] = fromFc26(result.candidate);
        claimed.add(result.candidate.ID);
        matched++;
      } else {
        output[player.player_id] = estimated(player);
        unmatched.push(`${team.team_name}: ${player.player_name}`);
      }
    }
    console.log(`${team.team_name}: ${claimed.size}/${players.filter((item) => item.team_id === team.team_id).length}`);
  }

  await fs.writeFile(outputPath, `${JSON.stringify(output, null, 2)}\n`);
  console.log(`\nFC26 matched ${matched}/${players.length}; estimated ${unmatched.length}`);
  if (unmatched.length) console.log(unmatched.join("\n"));
}

await main();
