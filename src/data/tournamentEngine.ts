import { mulberry32, quickSimScore } from "./matchSim";
import type { PlayedMap, StandingRow } from "./tournament";
import type { TournamentData, Venue } from "./types";

// ---------- group stage (fully simulated world; user results override) ----------

function eloOf(data: TournamentData): Map<string, { elo: number; code: string }> {
  const m = new Map<string, { elo: number; code: string }>();
  for (const t of data.teams) m.set(t.team_name, { elo: t.elo_rating, code: t.fifa_code });
  return m;
}

/** result of a group match: the user's played score if any, else a deterministic sim */
function resolveGroupMatch(
  matchId: number,
  homeName: string,
  awayName: string,
  played: PlayedMap,
  elo: Map<string, { elo: number; code: string }>
): { home: number; away: number } {
  const p = played[matchId];
  if (p) return { home: p.homeGoals, away: p.awayGoals };
  const eh = elo.get(homeName)?.elo ?? 1600;
  const ea = elo.get(awayName)?.elo ?? 1600;
  return quickSimScore(matchId * 131 + 7, eh, ea);
}

/** last matchday date the user has actually completed in this group, if any. */
function userRevealThroughDate(
  data: TournamentData,
  userTeamName: string | undefined,
  played: PlayedMap
): string | null {
  if (!userTeamName) return null;
  let through: string | null = null;
  for (const m of data.matches) {
    if (m.stage_name !== "Group Stage") continue;
    if (m.home_team_name !== userTeamName && m.away_team_name !== userTeamName) continue;
    if (played[m.match_id] && (through == null || m.date > through)) through = m.date;
  }
  return through;
}

/** Group table. When `userTeamName` is given, only matches the user has actually played
 *  (plus other teams' fixtures on matchdays the user has already reached) are counted —
 *  so the table starts at 0 and fills in as the user progresses, instead of the whole
 *  group being pre-simulated. Omit it (as `allGroupStandings` does for bracket seeding)
 *  to get the fully-simulated final table. */
export function groupStandingsSim(
  data: TournamentData,
  groupLetter: string,
  played: PlayedMap,
  userTeamName?: string,
  elo = eloOf(data)
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
  const revealThrough = userRevealThroughDate(data, userTeamName, played);
  for (const m of data.matches) {
    if (m.stage_name !== "Group Stage") continue;
    if (!names.has(m.home_team_name) || !names.has(m.away_team_name)) continue;

    const isUserMatch = userTeamName != null && (m.home_team_name === userTeamName || m.away_team_name === userTeamName);
    const alreadyPlayed = played[m.match_id] != null;
    if (userTeamName != null && !alreadyPlayed) {
      // gated mode: the user's own unplayed fixtures don't count yet, and other teams'
      // fixtures only reveal once the user has reached that matchday.
      if (isUserMatch) continue;
      if (revealThrough == null || m.date > revealThrough) continue;
    }

    const { home: hs, away: as } = resolveGroupMatch(
      m.match_id, m.home_team_name, m.away_team_name, played, elo
    );
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

const GROUPS = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L"];

export function allGroupStandings(data: TournamentData, played: PlayedMap): Record<string, StandingRow[]> {
  const elo = eloOf(data);
  const out: Record<string, StandingRow[]> = {};
  for (const g of GROUPS) out[g] = groupStandingsSim(data, g, played, undefined, elo);
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

/** user KO results: koId -> {userGoals, oppGoals} */
export type KOResults = Record<string, { userGoals: number; oppGoals: number }>;

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
            else { winner = mulberry32(hashNum(id))() < 0.5 ? a : b; pens = true; }
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
