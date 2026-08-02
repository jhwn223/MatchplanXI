import { mulberry32, quickSimScore, BALANCED_SIM_TACTICS } from "./matchSim";
import { buildVenueByStadium, getTeamMatches } from "./tournament";
import type { PlayedMap, StandingRow } from "./tournament";
import type { Leaderboard } from "./leaderboard";
import type { Player, Position, TournamentData, Venue } from "./types";
import { buildTeamAbilityProfile, selectBestEleven } from "./playerAbility";
import type { TeamAbilityProfile } from "./playerAbility";
import { jetLagPenalty, restPenalty, travelPenalty } from "./conditionEngine";

// ---------- group stage ----------

function eloOf(data: TournamentData): Map<string, { elo: number; code: string }> {
  const m = new Map<string, { elo: number; code: string }>();
  for (const t of data.teams) m.set(t.team_name, { elo: t.elo_rating, code: t.fifa_code });
  return m;
}

const abilityCache = new WeakMap<TournamentData, Map<string, TeamAbilityProfile>>();

/** Real squad quality (from each team's best XI), used to drive the quick
 *  (non-live) simulator instead of a flat elo number. Memoized per `data`
 *  reference — every group/knockout tie is simulated from the same source,
 *  so this would otherwise get recomputed for all 48 teams on every call. */
function abilityByTeam(data: TournamentData): Map<string, TeamAbilityProfile> {
  const cached = abilityCache.get(data);
  if (cached) return cached;
  const squadByTeamId = new Map<number, Player[]>();
  for (const p of data.players) {
    const list = squadByTeamId.get(p.team_id);
    if (list) list.push(p);
    else squadByTeamId.set(p.team_id, [p]);
  }
  const out = new Map<string, TeamAbilityProfile>();
  for (const t of data.teams) {
    out.set(t.team_name, buildTeamAbilityProfile(selectBestEleven(squadByTeamId.get(t.team_id) ?? [])));
  }
  abilityCache.set(data, out);
  return out;
}

interface MatchSimContext {
  elevation: number;
  homeConditionIndex: number;
  awayConditionIndex: number;
}

const simContextCache = new WeakMap<TournamentData, Map<number, MatchSimContext>>();

/** Venue elevation plus a schedule-derived condition index (rest days, travel
 *  distance, jet lag since each team's previous fixture) for every match —
 *  the same real fixture context `getTeamMatches` already computes for the
 *  user's own matches, applied here to every team so the background/AI
 *  matches the quick simulator fills in feel the same pressures. Altitude is
 *  intentionally left out of the condition index itself: `quickSimScore`
 *  already applies elevation as its own fatigue term, so folding it in here
 *  too would double-count it. */
function simContextByMatch(data: TournamentData): Map<number, MatchSimContext> {
  const cached = simContextCache.get(data);
  if (cached) return cached;
  const venueByStadium = buildVenueByStadium(data);
  const conditionByTeamAndMatch = new Map<string, number>();
  for (const t of data.teams) {
    for (const tm of getTeamMatches(data, t.team_name)) {
      const penalty = restPenalty(tm.restDays) + travelPenalty(tm.travelKm) + jetLagPenalty(tm.tzShiftHours);
      conditionByTeamAndMatch.set(`${t.team_name}:${tm.match.match_id}`, Math.min(100, Math.max(0, 100 - penalty)));
    }
  }
  const out = new Map<number, MatchSimContext>();
  for (const m of data.matches) {
    out.set(m.match_id, {
      elevation: venueByStadium.get(m.stadium_name)?.elevation_meters ?? 0,
      homeConditionIndex: conditionByTeamAndMatch.get(`${m.home_team_name}:${m.match_id}`) ?? 72,
      awayConditionIndex: conditionByTeamAndMatch.get(`${m.away_team_name}:${m.match_id}`) ?? 72,
    });
  }
  simContextCache.set(data, out);
  return out;
}

/** Builds the richer `quickSimScore` options object (real ability, schedule-
 *  derived condition, venue elevation, home advantage) for a given fixture,
 *  in place of the flat elo-only call. AI-vs-AI tactics default to balanced
 *  since no real tactical choice exists for a team the user isn't managing. */
