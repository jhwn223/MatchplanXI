import { clamp } from "./random";
import type { MatchSide, SimInput, SimTacticProfile } from "./types";

export const BALANCED_SIM_TACTICS: Readonly<SimTacticProfile> = {
  attackBias: 0,
  pressBias: 0,
  overlapBias: 0,
  fullbackPushBias: 0,
  directnessBias: 0,
  counterBias: 0,
  tempoBias: 0,
  creativityBias: 0,
  shootingBias: 0,
  defensiveLineBias: 0,
  tacklingBias: 0,
  widthBias: 0,
  centralFocusBias: 0,
  focusBias: 0,
  setPieceBias: 0,
  engagementBias: 0,
  compactnessBias: 0,
  restDefenseBias: 0,
  offsideTrapBias: 0,
};

export function normalizeSimTactics(tactics?: SimTacticProfile): SimTacticProfile {
  const source = tactics ?? BALANCED_SIM_TACTICS;
  return {
    attackBias: clamp(source.attackBias, -1, 1),
    pressBias: clamp(source.pressBias, -1, 1),
    overlapBias: clamp(source.overlapBias, -1, 1),
    fullbackPushBias: clamp(source.fullbackPushBias ?? 0, -1, 1),
    directnessBias: clamp(source.directnessBias, -1, 1),
    counterBias: clamp(source.counterBias, -1, 1),
    tempoBias: clamp(source.tempoBias, -1, 1),
    creativityBias: clamp(source.creativityBias, -1, 1),
    shootingBias: clamp(source.shootingBias, -1, 1),
    defensiveLineBias: clamp(source.defensiveLineBias, -1, 1),
    tacklingBias: clamp(source.tacklingBias, -1, 1),
    widthBias: clamp(source.widthBias, -1, 1),
    centralFocusBias: clamp(source.centralFocusBias ?? 0, 0, 1),
    focusBias: clamp(source.focusBias, -1, 1),
    setPieceBias: clamp(source.setPieceBias, -1, 1),
    engagementBias: clamp(source.engagementBias ?? 0, -1, 1),
    compactnessBias: clamp(source.compactnessBias ?? 0, -1, 1),
    restDefenseBias: clamp(source.restDefenseBias ?? 0, -1, 1),
    offsideTrapBias: clamp(source.offsideTrapBias ?? 0, 0, 1),
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
  const tempoLoad = Math.max(0, tactics.tempoBias) * 0.035;
  const tacklingLoad = Math.max(0, tactics.tacklingBias) * 0.02;
  return clamp(1 - elapsed * (pressingLoad + overlapLoad + attackingLoad + tempoLoad + tacklingLoad), 0.86, 1);
}
