import Papa from "papaparse";
import { POSITION_OVERRIDES, ROLE_OVERRIDES } from "./playerOverrides";
import { displayPlayerName } from "./playerNames";
import type {
  LineupRow,
  MatchDetailed,
  Player,
  PredictionFeatureRow,
  Team,
  TournamentData,
  Venue,
} from "./types";

async function parseCsv<T>(path: string): Promise<T[]> {
  const res = await fetch(path);
  const text = await res.text();
  const { data } = Papa.parse<T>(text, {
    header: true,
    dynamicTyping: true,
    skipEmptyLines: true,
  });
  return data;
}

export async function loadTournamentData(): Promise<TournamentData> {
  // BASE_URL accounts for deployments under a subpath (e.g. GitHub Pages
  // project sites at /<repo-name>/) as well as local dev at "/".
  const base = import.meta.env.BASE_URL;
  const [teams, venues, players, matches, lineups, predictionFeatures] =
    await Promise.all([
      parseCsv<Team>(`${base}data/teams.csv`),
      parseCsv<Venue>(`${base}data/venues.csv`),
      parseCsv<Player>(`${base}data/squads_and_players.csv`),
      parseCsv<MatchDetailed>(`${base}data/matches_detailed.csv`),
      parseCsv<LineupRow>(`${base}data/match_lineups.csv`),
      parseCsv<PredictionFeatureRow>(`${base}data/match_prediction_features.csv`),
    ]);

  // correct miscategorised positions/roles, then show the name each player
  // commonly goes by. (overrides are keyed by the original dataset name, so
  // apply them before renaming)
  for (const p of players) {
    const posOv = POSITION_OVERRIDES[p.player_name];
    if (posOv) p.position = posOv;
    const roleOv = ROLE_OVERRIDES[p.player_name];
    if (roleOv) p.preferredRole = roleOv;
    p.player_name = displayPlayerName(p.player_name);
  }

  return { teams, venues, players, matches, lineups, predictionFeatures };
}
