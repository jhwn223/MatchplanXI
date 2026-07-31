import type { TeamAbilityProfile } from "../playerAbility";
import type { Position } from "../types";

export interface PlacedPlayerLite {
  playerId: number;
  teamId: number;
  name: string;
  slotId: string;
  slotLabel: string;
  naturalPosition: Position;
  position: Position;
  /** Canonical coordinates: x moves from own goal (0) to opponent goal (100), y is left-to-right. */
  baseX: number;
  baseY: number;
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
  scorerId?: number;
  scorer?: string;
  assistId?: number;
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
  | "goal"
  | "foul"
  | "yellowCard"
  | "redCard"
  | "offside"
  | "corner"
  | "freeKick"
  | "injury";

export type PassType = "cross" | "short" | "through" | "longBall" | "normal";

export interface MatchEvent {
  minute: number;
  side: MatchSide;
  type: MatchEventType;
  actorId: number;
  actor: string;
  targetId?: number;
  target?: string;
  detail: string;
  success: boolean;
  xg?: number;
  passType?: PassType;
  x?: number;
  y?: number;
  endX?: number;
  endY?: number;
}

export interface PositionSample {
  minute: number;
  side: MatchSide;
  playerId: number;
  playerName: string;
  x: number;
  y: number;
}

export interface TeamStats {
  passSuccessRate: number;
  shotsFaced: number;
  saves: number;
  saveRate: number;
  possession: number;
  possessionTouches: number;
  totalPossessionTouches: number;
  passesAttempted: number;
  passesCompleted: number;
  shots: number;
  shotsOnTarget: number;
  tacklesWon: number;
  interceptions: number;
  fouls: number;
  yellowCards: number;
  redCards: number;
  corners: number;
  offsides: number;
  injuries: number;
}

export interface PlayerMatchStats {
  side: MatchSide;
  playerId: number;
  teamId: number;
  name: string;
  position: Position;
  condition: number;
  rating: number;
  minutesPlayed: number;
  touches: number;
  passesAttempted: number;
  passesCompleted: number;
  dribblesAttempted: number;
  dribblesCompleted: number;
  tacklesWon: number;
  interceptions: number;
  shots: number;
  shotsOnTarget: number;
  goals: number;
  assists: number;
  keyPasses: number;
  blocks: number;
  bigChancesMissed: number;
  goalsConceded: number;
  saves: number;
  foulsCommitted: number;
  yellowCards: number;
  redCards: number;
  offsides: number;
  injuries: number;
  distanceKm: number;
}

export interface LiveMatchSnapshot {
  minute: number;
  userGoals: number;
  oppGoals: number;
  userXg: number;
  oppXg: number;
  teamStats: { user: TeamStats; opp: TeamStats };
  players: PlayerMatchStats[];
}

export interface SimActual {
  userGoals: number;
  oppGoals: number;
  resultType: string;
}

export interface SimTacticProfile {
  attackBias: number;
  pressBias: number;
  overlapBias: number;
  directnessBias: number;
  counterBias: number;
  tempoBias: number;
  creativityBias: number;
  shootingBias: number;
  defensiveLineBias: number;
  tacklingBias: number;
  widthBias: number;
  focusBias: number;
  setPieceBias: number;
}

export interface SimInput {
  seed: number;
  userTeamName: string;
  oppTeamName: string;
  userElo: number;
  oppElo: number;
  conditionIndex: number;
  attackBias: number;
  userTactics?: SimTacticProfile;
  oppTactics?: SimTacticProfile;
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
  positionSamples: PositionSample[];
  userGoals: number;
  oppGoals: number;
  userXg: number;
  oppXg: number;
  teamStats: { user: TeamStats; opp: TeamStats };
  playerStats: PlayerMatchStats[];
  liveSnapshots: LiveMatchSnapshot[];
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
  positionSamples: PositionSample[];
  comparison: SimComparison;
  teamStats: { user: TeamStats; opp: TeamStats };
  playerStats: PlayerMatchStats[];
  playerOfMatch: PlayerMatchStats | null;
  liveSnapshots: LiveMatchSnapshot[];
  wentToExtraTime: boolean;
  penalties: PenaltyResult | null;
}
