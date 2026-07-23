import { mulberry32, quickSimScore } from "./matchSim";
import type { PlayedMap, StandingRow } from "./tournament";
import type { Leaderboard } from "./leaderboard";
import type { Player, Position, TournamentData, Venue } from "./types";

// ---------- group stage ----------

function eloOf(data: TournamentData): Map<string, { elo: number; code: string }> {
  const m = new Map<string, { elo: number; code: string }>();
  for (const t of data.teams) m.set(t.team_name, { elo: t.elo_rating, code: t.fifa_code });
  return m;
}

interface PlayedGoals {
  home: string;
  away: string;
  hs: number;
  as: number;
}

/** Re-orders any block of teams still tied on points/GD/GF (the usual sort
 *  keys) using their head-to-head record among just that tied group — points,
 *  then goal difference, then goals scored in the matches they played against
 *  each other — matching FIFA's group-stage tiebreak order. Teams that aren't
 *  tied with anyone are left exactly where the primary sort put them. */
function applyHeadToHeadTiebreak(rows: StandingRow[], matches: PlayedGoals[]): StandingRow[] {
  const result = [...rows];
  let i = 0;
  while (i < result.length) {
    let j = i + 1;
    while (
      j < result.length &&
      result[j].points === result[i].points &&
      result[j].gd === result[i].gd &&
      result[j].gf === result[i].gf
    ) {
      j++;
    }
    if (j - i > 1) {
      const tiedNames = new Set(result.slice(i, j).map((r) => r.teamName));
      const h2h = new Map<string, { points: number; gf: number; ga: number }>();
      for (const name of tiedNames) h2h.set(name, { points: 0, gf: 0, ga: 0 });
      for (const m of matches) {
        if (!tiedNames.has(m.home) || !tiedNames.has(m.away)) continue;
        const h = h2h.get(m.home)!;
        const a = h2h.get(m.away)!;
        h.gf += m.hs; h.ga += m.as;
        a.gf += m.as; a.ga += m.hs;
        if (m.hs > m.as) h.points += 3;
        else if (m.hs < m.as) a.points += 3;
        else { h.points++; a.points++; }
      }
      const tied = result.slice(i, j).sort((x, y) => {
        const hx = h2h.get(x.teamName)!;
        const hy = h2h.get(y.teamName)!;
        return hy.points - hx.points || (hy.gf - hy.ga) - (hx.gf - hx.ga) || hy.gf - hx.gf;
      });
      result.splice(i, j - i, ...tied);
    }
    i = j;
  }
  return result;
}

export function groupStandingsSim(
  data: TournamentData,
  groupLetter: string,
  played: PlayedMap
): StandingRow[] {
  const groupTeams = data.teams.filter((t) => t.group_letter === groupLetter);
  const names = new Set(groupTeams.map((t) => t.team_name));
  const table = new Map<string, StandingRow>();
  for (const t of groupTeams) {
    table.set(t.team_name, {
      teamName: t.team_name,
      fifaCode: t.fifa_code,
      played: 0, won: 0, drawn: 0, lost: 0, gf: 0, ga: 0, gd: 0, points: 0,
    });
  }
  const playedMatches: PlayedGoals[] = [];
  for (const m of data.matches) {
    if (m.stage_name !== "Group Stage") continue;
    if (!names.has(m.home_team_name) || !names.has(m.away_team_name)) continue;
    const result = played[m.match_id];
    if (!result) continue;
    const hs = result.homeGoals;
    const as = result.awayGoals;
    playedMatches.push({ home: m.home_team_name, away: m.away_team_name, hs, as });
    const h = table.get(m.home_team_name)!;
    const a = table.get(m.away_team_name)!;
    h.played++; a.played++;
    h.gf += hs; h.ga += as; a.gf += as; a.ga += hs;
    if (hs > as) { h.won++; h.points += 3; a.lost++; }
    else if (hs < as) { a.won++; a.points += 3; h.lost++; }
    else { h.drawn++; a.drawn++; h.points++; a.points++; }
  }
  const rows = [...table.values()];
  for (const r of rows) r.gd = r.gf - r.ga;
  rows.sort((x, y) => y.points - x.points || y.gd - x.gd || y.gf - x.gf);
  return applyHeadToHeadTiebreak(rows, playedMatches);
}

