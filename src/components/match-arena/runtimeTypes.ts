import type { Position } from "../../data/types";
import type { PlayerRole } from "../../data/playerRoles";
import type { FormationShapeProfile } from "../../data/match/world/formationShape";

export interface ArenaDot {
  playerId: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  facing: number;
  hx: number;
  hy: number;
  team: 0 | 1;
  num: number;
  name: string;
  role: Position;
  /** The assigned player role, so the replay moves him the way it says he plays. */
  tacticalRole?: PlayerRole;
  react: number;
  pace: number;
  passing: number;
  vision: number;
  positioning: number;
  dribbling: number;
  shooting: number;
  defending: number;
  goalkeeping: number;
  stamina: number;
  condition: number;
  nz: number;
  ph: number;
  action:
    | "idle"
    | "move"
    | "press"
    | "receive"
    | "pass"
    | "dribble"
    | "tackle"
    | "shoot"
    | "save"
    | "celebrate";
  actionT: number;
  defensiveRole?: "presser" | "cover" | "marker" | "screen" | "restDefense";
  markingTargetId?: number;
  pressingTargetId?: number;
  assignmentExpiresAt?: number;
}

export type ArenaMatchPhase =
  | "buildUp"
  | "middleThird"
  | "finalThird"
  | "defensiveBlock"
  | "transitionAttack"
  | "transitionDefense";

export interface ArenaState {
  clock: number;
  phase: "play" | "celebrate" | "penalties" | "interim" | "ended";
  celebrateT: number;
  actionT: number;
  score: [number, number];
  nextGoal: number;
  nextEvent: number;
  kickoffPauseT?: number;
  dots: ArenaDot[];
  ball: {
    x: number;
    y: number;
    previousX: number;
    previousY: number;
    owner: number;
    flightTo: number;
    flightTarget?: {
      fromX: number;
      fromY: number;
      x: number;
      y: number;
      owner: number | null;
      chaser: number | null;
      elapsed: number;
      duration: number;
    } | null;
    lastTeam: 0 | 1;
    scripted: boolean;
    trail: { x: number; y: number; age: number }[];
  };
  banner: string | null;
  goalSide: 0 | 1 | null;
  time: number;
  pendingKick?: number | null;
  scoring?: {
    side: 0 | 1;
    scorer?: string;
    assist?: string;
    shooter: number;
    t: number;
  } | null;
  scriptedRun?: {
    actor: number;
    x: number;
    y: number;
    action: "dribble" | "receive";
    claimBall?: boolean;
    elapsed?: number;
  } | null;
  periodBanner: string | null;
  periodBannerT: number;
  situation?: {
    type: "foul" | "corner" | "freeKick" | "penaltyKick" | "offside";
    side: 0 | 1;
    actor: number;
    x: number;
    y: number;
    remaining: number;
    elapsed: number;
  } | null;
  announcedET1: boolean;
  announcedET2: boolean;
  penT: number;
  pkSequence: PenaltyKick[];
  pkIndex: number;
  pkScore: [number, number];
  pkStage: "aim" | "strike" | "reveal";
  movement?: {
    possessionTeam: 0 | 1;
    previousPossessionTeam: 0 | 1;
    changedAt: number;
    phaseByTeam: [ArenaMatchPhase, ArenaMatchPhase];
  };
  shapeProfiles?: [FormationShapeProfile, FormationShapeProfile];
  /**
   * Player ids the manager sent up for each restart. Without them the replay
   * pushed the whole side into the box for every corner, so the choice of who
   * goes up had no visible effect.
   */
  setPieceParticipants?: { corner: number[]; freeKick: number[] };
}

export interface PenaltyKick {
  team: 0 | 1;
  scored: boolean;
  /** Only set for user (team 0) kicks once the player has chosen a taker order. */
  playerId?: number;
}

export interface ArenaHud {
  minute: number;
  home: number;
  away: number;
  banner: string | null;
  periodBanner: string | null;
  eventCount: number;
  situation: string | null;
}
