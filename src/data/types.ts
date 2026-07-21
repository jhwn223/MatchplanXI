export type Position = "GK" | "DEF" | "MID" | "FWD";

export interface Team {
  team_id: number;
  team_name: string;
  fifa_code: string;
  group_letter: string;
  confederation: string;
  fifa_ranking_pre_tournament: number;
  elo_rating: number;
  manager_name: string;
}

export interface Venue {
  venue_id: number;
  stadium_name: string;
  city: string;
  country: string;
  capacity: number;
  latitude: number;
  longitude: number;
  elevation_meters: number;
}

export interface Player {
  player_id: number;
  team_id: number;
  player_name: string;
  position: Position;
  club_team: string;
  market_value_eur: number;
  caps: number;
  date_of_birth: string;
  height_cm: number;
  goals: number;
  /** optional fine-grained role (ST/W/CB/FB/DM/CM/AM/WM) for accurate auto-placement */
  preferredRole?: string;
}

export interface MatchDetailed {
  match_id: number;
  date: string;
  kickoff_time_utc: string;
  stage_name: string;
  stadium_name: string;
  city: string;
  country: string;
  home_team_name: string;
  home_fifa_code: string;
  away_team_name: string;
  away_fifa_code: string;
  home_score: number | null;
  away_score: number | null;
  home_penalty_score: number | null;
  away_penalty_score: number | null;
  status: string;
  result_type: string;
}

export interface LineupRow {
  lineup_id: number;
  match_id: number;
  player_id: number;
  team_id: number;
  is_starting_xi: number;
  tactical_position: string;
  minutes_played: number;
}

export interface PredictionFeatureRow {
  match_id: number;
  date: string;
  home_team_id: number;
  away_team_id: number;
  home_rest_days: number;
  away_rest_days: number;
}

export interface TournamentData {
  teams: Team[];
  venues: Venue[];
  players: Player[];
  matches: MatchDetailed[];
  lineups: LineupRow[];
  predictionFeatures: PredictionFeatureRow[];
}