function quickSimOptions(
  homeTeam: string,
  awayTeam: string,
  ability: Map<string, TeamAbilityProfile>,
  context?: MatchSimContext,
) {
  return {
    homeAbility: ability.get(homeTeam),
    awayAbility: ability.get(awayTeam),
    homeConditionIndex: context?.homeConditionIndex,
    awayConditionIndex: context?.awayConditionIndex,
    homeTactics: BALANCED_SIM_TACTICS,
    awayTactics: BALANCED_SIM_TACTICS,
    elevation: context?.elevation,
    homeAdvantage: true,
  };
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
  userTeamName: string,
  tournamentSeed = 0,
): StandingRow[] {
  const groupTeams = data.teams.filter((t) => t.group_letter === groupLetter);
  const elo = eloOf(data);
  const ability = abilityByTeam(data);
  const simContext = simContextByMatch(data);
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
      const seed = mixTournamentSeed(m.match_id * 100003, tournamentSeed);
      const homeElo = elo.get(m.home_team_name)?.elo ?? 1600;
      const awayElo = elo.get(m.away_team_name)?.elo ?? 1600;
      const r = quickSimScore(
        seed,
        homeElo,
        awayElo,
        quickSimOptions(m.home_team_name, m.away_team_name, ability, simContext.get(m.match_id)),
      );
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
  return rows;
}

/** Monte Carlo estimate of advancing to the Round of 32.
 *
 *  The 2026 format advances all 12 group winners/runners-up plus the best
 *  eight third-placed teams. We therefore simulate every unfinished group,
 *  not just the selected team's group; otherwise a third-place probability
 *  cannot be calculated correctly.
 */