/** Like groupStandingsSim, but matches between two OTHER teams in the group
 *  (neither side is `userTeamName`) are resolved by elo via quickSimScore —
 *  though only once the user has reached that matchday themselves, so every
 *  team stays in lockstep on the shared calendar instead of the other three
 *  looking like they've already finished the group stage on day one. The
 *  user's own fixtures still only count once actually played: no preview of
 *  a match they haven't kicked off yet. */
export function groupStandingsHub(
  data: TournamentData,
  groupLetter: string,
  played: PlayedMap,
  userTeamName: string
): StandingRow[] {
  const groupTeams = data.teams.filter((t) => t.group_letter === groupLetter);
  const elo = eloOf(data);
  const table = new Map<string, StandingRow>();
  for (const t of groupTeams) {
    table.set(t.team_name, {
      teamName: t.team_name,
      fifaCode: t.fifa_code,
      played: 0, won: 0, drawn: 0, lost: 0, gf: 0, ga: 0, gd: 0, points: 0,
    });
  }
  const groupMatchRows = data.matches.filter(
    (m) => m.stage_name === "Group Stage" && table.has(m.home_team_name) && table.has(m.away_team_name)
  );

  // the latest matchday date the user has actually played, on the group's
  // shared calendar — other teams' results only reveal up through this date
  const userPlayedDates = groupMatchRows
    .filter((m) => (m.home_team_name === userTeamName || m.away_team_name === userTeamName) && played[m.match_id])
    .map((m) => m.date)
    .sort();
  const referenceDate = userPlayedDates.length > 0 ? userPlayedDates[userPlayedDates.length - 1] : null;

  const playedMatches: PlayedGoals[] = [];
  for (const m of groupMatchRows) {
    const result = played[m.match_id];
    let hs: number;
    let as: number;
    if (result) {
      hs = result.homeGoals;
      as = result.awayGoals;
    } else if (m.home_team_name === userTeamName || m.away_team_name === userTeamName) {
      continue; // the user hasn't played this fixture yet — no preview
    } else if (!referenceDate || m.date > referenceDate) {
      continue; // this matchday hasn't happened for the user yet either
    } else {
      const seed = (m.match_id * 100003) >>> 0;
      const homeElo = elo.get(m.home_team_name)?.elo ?? 1600;
      const awayElo = elo.get(m.away_team_name)?.elo ?? 1600;
      const r = quickSimScore(seed, homeElo, awayElo);
      hs = r.home;
      as = r.away;
    }
    playedMatches.push({ home: m.home_team_name, away: m.away_team_name, hs, as });
    const h = table.get(m.home_team_name)!;
    const a = table.get(m.away_team_name)!;
    h.played++; a.played++;
    h.gf += hs; h.ga += as; a.gf += as; a.ga += hs;
    if (hs > as) { h.won++; h.points += 3; a.lost++; }
    else if (hs < as) { a.won++; a.points += 3; h.lost++; }
    else { h.drawn++; a.drawn++; h.points++; a.points++; }
  }
  const rows = [...table.values()];
  for (const r of rows) r.gd = r.gf - r.ga;
  rows.sort((x, y) => y.points - x.points || y.gd - x.gd || y.gf - x.gf);
  return applyHeadToHeadTiebreak(rows, playedMatches);
}

/** Monte Carlo estimate of `teamName` finishing top-2 in its group, simulating
 *  any unplayed group matches by elo via quickSimScore. Already-played results
 *  are held fixed each trial, so this updates as soon as a new match completes. */
