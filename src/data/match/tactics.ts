import { clamp } from "./random";
import type { MatchSide, SimInput, SimTacticProfile } from "./types";

export const BALANCED_SIM_TACTICS: Readonly<SimTacticProfile> = {
  attackBias: 0,
  pressBias: 0,
  overlapBias: 0,
  directnessBias: 0,
  counterBias: 0,
};

export function normalizeSimTactics(tactics?: SimTacticProfile): SimTacticProfile {
  const source = tactics ?? BALANCED_SIM_TACTICS;
  return {
    attackBias: clamp(source.attackBias, -1, 1),
    pressBias: clamp(source.pressBias, -1, 1),
    overlapBias: clamp(source.overlapBias, -1, 1),
    directnessBias: clamp(source.directnessBias, -1, 1),
    counterBias: clamp(source.counterBias, -1, 1),
  };
}

export function tacticsForSide(input: SimInput, side: MatchSide): SimTacticProfile {
  return normalizeSimTactics(side === "user" ? input.userTactics : input.oppTactics);
}

export function tacticalWorkRate(tactics: SimTacticProfile, minute: number): number {
  const elapsed = clamp(minute / 120, 0, 1);
  const pressingLoad = Math.max(0, tactics.pressBias) * 0.065;
  const overlapLoad = Math.max(0, tactics.overlapBias) * 0.025;
  const attackingLoad = Math.max(0, tactics.attackBias) * 0.015;
  return clamp(1 - elapsed * (pressingLoad + overlapLoad + attackingLoad), 0.9, 1);
}
