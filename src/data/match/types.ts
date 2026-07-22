import type { TeamAbilityProfile } from "../playerAbility";
import type { Position } from "../types";

export interface PlacedPlayerLite {
  name: string;
  naturalPosition: Position;
  position: Position;
  overall: number;
  pace: number;
  acceleration: number;
  shooting: number;
  finishing: number;
  positioning: number;
  shotPower: number;
  longShots: number;
  passing: number;
  vision: number;
  shortPassing: number;
  longPassing: number;
  dribbling: number;
  ballControl: number;
  agility: number;
  composure: number;
  reactions: number;
  defending: number;
  interceptions: number;
  defensiveAwareness: number;
  standingTackle: number;
  physical: number;
  strength: number;
  aggression: number;
  stamina: number;
  penalties: number;
  gkDiving: number;
  gkHandling: number;
  gkPositioning: number;
  gkReflexes: number;
  condition: number;
}

export type MatchSide = "user" | "opp";

export interface GoalEvent {
  minute: number;
  side: MatchSide;
  scorer?: string;
  assist?: string;
}

export type MatchEventType =
  | "pass"
  | "dribble"
  | "interception"
  | "tackle"
  | "shot"
  | "save"
  | "block"
  | "miss"
  | "goal";

export interface MatchEvent {
  minute: number;
  side: MatchSide;
  type: MatchEventType;
  actor: string;
  target?: string;
  detail: string;
  success: boolean;
  xg?: number;
}

export interface TeamStats {
  passSuccessRate: number;
  shotsFaced: number;
  saves: number;
  saveRate: number;
  possession: number;
  passesAttempted: number;
  passesCompleted: number;
  shots: number;
  shotsOnTarget: number;
  tacklesWon: number;
  interceptions: number;
}

export interface SimActual {
  userGoals: number;
  oppGoals: number;
  resultType: string;
}

export interface SimInput {
  seed: number;
  userTeamName: string;
  oppTeamName: string;
  userElo: number;
  oppElo: number;
  conditionIndex: number;
  attackBias: number;
  isHome: boolean;
  elevation: number;
  placed: PlacedPlayerLite[];
  oppPlaced: PlacedPlayerLite[];
  userAbility: TeamAbilityProfile;
  oppAbility: TeamAbilityProfile;
  actual: SimActual | null;
  isKnockout: boolean;
}

export interface PenaltyResult {
  userGoals: number;
  oppGoals: number;
  winner: MatchSide;
}

export interface SimComparison {
  hasActual: boolean;
  actualUserGoals?: number;
  actualOppGoals?: number;
  simOutcome: "W" | "D" | "L";
  actualOutcome?: "W" | "D" | "L";
  outcomeMatched?: boolean;
  verdict: string;
  tacticsNote: string;
}

export interface HalfResult {
  goals: GoalEvent[];
  events: MatchEvent[];
  userGoals: number;
  oppGoals: number;
  userXg: number;
  oppXg: number;
  teamStats: { user: TeamStats; opp: TeamStats };
}

export interface SimResult {
  userGoals: number;
  oppGoals: number;
  regulationUserGoals: number;
  regulationOppGoals: number;
  userXg: number;
  oppXg: number;
  goals: GoalEvent[];
  events: MatchEvent[];
  comparison: SimComparison;
  teamStats: { user: TeamStats; opp: TeamStats };
  wentToExtraTime: boolean;
  penalties: PenaltyResult | null;
}