export function qualificationProbability(
  data: TournamentData,
  _groupLetter: string,
  played: PlayedMap,
  teamName: string,
  // 400 trials left enough sampling noise that a strong side could draw 400
  // qualifying trials in a row and be reported as certain.
  trials = 1200,
  tournamentSeed = 0,
): number {
  const elo = eloOf(data);
  const ability = abilityByTeam(data);
  const simContext = simContextByMatch(data);
  const groupMatches = data.matches.filter((m) => m.stage_name === "Group Stage");
  const hasRemaining = groupMatches.some((m) => !played[m.match_id]);
  const completedStandings = () =>
    Object.fromEntries(GROUPS.map((group) => [group, groupStandingsSim(data, group, played)]));
  if (!hasRemaining) {
    return getQualifiers(data, completedStandings()).some((team) => team.name === teamName)
      ? 100
      : 0;
  }

  let qualifiedCount = 0;
  for (let trial = 0; trial < trials; trial++) {
    const trialPlayed: PlayedMap = { ...played };
    for (const match of groupMatches) {
      if (trialPlayed[match.match_id]) continue;
      const seed = mixTournamentSeed(trial * 100_003 + match.match_id * 7_919, tournamentSeed);
      const result = quickSimScore(
        seed,
        elo.get(match.home_team_name)?.elo ?? 1600,
        elo.get(match.away_team_name)?.elo ?? 1600,
        quickSimOptions(match.home_team_name, match.away_team_name, ability, simContext.get(match.match_id)),
      );
      trialPlayed[match.match_id] = {
        homeGoals: result.home,
        awayGoals: result.away,
      };
    }
    const standings = Object.fromEntries(
      GROUPS.map((group) => [group, groupStandingsSim(data, group, trialPlayed)]),
    );
    if (getQualifiers(data, standings).some((team) => team.name === teamName)) {
      qualifiedCount++;
    }
  }
  // Group matches are still to be played, so neither outcome is settled. A
  // top seed genuinely sits above 99% here (the 2026 format advances 32 of 48
  // teams), but rounding that to a flat 100% reads as a guarantee the
  // simulation cannot make.
  const percent = Math.round((qualifiedCount / trials) * 100);
  return Math.min(99, Math.max(1, percent));
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
  played: PlayedMap,
  tournamentSeed = 0,
): StandingRow[] {
  const groupTeams = data.teams.filter((t) => t.group_letter === groupLetter);
  const elo = eloOf(data);
  const ability = abilityByTeam(data);
  const simContext = simContextByMatch(data);
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
    if (!table.has(m.home_team_name) || !table.has(m.away_team_name)) continue;
    const result = played[m.match_id];
    let hs: number;
    let as: number;
    if (result) {
      hs = result.homeGoals;
      as = result.awayGoals;
    } else {
      const seed = mixTournamentSeed(m.match_id * 100003, tournamentSeed);
      const homeElo = elo.get(m.home_team_name)?.elo ?? 1600;
      const awayElo = elo.get(m.away_team_name)?.elo ?? 1600;
      const r = quickSimScore(
        seed,
        homeElo,
        awayElo,
        quickSimOptions(m.home_team_name, m.away_team_name, ability, simContext.get(m.match_id)),
      );
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
  return rows;
}

/** allGroupStandings, but every group is fully resolved (see groupStandingsFull).
 *  Use this — not allGroupStandings — for anything that needs a coherent whole-
 *  tournament picture (KO qualifiers, the tournament-wide leaderboard). */
export function allGroupStandingsFull(
  data: TournamentData,
  played: PlayedMap,
  tournamentSeed = 0,
): Record<string, StandingRow[]> {
  const out: Record<string, StandingRow[]> = {};
  for (const g of GROUPS) out[g] = groupStandingsFull(data, g, played, tournamentSeed);
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
  const fifaRanking = new Map(
    data.teams.map((team) => [team.team_name, team.fifa_ranking_pre_tournament]),
  );
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
  const bySeed = (a: { r: StandingRow }, b: { r: StandingRow }) =>
    seedScore(b.r) - seedScore(a.r) ||
    (fifaRanking.get(a.r.teamName) ?? 999) - (fifaRanking.get(b.r.teamName) ?? 999);
  winners.sort(bySeed); runners.sort(bySeed); thirds.sort(bySeed);
  const best8 = thirds.slice(0, 8);
  return [
    ...winners.map((x) => mk(x.r, x.g, 1)),
    ...runners.map((x) => mk(x.r, x.g, 2)),
    ...best8.map((x) => mk(x.r, x.g, 3)),
  ];
}

/**
 * Official 2026 Round-of-32 slot structure.
 *
 * The order is intentionally the bracket path, rather than chronological
 * match number: adjacent entries feed one Round-of-16 tie, then adjacent
 * Round-of-16 winners feed the published quarter-final path.
 */
function officialRound32Pairs(
  qualifiers: KOTeam[],
): [KOTeam | null, KOTeam | null][] {
  const ranked = (group: string, pos: number) =>
    qualifiers.find((team) => team.group === group && team.pos === pos) ?? null;
  const thirds = qualifiers.filter((team) => team.pos === 3);
  const thirdSlots = [
    { key: "1E", allowed: "ABCDF" },
    { key: "1I", allowed: "CDFGH" },
    { key: "1D", allowed: "BEFIJ" },
    { key: "1G", allowed: "AEHIJ" },
    { key: "1A", allowed: "CEFHI" },
    { key: "1L", allowed: "EHIJK" },
    { key: "1B", allowed: "EFGIJ" },
    { key: "1K", allowed: "DEIJL" },
  ];
  const assigned = new Map<string, KOTeam>();

  const assign = (index: number, used: Set<string>): boolean => {
    if (index >= thirdSlots.length) return true;
    const slot = thirdSlots[index];
    for (const team of thirds) {
      if (used.has(team.group) || !slot.allowed.includes(team.group)) continue;
      assigned.set(slot.key, team);
      used.add(team.group);
      if (assign(index + 1, used)) return true;
      assigned.delete(slot.key);
      used.delete(team.group);
    }
    return false;
  };
  assign(0, new Set());

  const third = (key: string) => assigned.get(key) ?? null;
  return [
    [ranked("E", 1), third("1E")], // M74 -> M89
    [ranked("I", 1), third("1I")], // M77 -> M89
    [ranked("A", 2), ranked("B", 2)], // M73 -> M90
    [ranked("F", 1), ranked("C", 2)], // M75 -> M90
    [ranked("K", 2), ranked("L", 2)], // M83 -> M93
    [ranked("H", 1), ranked("J", 2)], // M84 -> M93
    [ranked("D", 1), third("1D")], // M81 -> M94
    [ranked("G", 1), third("1G")], // M82 -> M94
    [ranked("C", 1), ranked("F", 2)], // M76 -> M91
    [ranked("E", 2), ranked("I", 2)], // M78 -> M91
    [ranked("A", 1), third("1A")], // M79 -> M92
    [ranked("L", 1), third("1L")], // M80 -> M92
    [ranked("J", 1), ranked("H", 2)], // M86 -> M95
    [ranked("D", 2), ranked("G", 2)], // M88 -> M95
    [ranked("B", 1), third("1B")], // M85 -> M96
    [ranked("K", 1), third("1K")], // M87 -> M96
  ];
}

export interface KOMatch {
  id: string;
  round: number; // 0=R32 … 4=Final
  placement?: "final" | "third";
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

function mixTournamentSeed(base: number, tournamentSeed: number): number {
  return (base ^ Math.imul(tournamentSeed >>> 0, 0x9e3779b1)) >>> 0;
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

function koSimWinner(
  seed: number,
  a: KOTeam,
  b: KOTeam,
  ability: Map<string, TeamAbilityProfile>,
  elevation: number,
) {
  const r = quickSimScore(seed, a.elo, b.elo, quickSimOptions(a.name, b.name, ability, { elevation, homeConditionIndex: 72, awayConditionIndex: 72 }));
  if (r.home > r.away) return { winner: a, a: r.home, b: r.away, pens: false };
  if (r.away > r.home) return { winner: b, a: r.home, b: r.away, pens: false };
  const w = mulberry32(seed * 7 + 3)() < 0.5 ? a : b;
  return { winner: w, a: r.home, b: r.away, pens: true };
}

export function buildBracket(
  data: TournamentData,
  qualifiers: KOTeam[],
  koResults: KOResults,
  userTeamName: string,
  tournamentSeed = 0,
): KOMatch[][] {
  const venues = data.venues;
  const ability = abilityByTeam(data);
  const rounds: KOMatch[][] = [];
  let prevWinners: (KOTeam | null)[] = [];
  const round32Pairs = officialRound32Pairs(qualifiers);

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
          const w = koSimWinner(
            mixTournamentSeed(hashNum(id) + a.elo + b.elo, tournamentSeed),
            a,
            b,
            ability,
            venue.elevation_meters,
          );
          winner = w.winner; aGoals = w.a; bGoals = w.b; pens = w.pens; played = true;
        }
      }
      matches.push({
        id,
        round: r,
        placement: r === 4 ? "final" : undefined,
        a,
        b,
        winner,
        played,
        isUser,
        aGoals,
        bGoals,
        pens,
        venue,
      });
    }
    rounds.push(matches);
    prevWinners = matches.map((mt) => mt.winner);
  }
  const loserOf = (match: KOMatch | undefined): KOTeam | null => {
    if (!match?.played || !match.a || !match.b || !match.winner) return null;
    return match.winner.name === match.a.name ? match.b : match.a;
  };
  const thirdA = loserOf(rounds[3]?.[0]);
  const thirdB = loserOf(rounds[3]?.[1]);
  if (rounds[4]) {
    const id = "4-third";
    const venue = venues[hashNum(id) % venues.length];
    let winner: KOTeam | null = null;
    let played = false;
    let aGoals: number | null = null;
    let bGoals: number | null = null;
    let pens = false;
    let isUser = false;

    if (thirdA && thirdB) {
      const aUser = thirdA.name === userTeamName;
      const bUser = thirdB.name === userTeamName;
      isUser = aUser || bUser;
      if (isUser) {
        const result = koResults[id];
        if (result) {
          played = true;
          aGoals = aUser ? result.userGoals : result.oppGoals;
          bGoals = aUser ? result.oppGoals : result.userGoals;
          if (aGoals > bGoals) winner = thirdA;
          else if (bGoals > aGoals) winner = thirdB;
          else {
            pens = true;
            const userWon =
              result.wentToPenalties &&
              (result.userPenGoals ?? 0) > (result.oppPenGoals ?? 0);
            winner = aUser
              ? (userWon ? thirdA : thirdB)
              : (userWon ? thirdB : thirdA);
          }
        }
      } else {
        const result = koSimWinner(
          mixTournamentSeed(hashNum(id) + thirdA.elo + thirdB.elo, tournamentSeed),
          thirdA,
          thirdB,
          ability,
          venue.elevation_meters,
        );
        winner = result.winner;
        aGoals = result.a;
        bGoals = result.b;
        pens = result.pens;
        played = true;
      }
    }
    rounds[4].push({
      id,
      round: 4,
      placement: "third",
      a: thirdA,
      b: thirdB,
      winner,
      played,
      isUser,
      aGoals,
      bGoals,
      pens,
      venue,
    });
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
  appearances: number;
  goalsConceded: number;
  saves: number;
  cleanSheets: number;
}

