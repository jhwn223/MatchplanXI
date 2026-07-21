import Papa from "papaparse";
import { koreanizeName } from "./koreanize";
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

  // display all player names in Korean
  for (const p of players) {
    p.player_name = koreanizeName(p.player_name);
  }

  return { teams, venues, players, matches, lineups, predictionFeatures };
}
