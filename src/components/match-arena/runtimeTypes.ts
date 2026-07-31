import type { Position } from "../../data/types";

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
  react: number;
  pace: number;
  passing: number;
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
}

export interface ArenaState {
  clock: number;
  phase: "play" | "celebrate" | "penalties" | "interim" | "ended";
  celebrateT: number;
  actionT: number;
  score: [number, number];
  nextGoal: number;
  nextEvent: number;
  openingPossessionReady?: boolean;
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
  } | null;
  announcedET1: boolean;
  announcedET2: boolean;
  penT: number;
  pkSequence: PenaltyKick[];
  pkIndex: number;
  pkScore: [number, number];
  pkStage: "aim" | "strike" | "reveal";
}

export interface PenaltyKick {
  team: 0 | 1;
  scored: boolean;
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
