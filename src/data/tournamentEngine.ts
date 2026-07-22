import { mulberry32, quickSimScore } from "./matchSim";
import type { PlayedMap, StandingRow } from "./tournament";
import type { TournamentData, Venue } from "./types";

// ---------- group stage ----------

function eloOf(data: TournamentData): Map<string, { elo: number; code: string }> {
  const m = new Map<string, { elo: number; code: string }>();
  for (const t of data.teams) m.set(t.team_name, { elo: t.elo_rating, code: t.fifa_code });
  return m;
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
  for (const m of data.matches) {
    if (m.stage_name !== "Group Stage") continue;
    if (!names.has(m.home_team_name) || !names.has(m.away_team_name)) continue;
    const result = played[m.match_id];
    if (!result) continue;
    const hs = result.homeGoals;
    const as = result.awayGoals;
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
  return rows;
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

  for (let r = 0; r < 5; r++) {
    const matches: KOMatch[] = [];
    for (let m = 0; m < KO_SIZES[r]; m++) {
      const id = `${r}-${m}`;
      let a: KOTeam | null = null;
      let b: KOTeam | null = null;
      if (r === 0) {
        a = qualifiers[m] ?? null;
        b = qualifiers[31 - m] ?? null;
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
