import type { MatchSide, PlacedPlayerLite, SimTacticProfile } from "../types";
import type { WorldTrackRecorder } from "./worldTrack";

export type WorldIntent =
  | "holdShape"
  | "support"
  | "carry"
  | "receive"
  | "press"
  | "mark"
  | "protectGoal";

export type MatchPhase =
  | "buildUp"
  | "middleThird"
  | "finalThird"
  | "defensiveBlock"
  | "transitionAttack"
  | "transitionDefense";

export type DefensiveRole =
  | "presser"
  | "cover"
  | "marker"
  | "screen"
  | "restDefense";

export interface WorldPoint {
  x: number;
  y: number;
}

export interface WorldPlayerState extends WorldPoint {
  side: MatchSide;
  player: PlacedPlayerLite;
  vx: number;
  vy: number;
  intent: WorldIntent;
  target: WorldPoint;
  defensiveRole?: DefensiveRole;
  markingTargetId?: number;
  pressingTargetId?: number;
  assignmentExpiresAt: number;
  /**
   * Movement performance only depends on the match minute, so it is computed
   * once per minute per player instead of on every tick. `movementFactorMinute`
   * is the minute `movementFactor` was derived for.
   */
  movementFactorMinute?: number;
  movementFactor?: number;
}

export interface WorldBallState extends WorldPoint {
  ownerSide: MatchSide | null;
  ownerId: number | null;
}

export interface WorldFatigueState {
  /** Unrounded condition retained between chunks so one-minute steps do not lose fractional fatigue. */
  condition: number;
  updatedAtMinute: number;
  totalLoss: number;
  tacticalLoss: number;
}

export type PlayerUnavailableReason = "dismissed" | "injured";

export interface MatchWorld {
  minute: number;
  elapsedSeconds: number;
  players: Record<MatchSide, Map<number, WorldPlayerState>>;
  ball: WorldBallState;
  /**
   * False while play is stopped. Only the recording uses it — dead time has to
   * be told apart from play, or a goal celebration weighs on the heat maps.
   */
  ballInPlay: boolean;
  /** Analysis recorder. Written to as the world is stepped, never read back. */
  track?: WorldTrackRecorder;
  phaseBySide: Record<MatchSide, MatchPhase>;
  lastPossessionSide: MatchSide | null;
  previousPossessionSide: MatchSide | null;
  possessionChangedAt: number;
  /** Persistent across one-minute simulation chunks and half-time remounts. */
  yellowCards: Record<MatchSide, Map<number, number>>;
  /** Authoritative accumulated fatigue; current tactics apply only after updatedAtMinute. */
  fatigueByPlayer: Record<MatchSide, Map<number, WorldFatigueState>>;
  /** Players in this map cannot be reintroduced into the active simulation. */
  unavailablePlayers: Record<MatchSide, Map<number, PlayerUnavailableReason>>;
}

export type TacticsBySide = Record<MatchSide, SimTacticProfile>;

export interface WorldPlayerSnapshot extends WorldPoint {
  side: MatchSide;
  playerId: number;
  vx: number;
  vy: number;
  intent: WorldIntent;
}

export interface MatchWorldSnapshot {
  minute: number;
  elapsedSeconds: number;
  ball: WorldBallState;
  players: WorldPlayerSnapshot[];
}