export function qualificationProbability(
  data: TournamentData,
  groupLetter: string,
  played: PlayedMap,
  teamName: string,
  trials = 400
): number {
  const groupTeams = data.teams.filter((t) => t.group_letter === groupLetter);
  const elo = eloOf(data);
  const groupMatchRows = data.matches.filter(
    (m) =>
      m.stage_name === "Group Stage" &&
      groupTeams.some((t) => t.team_name === m.home_team_name) &&
      groupTeams.some((t) => t.team_name === m.away_team_name)
  );
  const remaining = groupMatchRows.filter((m) => !played[m.match_id]);

  if (remaining.length === 0) {
    const rows = groupStandingsSim(data, groupLetter, played);
    const pos = rows.findIndex((r) => r.teamName === teamName) + 1;
    return pos >= 1 && pos <= 2 ? 100 : 0;
  }

  let top2Count = 0;
  for (let trial = 0; trial < trials; trial++) {
    const table = new Map<string, StandingRow>();
    for (const t of groupTeams) {
      table.set(t.team_name, {
        teamName: t.team_name,
        fifaCode: t.fifa_code,
        played: 0, won: 0, drawn: 0, lost: 0, gf: 0, ga: 0, gd: 0, points: 0,
      });
    }
    const playedMatches: PlayedGoals[] = [];
    for (const m of groupMatchRows) {
      const result = played[m.match_id];
      let hs: number;
      let as: number;
      if (result) {
        hs = result.homeGoals;
        as = result.awayGoals;
      } else {
        const seed = (trial * 100003 + m.match_id * 7919) >>> 0;
        const homeElo = elo.get(m.home_team_name)?.elo ?? 1600;
        const awayElo = elo.get(m.away_team_name)?.elo ?? 1600;
        const r = quickSimScore(seed, homeElo, awayElo);
        hs = r.home;
        as = r.away;
      }
      playedMatches.push({ home: m.home_team_name, away: m.away_team_name, hs, as });
      const h = table.get(m.home_team_name)!;
      const a = table.get(m.away_team_name)!;
      h.played++; a.played++;
      h.gf += hs; h.ga += as; a.gf += as; a.ga += hs;
      if (hs > as) { h.won++; h.points += 3; a.lost++; }
      else if (hs < as) { a.won++; a.points += 3; h.lost++; }
      else { h.drawn++; a.drawn++; h.points++; a.points++; }
    }
    let rows = [...table.values()];
    for (const r of rows) r.gd = r.gf - r.ga;
    rows.sort((x, y) => y.points - x.points || y.gd - x.gd || y.gf - x.gf);
    rows = applyHeadToHeadTiebreak(rows, playedMatches);
    const pos = rows.findIndex((r) => r.teamName === teamName) + 1;
    if (pos >= 1 && pos <= 2) top2Count++;
  }
  return Math.round((top2Count / trials) * 100);
}

const GROUPS = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L"];

export function allGroupStandings(data: TournamentData, played: PlayedMap): Record<string, StandingRow[]> {
  const out: Record<string, StandingRow[]> = {};
  for (const g of GROUPS) out[g] = groupStandingsSim(data, g, played);
  return out;
}

/** Like groupStandingsSim, but any match missing from `played` (i.e. every match
 *  outside the user's own group) is filled in deterministically by elo via
 *  quickSimScore, so every group resolves to a real table instead of 0-0-0s. */
export function groupStandingsFull(
  data: TournamentData,
  groupLetter: string,
  played: PlayedMap
): StandingRow[] {
  const groupTeams = data.teams.filter((t) => t.group_letter === groupLetter);
  const elo = eloOf(data);
  const table = new Map<string, StandingRow>();
  for (const t of groupTeams) {
    table.set(t.team_name, {
      teamName: t.team_name,
      fifaCode: t.fifa_code,
      played: 0, won: 0, drawn: 0, lost: 0, gf: 0, ga: 0, gd: 0, points: 0,
    });
  }
  const playedMatches: PlayedGoals[] = [];
  for (const m of data.matches) {
    if (m.stage_name !== "Group Stage") continue;
    if (!table.has(m.home_team_name) || !table.has(m.away_team_name)) continue;
    const result = played[m.match_id];
    let hs: number;
    let as: number;
    if (result) {
      hs = result.homeGoals;
      as = result.awayGoals;
    } else {
      const seed = (m.match_id * 100003) >>> 0;
      const homeElo = elo.get(m.home_team_name)?.elo ?? 1600;
      const awayElo = elo.get(m.away_team_name)?.elo ?? 1600;
      const r = quickSimScore(seed, homeElo, awayElo);
      hs = r.home;
      as = r.away;
    }
    playedMatches.push({ home: m.home_team_name, away: m.away_team_name, hs, as });
    const h = table.get(m.home_team_name)!;
    const a = table.get(m.away_team_name)!;
    h.played++; a.played++;
    h.gf += hs; h.ga += as; a.gf += as; a.ga += hs;
    if (hs > as) { h.won++; h.points += 3; a.lost++; }
    else if (hs < as) { a.won++; a.points += 3; h.lost++; }
    else { h.drawn++; a.drawn++; h.points++; a.points++; }
  }
  const rows = [...table.values()];
  for (const r of rows) r.gd = r.gf - r.ga;
  rows.sort((x, y) => y.points - x.points || y.gd - x.gd || y.gf - x.gf);
  return applyHeadToHeadTiebreak(rows, playedMatches);
}