/** how often each position gets picked as a goal scorer / assist provider,
 *  within the starting XI (see `attributeMatchGoals`) — weighted toward
 *  forwards so a real Golden-Boot-style leader emerges, matching how
 *  concentrated tournament scoring actually is in the real World Cup. */
const SCORER_WEIGHT: Record<Position, number> = { GK: 0.01, DEF: 0.06, MID: 0.22, FWD: 0.7 };
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
    appearances: 0,
    goalsConceded: 0,
    saves: 0,
    cleanSheets: 0,
  };
  prev[field] += 1;
  map.set(player.player_id, prev);
}

function recordGoalkeeperMatch(
  map: Map<number, TournamentLeader>,
  seed: number,
  teamName: string,
  teamCode: string,
  squad: Player[],
  goalsConceded: number,
) {
  const goalkeeper = squad
    .filter((player) => player.position === "GK")
    .sort((a, b) => (b.ability?.overall ?? 65) - (a.ability?.overall ?? 65))[0];
  if (!goalkeeper) return;
  const previous = map.get(goalkeeper.player_id) ?? {
    playerId: goalkeeper.player_id,
    name: goalkeeper.player_name,
    teamName,
    teamCode,
    goals: 0,
    assists: 0,
    appearances: 0,
    goalsConceded: 0,
    saves: 0,
    cleanSheets: 0,
  };
  const rng = mulberry32(seed);
  const quality = goalkeeper.ability?.overall ?? 65;
  const saves = Math.max(
    0,
    Math.round(1.5 + rng() * 3.5 + (quality - 65) / 18 + goalsConceded * 0.45),
  );
  map.set(goalkeeper.player_id, {
    ...previous,
    appearances: previous.appearances + 1,
    goalsConceded: previous.goalsConceded + goalsConceded,
    saves: previous.saves + saves,
    cleanSheets: previous.cleanSheets + (goalsConceded === 0 ? 1 : 0),
  });
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
  // Goals/assists are attributed within the starting XI, not the full squad —
  // bench players barely feature, and spreading credit across ~26 players
  // diluted every team's top scorer to 2-3 goals for an entire tournament run
  // instead of a real Golden-Boot-range total.
  const score = (teamName: string, teamCode: string, squad: Player[], goals: number) => {
    const xi = selectBestEleven(squad);
    for (let i = 0; i < goals; i++) {
      const scorer = pickWeighted(rng, xi, scorerWeight);
      if (!scorer) continue;
      bumpLeader(map, scorer, teamName, teamCode, "goals");
      if (rng() < 0.68) {
        const pool = xi.filter((p) => p.player_id !== scorer.player_id);
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
): {
  topScorers: TournamentLeader[];
  topAssists: TournamentLeader[];
  topGoalkeepers: TournamentLeader[];
} {
  const map = new Map<number, TournamentLeader>();
  const teamByName = new Map(data.teams.map((t) => [t.team_name, t]));
  const elo = eloOf(data);
  const ability = abilityByTeam(data);
  const simContext = simContextByMatch(data);
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
      const r = quickSimScore(
        seed,
        elo.get(home.team_name)?.elo ?? 1600,
        elo.get(away.team_name)?.elo ?? 1600,
        quickSimOptions(home.team_name, away.team_name, ability, simContext.get(m.match_id)),
      );
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
    recordGoalkeeperMatch(
      map,
      (m.match_id * 17 + 5) >>> 0,
      home.team_name,
      home.fifa_code,
      playersOf(home.team_name),
      as,
    );
    recordGoalkeeperMatch(
      map,
      (m.match_id * 17 + 7) >>> 0,
      away.team_name,
      away.fifa_code,
      playersOf(away.team_name),
      hs,
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
      recordGoalkeeperMatch(
        map,
        (hashNum(m.id) * 11 + 5) >>> 0,
        m.a.name,
        m.a.code,
        playersOf(m.a.name),
        m.bGoals,
      );
      recordGoalkeeperMatch(
        map,
        (hashNum(m.id) * 11 + 7) >>> 0,
        m.b.name,
        m.b.code,
        playersOf(m.b.name),
        m.aGoals,
      );
    }
  }

  // overwrite the user's own players with their real, exactly-tracked record
  const userTeam = teamByName.get(userTeamName);
  if (userTeam) {
    const userPlayers = playersOf(userTeamName);
    for (const entry of Object.values(userLeaderboard)) {
      const player = userPlayers.find(
        (candidate) =>
          candidate.player_id === entry.playerId ||
          candidate.player_name === entry.name,
      );
      if (!player) continue;
      map.set(player.player_id, {
        playerId: player.player_id,
        name: player.player_name,
        teamName: userTeam.team_name,
        teamCode: userTeam.fifa_code,
        goals: entry.goals,
        assists: entry.assists,
        appearances: entry.appearances ?? 0,
        goalsConceded: entry.goalsConceded ?? 0,
        saves: entry.saves ?? 0,
        cleanSheets: entry.cleanSheets ?? 0,
      });
    }
  }

  const all = [...map.values()];
  const topScorers = [...all].filter((e) => e.goals > 0).sort((a, b) => b.goals - a.goals || b.assists - a.assists).slice(0, 5);
  const topAssists = [...all].filter((e) => e.assists > 0).sort((a, b) => b.assists - a.assists || b.goals - a.goals).slice(0, 5);
  const topGoalkeepers = [...all]
    .filter((entry) => entry.appearances >= 3)
    .sort(
      (a, b) =>
        a.goalsConceded / a.appearances - b.goalsConceded / b.appearances ||
        b.cleanSheets - a.cleanSheets ||
        b.saves - a.saves,
    )
    .slice(0, 5);
  return { topScorers, topAssists, topGoalkeepers };
}
