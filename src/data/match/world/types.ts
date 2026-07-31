import type { MatchSide, PlacedPlayerLite, SimTacticProfile } from "../types";

export type WorldIntent =
  | "holdShape"
  | "support"
  | "carry"
  | "receive"
  | "press"
  | "mark"
  | "protectGoal";

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