/** allGroupStandings, but every group is fully resolved (see groupStandingsFull).
 *  Use this — not allGroupStandings — for anything that needs a coherent whole-
 *  tournament picture (KO qualifiers, the tournament-wide leaderboard). */
export function allGroupStandingsFull(data: TournamentData, played: PlayedMap): Record<string, StandingRow[]> {
  const out: Record<string, StandingRow[]> = {};
  for (const g of GROUPS) out[g] = groupStandingsFull(data, g, played);
  return out;
}

// ---------- qualifiers + bracket ----------

export interface KOTeam {
  name: string;
  code: string;
  elo: number;
  group: string;
  pos: number; // 1 winner, 2 runner-up, 3 third
}

function seedScore(r: StandingRow): number {
  return r.points * 1000 + r.gd * 10 + r.gf;
}

/** 12 winners + 12 runners-up + 8 best thirds, ordered strongest→weakest. */
export function getQualifiers(
  data: TournamentData,
  standings: Record<string, StandingRow[]>
): KOTeam[] {
  const elo = eloOf(data);
  const mk = (r: StandingRow, g: string, pos: number): KOTeam => ({
    name: r.teamName, code: r.fifaCode, elo: elo.get(r.teamName)?.elo ?? 1600, group: g, pos,
  });
  const winners: { r: StandingRow; g: string }[] = [];
  const runners: { r: StandingRow; g: string }[] = [];
  const thirds: { r: StandingRow; g: string }[] = [];
  for (const g of GROUPS) {
    const rows = standings[g];
    if (rows[0]) winners.push({ r: rows[0], g });
    if (rows[1]) runners.push({ r: rows[1], g });
    if (rows[2]) thirds.push({ r: rows[2], g });
  }
  const bySeed = (a: { r: StandingRow }, b: { r: StandingRow }) => seedScore(b.r) - seedScore(a.r);
  winners.sort(bySeed); runners.sort(bySeed); thirds.sort(bySeed);
  const best8 = thirds.slice(0, 8);
  return [
    ...winners.map((x) => mk(x.r, x.g, 1)),
    ...runners.map((x) => mk(x.r, x.g, 2)),
    ...best8.map((x) => mk(x.r, x.g, 3)),
  ];
}

/** Pair the 32 qualifiers into 16 Round-of-32 ties: same strong-vs-weak
 *  seeding as a plain index/mirrored-index pairing, but swapped to avoid
 *  ever pairing two teams that came out of the same group, matching how
 *  real World Cup draws are seeded. Falls back to the plain pairing for a
 *  spot if no clash-free swap is available. */
function seedRound32Pairs(qualifiers: KOTeam[]): [KOTeam | null, KOTeam | null][] {
  const n = qualifiers.length;
  const half = Math.ceil(n / 2);
  const pairs: [KOTeam | null, KOTeam | null][] = [];
  for (let m = 0; m < half; m++) {
    pairs.push([qualifiers[m] ?? null, qualifiers[n - 1 - m] ?? null]);
  }

  const sameGroup = (a: KOTeam | null, b: KOTeam | null) => !!a && !!b && a.group === b.group;

  for (let i = 0; i < pairs.length; i++) {
    if (!sameGroup(pairs[i][0], pairs[i][1])) continue;
    for (let d = 1; d < pairs.length; d++) {
      const j = d % 2 === 1 ? i + Math.ceil(d / 2) : i - d / 2;
      if (j < 0 || j >= pairs.length || j === i) continue;
      const candidate = pairs[j][1];
      if (sameGroup(pairs[i][0], candidate)) continue; // would still clash
      if (sameGroup(pairs[j][0], pairs[i][1])) continue; // would clash the other pair instead
      const tmp = pairs[i][1];
      pairs[i][1] = candidate;
      pairs[j][1] = tmp;
      break;
    }
  }
  return pairs;
}

