import type { MatchSide, PlacedPlayerLite, SimTacticProfile } from "../types";

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
}

export interface WorldBallState extends WorldPoint {
  ownerSide: MatchSide | null;
  ownerId: number | null;
}

export interface MatchWorld {
  minute: number;
  elapsedSeconds: number;
  players: Record<MatchSide, Map<number, WorldPlayerState>>;
  ball: WorldBallState;
  phaseBySide: Record<MatchSide, MatchPhase>;
  lastPossessionSide: MatchSide | null;
  previousPossessionSide: MatchSide | null;
  possessionChangedAt: number;
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
