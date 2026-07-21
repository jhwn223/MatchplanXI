import type { Position } from "./types";

export interface FormationSlot {
  id: string;
  label: string;
  position: Position;
  /** percentage coordinates on the pitch, x/y in [0,100]; attacking toward the top */
  x: number;
  y: number;
}

export type FormationKey =
  | "5-4-1"
  | "5-3-2"
  | "4-5-1"
  | "4-4-2"
  | "4-2-3-1"
  | "3-5-2"
  | "4-3-3"
  | "3-4-3";

export interface FormationMeta {
  slots: FormationSlot[];
  /** -1 = very defensive, +1 = very attacking; feeds the match sim */
  attackBias: number;
}

export const FORMATIONS: Record<FormationKey, FormationMeta> = {
  "5-4-1": {
    attackBias: -0.9,
    slots: [
      { id: "gk", label: "GK", position: "GK", x: 50, y: 92 },
      { id: "lb", label: "LB", position: "DEF", x: 10, y: 72 },
      { id: "cb1", label: "CB", position: "DEF", x: 30, y: 79 },
      { id: "cb2", label: "CB", position: "DEF", x: 50, y: 81 },
      { id: "cb3", label: "CB", position: "DEF", x: 70, y: 79 },
      { id: "rb", label: "RB", position: "DEF", x: 90, y: 72 },
      { id: "lm", label: "LM", position: "MID", x: 15, y: 48 },
      { id: "cm1", label: "CM", position: "MID", x: 40, y: 52 },
      { id: "cm2", label: "CM", position: "MID", x: 60, y: 52 },
      { id: "rm", label: "RM", position: "MID", x: 85, y: 48 },
      { id: "st", label: "ST", position: "FWD", x: 50, y: 16 },
    ],
  },
  "5-3-2": {
    attackBias: -0.6,
    slots: [
      { id: "gk", label: "GK", position: "GK", x: 50, y: 92 },
      { id: "lb", label: "LWB", position: "DEF", x: 10, y: 70 },
      { id: "cb1", label: "CB", position: "DEF", x: 30, y: 79 },
      { id: "cb2", label: "CB", position: "DEF", x: 50, y: 81 },
      { id: "cb3", label: "CB", position: "DEF", x: 70, y: 79 },
      { id: "rb", label: "RWB", position: "DEF", x: 90, y: 70 },
      { id: "cm1", label: "CM", position: "MID", x: 30, y: 52 },
      { id: "cm2", label: "CM", position: "MID", x: 50, y: 56 },
      { id: "cm3", label: "CM", position: "MID", x: 70, y: 52 },
      { id: "st1", label: "ST", position: "FWD", x: 40, y: 18 },
      { id: "st2", label: "ST", position: "FWD", x: 60, y: 18 },
    ],
  },
  "4-5-1": {
    attackBias: -0.4,
    slots: [
      { id: "gk", label: "GK", position: "GK", x: 50, y: 92 },
      { id: "lb", label: "LB", position: "DEF", x: 14, y: 72 },
      { id: "cb1", label: "CB", position: "DEF", x: 37, y: 78 },
      { id: "cb2", label: "CB", position: "DEF", x: 63, y: 78 },
      { id: "rb", label: "RB", position: "DEF", x: 86, y: 72 },
      { id: "lm", label: "LM", position: "MID", x: 12, y: 46 },
      { id: "cm1", label: "CM", position: "MID", x: 34, y: 54 },
      { id: "cm2", label: "CM", position: "MID", x: 50, y: 50 },
      { id: "cm3", label: "CM", position: "MID", x: 66, y: 54 },
      { id: "rm", label: "RM", position: "MID", x: 88, y: 46 },
      { id: "st", label: "ST", position: "FWD", x: 50, y: 16 },
    ],
  },
  "4-4-2": {
    attackBias: 0.0,
    slots: [
      { id: "gk", label: "GK", position: "GK", x: 50, y: 92 },
      { id: "lb", label: "LB", position: "DEF", x: 12, y: 70 },
      { id: "cb1", label: "CB", position: "DEF", x: 37, y: 76 },
      { id: "cb2", label: "CB", position: "DEF", x: 63, y: 76 },
      { id: "rb", label: "RB", position: "DEF", x: 88, y: 70 },
      { id: "lm", label: "LM", position: "MID", x: 15, y: 46 },
      { id: "cm1", label: "CM", position: "MID", x: 40, y: 50 },
      { id: "cm2", label: "CM", position: "MID", x: 60, y: 50 },
      { id: "rm", label: "RM", position: "MID", x: 85, y: 46 },
      { id: "st1", label: "ST", position: "FWD", x: 38, y: 16 },
      { id: "st2", label: "ST", position: "FWD", x: 62, y: 16 },
    ],
  },
  "4-2-3-1": {
    attackBias: 0.1,
    slots: [
      { id: "gk", label: "GK", position: "GK", x: 50, y: 92 },
      { id: "lb", label: "LB", position: "DEF", x: 14, y: 72 },
      { id: "cb1", label: "CB", position: "DEF", x: 37, y: 78 },
      { id: "cb2", label: "CB", position: "DEF", x: 63, y: 78 },
      { id: "rb", label: "RB", position: "DEF", x: 86, y: 72 },
      { id: "dm1", label: "DM", position: "MID", x: 36, y: 58 },
      { id: "dm2", label: "DM", position: "MID", x: 64, y: 58 },
      { id: "lam", label: "LAM", position: "MID", x: 20, y: 34 },
      { id: "cam", label: "CAM", position: "MID", x: 50, y: 36 },
      { id: "ram", label: "RAM", position: "MID", x: 80, y: 34 },
      { id: "st", label: "ST", position: "FWD", x: 50, y: 14 },
    ],
  },
  "3-5-2": {
    attackBias: 0.2,
    slots: [
      { id: "gk", label: "GK", position: "GK", x: 50, y: 92 },
      { id: "cb1", label: "CB", position: "DEF", x: 30, y: 78 },
      { id: "cb2", label: "CB", position: "DEF", x: 50, y: 80 },
      { id: "cb3", label: "CB", position: "DEF", x: 70, y: 78 },
      { id: "lwb", label: "LWB", position: "MID", x: 11, y: 54 },
      { id: "cm1", label: "CM", position: "MID", x: 35, y: 54 },
      { id: "cm2", label: "CM", position: "MID", x: 50, y: 58 },
      { id: "cm3", label: "CM", position: "MID", x: 65, y: 54 },
      { id: "rwb", label: "RWB", position: "MID", x: 89, y: 54 },
      { id: "st1", label: "ST", position: "FWD", x: 40, y: 18 },
      { id: "st2", label: "ST", position: "FWD", x: 60, y: 18 },
    ],
  },
  "4-3-3": {
    attackBias: 0.5,
    slots: [
      { id: "gk", label: "GK", position: "GK", x: 50, y: 92 },
      { id: "lb", label: "LB", position: "DEF", x: 15, y: 72 },
      { id: "cb1", label: "CB", position: "DEF", x: 37, y: 78 },
      { id: "cb2", label: "CB", position: "DEF", x: 63, y: 78 },
      { id: "rb", label: "RB", position: "DEF", x: 85, y: 72 },
      { id: "lcm", label: "LCM", position: "MID", x: 25, y: 50 },
      { id: "cm", label: "CM", position: "MID", x: 50, y: 54 },
      { id: "rcm", label: "RCM", position: "MID", x: 75, y: 50 },
      { id: "lw", label: "LW", position: "FWD", x: 18, y: 22 },
      { id: "st", label: "ST", position: "FWD", x: 50, y: 14 },
      { id: "rw", label: "RW", position: "FWD", x: 82, y: 22 },
    ],
  },
  "3-4-3": {
    attackBias: 0.9,
    slots: [
      { id: "gk", label: "GK", position: "GK", x: 50, y: 92 },
      { id: "cb1", label: "CB", position: "DEF", x: 30, y: 78 },
      { id: "cb2", label: "CB", position: "DEF", x: 50, y: 80 },
      { id: "cb3", label: "CB", position: "DEF", x: 70, y: 78 },
      { id: "lm", label: "LM", position: "MID", x: 14, y: 52 },
      { id: "cm1", label: "CM", position: "MID", x: 38, y: 54 },
      { id: "cm2", label: "CM", position: "MID", x: 62, y: 54 },
      { id: "rm", label: "RM", position: "MID", x: 86, y: 52 },
      { id: "lw", label: "LW", position: "FWD", x: 20, y: 20 },
      { id: "st", label: "ST", position: "FWD", x: 50, y: 14 },
      { id: "rw", label: "RW", position: "FWD", x: 80, y: 20 },
    ],
  },
};

export const FORMATION_KEYS = Object.keys(FORMATIONS) as FormationKey[];

/** slot list for a formation (convenience) */
export function slotsOf(key: FormationKey): FormationSlot[] {
  return FORMATIONS[key].slots;
}

export const BENCH_ZONE_ID = "bench";