export interface KOMatch {
  id: string;
  round: number; // 0=R32 … 4=Final
  a: KOTeam | null;
  b: KOTeam | null;
  winner: KOTeam | null;
  played: boolean;
  isUser: boolean;
  aGoals: number | null;
  bGoals: number | null;
  pens: boolean;
  venue: Venue;
}

export const KO_ROUND_KO = ["32강", "16강", "8강", "4강", "결승"];
export const KO_ROUND_EN = ["Round of 32", "Round of 16", "Quarter-finals", "Semi-finals", "Final"];
const KO_SIZES = [16, 8, 4, 2, 1];

function hashNum(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** user KO results: koId -> {userGoals, oppGoals}, plus a shootout outcome if it went there */
export type KOResults = Record<
  string,
  {
    userGoals: number;
    oppGoals: number;
    wentToPenalties?: boolean;
    userPenGoals?: number;
    oppPenGoals?: number;
  }
>;

function koSimWinner(seed: number, a: KOTeam, b: KOTeam) {
  const r = quickSimScore(seed, a.elo, b.elo);
  if (r.home > r.away) return { winner: a, a: r.home, b: r.away, pens: false };
  if (r.away > r.home) return { winner: b, a: r.home, b: r.away, pens: false };
  const w = mulberry32(seed * 7 + 3)() < 0.5 ? a : b;
  return { winner: w, a: r.home, b: r.away, pens: true };
}

export function buildBracket(
  data: TournamentData,
  qualifiers: KOTeam[],
  koResults: KOResults,
  userTeamName: string
): KOMatch[][] {
  const venues = data.venues;
  const rounds: KOMatch[][] = [];
  let prevWinners: (KOTeam | null)[] = [];
  const round32Pairs = seedRound32Pairs(qualifiers);

  for (let r = 0; r < 5; r++) {
    const matches: KOMatch[] = [];
    for (let m = 0; m < KO_SIZES[r]; m++) {
      const id = `${r}-${m}`;
      let a: KOTeam | null = null;
      let b: KOTeam | null = null;
      if (r === 0) {
        [a, b] = round32Pairs[m] ?? [null, null];
      } else {
        a = prevWinners[2 * m] ?? null;
        b = prevWinners[2 * m + 1] ?? null;
      }
      const venue = venues[hashNum(id) % venues.length];
      let winner: KOTeam | null = null;
      let played = false;
      let aGoals: number | null = null;
      let bGoals: number | null = null;
      let pens = false;
      let isUser = false;

      if (a && b) {
        const aUser = a.name === userTeamName;
        const bUser = b.name === userTeamName;
        isUser = aUser || bUser;
        if (isUser) {
          const res = koResults[id];
          if (res) {
            played = true;
            aGoals = aUser ? res.userGoals : res.oppGoals;
            bGoals = aUser ? res.oppGoals : res.userGoals;
            if (aGoals > bGoals) winner = a;
            else if (bGoals > aGoals) winner = b;
            else if (res.wentToPenalties) {
              pens = true;
              const userWonPens = (res.userPenGoals ?? 0) > (res.oppPenGoals ?? 0);
              winner = aUser ? (userWonPens ? a : b) : userWonPens ? b : a;
            } else {
              winner = mulberry32(hashNum(id))() < 0.5 ? a : b;
              pens = true;
            }
          }
        } else {
          const w = koSimWinner(hashNum(id) + a.elo + b.elo, a, b);
          winner = w.winner; aGoals = w.a; bGoals = w.b; pens = w.pens; played = true;
        }
      }
      matches.push({ id, round: r, a, b, winner, played, isUser, aGoals, bGoals, pens, venue });
    }
    rounds.push(matches);
    prevWinners = matches.map((mt) => mt.winner);
  }
  return rounds;
}

/** the user's next unplayed knockout match, if any (blocks until played). */
export function nextUserKOMatch(rounds: KOMatch[][], userTeamName: string): KOMatch | null {
  for (const round of rounds) {
    for (const m of round) {
      if (
        m.isUser && !m.played && m.a && m.b &&
        (m.a.name === userTeamName || m.b.name === userTeamName)
      ) {
        return m;
      }
    }
  }
  return null;
}

export function champion(rounds: KOMatch[][]): KOTeam | null {
  return rounds[4]?.[0]?.winner ?? null;
}

export interface TeamTournamentRecord {
  played: number;
  won: number;
  drawn: number;
  lost: number;
  gf: number;
  ga: number;
}

/** A team's combined group-stage + knockout record across the whole tournament. */
export function teamTournamentRecord(
  standings: Record<string, StandingRow[]>,
  rounds: KOMatch[][],
  teamName: string
): TeamTournamentRecord {
  const rec: TeamTournamentRecord = { played: 0, won: 0, drawn: 0, lost: 0, gf: 0, ga: 0 };
  for (const rows of Object.values(standings)) {
    const row = rows.find((r) => r.teamName === teamName);
    if (row) {
      rec.played += row.played;
      rec.won += row.won;
      rec.drawn += row.drawn;
      rec.lost += row.lost;
      rec.gf += row.gf;
      rec.ga += row.ga;
      break;
    }
  }
  for (const round of rounds) {
    for (const m of round) {
      if (!m.a || !m.b || !m.played || m.aGoals == null || m.bGoals == null) continue;
      const isA = m.a.name === teamName;
      const isB = m.b.name === teamName;
      if (!isA && !isB) continue;
      const gf = isA ? m.aGoals : m.bGoals;
      const ga = isA ? m.bGoals : m.aGoals;
      rec.played++;
      rec.gf += gf;
      rec.ga += ga;
      if (gf > ga) rec.won++;
      else if (gf < ga) rec.lost++;
      else rec.drawn++; // includes ties decided on penalties
    }
  }
  return rec;
}

// ---------- tournament-wide individual awards ----------

export interface TournamentLeader {
  playerId: number;
  name: string;
  teamName: string;
  teamCode: string;
  goals: number;
  assists: number;
}

/** how often each position gets picked as a goal scorer / assist provider */
const SCORER_WEIGHT: Record<Position, number> = { GK: 0.02, DEF: 0.12, MID: 0.32, FWD: 0.54 };
const ASSIST_BONUS = 0.15;

function pickWeighted(rng: () => number, players: Player[], weightFor: (p: Player) => number): Player | null {
  if (players.length === 0) return null;
  const total = players.reduce((sum, p) => sum + Math.max(0.001, weightFor(p)), 0);
  let cursor = rng() * total;
  for (const p of players) {
    cursor -= Math.max(0.001, weightFor(p));
    if (cursor <= 0) return p;
  }
  return players[players.length - 1];
}

function scorerWeight(p: Player): number {
  return SCORER_WEIGHT[p.position] * ((p.ability?.overall ?? 65) / 65);
}

function bumpLeader(
  map: Map<number, TournamentLeader>,
  player: Player,
  teamName: string,
  teamCode: string,
  field: "goals" | "assists"
) {
  const prev = map.get(player.player_id) ?? {
    playerId: player.player_id,
    name: player.player_name,
    teamName,
    teamCode,
    goals: 0,
    assists: 0,
  };
  prev[field] += 1;
  map.set(player.player_id, prev);
}

function attributeMatchGoals(
  map: Map<number, TournamentLeader>,
  seed: number,
  homeName: string,
  homeCode: string,
  awayName: string,
  awayCode: string,
  homePlayers: Player[],
  awayPlayers: Player[],
  homeGoals: number,
  awayGoals: number
) {
  const rng = mulberry32(seed);
  const score = (teamName: string, teamCode: string, squad: Player[], goals: number) => {
    for (let i = 0; i < goals; i++) {
      const scorer = pickWeighted(rng, squad, scorerWeight);
      if (!scorer) continue;
      bumpLeader(map, scorer, teamName, teamCode, "goals");
      if (rng() < 0.68) {
        const pool = squad.filter((p) => p.player_id !== scorer.player_id);
        const assister = pickWeighted(rng, pool, (p) => scorerWeight(p) + ASSIST_BONUS);
        if (assister) bumpLeader(map, assister, teamName, teamCode, "assists");
      }
    }
  };
  score(homeName, homeCode, homePlayers, homeGoals);
  score(awayName, awayCode, awayPlayers, awayGoals);
}

/** Tournament-wide golden boot / playmaker award, across all 48 teams and every
 *  match (group + knockout). Every match not actually played by the user is
 *  resolved deterministically by elo (same source as groupStandingsFull /
 *  buildBracket), then goals are attributed to specific squad players by a
 *  position/ability-weighted pick. The user's own matches are corrected
 *  afterwards with their real, precisely-tracked per-player leaderboard. */
export function buildTournamentLeaderboard(
  data: TournamentData,
  played: PlayedMap,
  rounds: KOMatch[][],
  userTeamName: string,
  userLeaderboard: Leaderboard
): { topScorers: TournamentLeader[]; topAssists: TournamentLeader[] } {
  const map = new Map<number, TournamentLeader>();
  const teamByName = new Map(data.teams.map((t) => [t.team_name, t]));
  const elo = eloOf(data);
  const playersByTeamId = new Map<number, Player[]>();
  const playersOf = (teamName: string): Player[] => {
    const team = teamByName.get(teamName);
    if (!team) return [];
    if (!playersByTeamId.has(team.team_id)) {
      playersByTeamId.set(team.team_id, data.players.filter((p) => p.team_id === team.team_id));
    }
    return playersByTeamId.get(team.team_id)!;
  };

  for (const m of data.matches) {
    if (m.stage_name !== "Group Stage") continue;
    const home = teamByName.get(m.home_team_name);
    const away = teamByName.get(m.away_team_name);
    if (!home || !away) continue;
    const result = played[m.match_id];
    let hs: number;
    let as: number;
    if (result) {
      hs = result.homeGoals;
      as = result.awayGoals;
    } else {
      const seed = (m.match_id * 100003) >>> 0;
      const r = quickSimScore(seed, elo.get(home.team_name)?.elo ?? 1600, elo.get(away.team_name)?.elo ?? 1600);
      hs = r.home;
      as = r.away;
    }
    attributeMatchGoals(
      map,
      (m.match_id * 7 + 13) >>> 0,
      home.team_name, home.fifa_code,
      away.team_name, away.fifa_code,
      playersOf(home.team_name), playersOf(away.team_name),
      hs, as
    );
  }

  for (const round of rounds) {
    for (const m of round) {
      if (!m.a || !m.b || m.aGoals == null || m.bGoals == null) continue;
      attributeMatchGoals(
        map,
        (hashNum(m.id) * 3 + 1) >>> 0,
        m.a.name, m.a.code,
        m.b.name, m.b.code,
        playersOf(m.a.name), playersOf(m.b.name),
        m.aGoals, m.bGoals
      );
    }
  }

  // overwrite the user's own players with their real, exactly-tracked record
  const userTeam = teamByName.get(userTeamName);
  if (userTeam) {
    const userPlayers = playersOf(userTeamName);
    for (const entry of Object.values(userLeaderboard)) {
      const player = userPlayers.find((p) => p.player_name === entry.name);
      if (!player) continue;
      map.set(player.player_id, {
        playerId: player.player_id,
        name: player.player_name,
        teamName: userTeam.team_name,
        teamCode: userTeam.fifa_code,
        goals: entry.goals,
        assists: entry.assists,
      });
    }
  }

  const all = [...map.values()];
  const topScorers = [...all].filter((e) => e.goals > 0).sort((a, b) => b.goals - a.goals || b.assists - a.assists).slice(0, 5);
  const topAssists = [...all].filter((e) => e.assists > 0).sort((a, b) => b.assists - a.assists || b.goals - a.goals).slice(0, 5);
  return { topScorers, topAssists };
}
