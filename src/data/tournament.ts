import type { MatchDetailed, TournamentData, Venue } from "./types";

/** Stadium name -> venue (for elevation lookup). */
export function buildVenueByStadium(data: TournamentData): Map<string, Venue> {
  const m = new Map<string, Venue>();
  for (const v of data.venues) m.set(v.stadium_name, v);
  return m;
}

export interface TeamMatch {
  match: MatchDetailed;
  isHome: boolean;
  opponentName: string;
  opponentCode: string;
  venue: Venue | undefined;
  elevation: number;
  restDays: number;
  /** index in the team's chronological match list (0-based) */
  order: number;
}

function teamPlaysIn(m: MatchDetailed, teamName: string): boolean {
  return m.home_team_name === teamName || m.away_team_name === teamName;
}

function daysBetween(a: string, b: string): number {
  const da = new Date(a + "T00:00:00Z").getTime();
  const db = new Date(b + "T00:00:00Z").getTime();
  return Math.round((db - da) / 86400000);
}

/** All matches a team plays, chronologically, with derived context. */
export function getTeamMatches(
  data: TournamentData,
  teamName: string
): TeamMatch[] {
  const venueByStadium = buildVenueByStadium(data);
  const rows = data.matches
    .filter((m) => teamPlaysIn(m, teamName))
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.match_id - b.match_id));

  return rows.map((match, i) => {
    const isHome = match.home_team_name === teamName;
    const venue = venueByStadium.get(match.stadium_name);
    const restDays =
      i === 0 ? 7 : Math.max(1, daysBetween(rows[i - 1].date, match.date));
    return {
      match,
      isHome,
      opponentName: isHome ? match.away_team_name : match.home_team_name,
      opponentCode: isHome ? match.away_fifa_code : match.home_fifa_code,
      venue,
      elevation: venue?.elevation_meters ?? 0,
      restDays,
      order: i,
    };
  });
}

/** Minutes the player logged in the team's match immediately preceding `matchId`.
 *  Returns 0 if it's their first match or they didn't feature. */
export function getPlayerMinutesBeforeMatch(
  data: TournamentData,
  teamMatches: TeamMatch[],
  matchId: number,
  playerId: number
): number {
  const idx = teamMatches.findIndex((tm) => tm.match.match_id === matchId);
  if (idx <= 0) return 0;
  const prevMatchId = teamMatches[idx - 1].match.match_id;
  const row = data.lineups.find(
    (l) => l.match_id === prevMatchId && l.player_id === playerId
  );
  return row?.minutes_played ?? 0;
}

export interface StandingRow {
  teamName: string;
  fifaCode: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  gf: number;
  ga: number;
  gd: number;
  points: number;
}

/** Group-stage table for a group letter, computed from actual results. */
export function computeGroupStandings(
  data: TournamentData,
  groupLetter: string
): StandingRow[] {
  const groupTeams = data.teams.filter((t) => t.group_letter === groupLetter);
  const names = new Set(groupTeams.map((t) => t.team_name));

  const table = new Map<string, StandingRow>();
  for (const t of groupTeams) {
    table.set(t.team_name, {
      teamName: t.team_name,
      fifaCode: t.fifa_code,
      played: 0,
      won: 0,
      drawn: 0,
      lost: 0,
      gf: 0,
      ga: 0,
      gd: 0,
      points: 0,
    });
  }

  for (const m of data.matches) {
    if (m.stage_name !== "Group Stage") continue;
    if (!names.has(m.home_team_name) || !names.has(m.away_team_name)) continue;
    if (m.home_score == null || m.away_score == null) continue;

    const h = table.get(m.home_team_name)!;
    const a = table.get(m.away_team_name)!;
    h.played++;
    a.played++;
    h.gf += m.home_score;
    h.ga += m.away_score;
    a.gf += m.away_score;
    a.ga += m.home_score;
    if (m.home_score > m.away_score) {
      h.won++;
      h.points += 3;
      a.lost++;
    } else if (m.home_score < m.away_score) {
      a.won++;
      a.points += 3;
      h.lost++;
    } else {
      h.drawn++;
      a.drawn++;
      h.points += 1;
      a.points += 1;
    }
  }

  const rows = [...table.values()];
  for (const r of rows) r.gd = r.gf - r.ga;
  rows.sort(
    (x, y) => y.points - x.points || y.gd - x.gd || y.gf - x.gf
  );
  return rows;
}

export interface PlayedResult {
  homeGoals: number;
  awayGoals: number;
  /** knockout ties only: set when the scoreline was still level after extra time */
  wentToPenalties?: boolean;
  homePenGoals?: number;
  awayPenGoals?: number;
}
export type PlayedMap = Record<number, PlayedResult>;

/** Group table where the user's played results override the dataset's actual scores. */
export function groupStandingsDynamic(
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
      played: 0,
      won: 0,
      drawn: 0,
      lost: 0,
      gf: 0,
      ga: 0,
      gd: 0,
      points: 0,
    });
  }

  for (const m of data.matches) {
    if (m.stage_name !== "Group Stage") continue;
    if (!names.has(m.home_team_name) || !names.has(m.away_team_name)) continue;
    const override = played[m.match_id];
    const hs = override ? override.homeGoals : m.home_score;
    const as = override ? override.awayGoals : m.away_score;
    if (hs == null || as == null) continue;

    const h = table.get(m.home_team_name)!;
    const a = table.get(m.away_team_name)!;
    h.played++;
    a.played++;
    h.gf += hs;
    h.ga += as;
    a.gf += as;
    a.ga += hs;
    if (hs > as) {
      h.won++;
      h.points += 3;
      a.lost++;
    } else if (hs < as) {
      a.won++;
      a.points += 3;
      h.lost++;
    } else {
      h.drawn++;
      a.drawn++;
      h.points += 1;
      a.points += 1;
    }
  }

  const rows = [...table.values()];
  for (const r of rows) r.gd = r.gf - r.ga;
  rows.sort((x, y) => y.points - x.points || y.gd - x.gd || y.gf - x.gf);
  return rows;
}

/** 1-based finishing position of a team in its (dynamic) group table. */
export function finishingPosition(rows: StandingRow[], teamName: string): number {
  return rows.findIndex((r) => r.teamName === teamName) + 1;
}

export function stageLabelKo(stage: string): string {
  switch (stage) {
    case "Group Stage":
      return "조별리그";
    case "Round of 32":
      return "32강";
    case "Round of 16":
      return "16강";
    case "Quarter-finals":
      return "8강";
    case "Semi-finals":
      return "4강";
    case "Third-place match":
      return "3·4위전";
    case "Final":
      return "결승";
    default:
      return stage;
  }
}
