import { clamp } from "./random";
import type { MatchSide, PlacedPlayerLite, SimInput } from "./types";

/** Condition, stamina, altitude and playing out of position alter every individual action. */
export function performanceFactor(player: PlacedPlayerLite, minute: number, elevation: number): number {
  const condition = 0.82 + player.condition / 430;
  const fatigueProgress = clamp(minute / 120, 0, 1);
  const staminaProtection = clamp((player.stamina - 45) / 100, 0, 0.5);
  const altitudeLoad = clamp((elevation - 800) / 9000, 0, 0.22);
  const fatigue = 1 - fatigueProgress * (0.17 - staminaProtection * 0.18 + altitudeLoad);
  const positionFit = player.naturalPosition === player.position ? 1 : 0.88;
  return clamp(condition * fatigue * positionFit, 0.62, 1.12);
}

export function currentCondition(player: PlacedPlayerLite, minute: number, elevation: number): number {
  const elapsed = clamp(minute, 0, 120);
  const staminaLoad = clamp((82 - player.stamina) / 55, 0.12, 0.82);
  const altitudeLoad = clamp((elevation - 800) / 5000, 0, 0.35);
  const fatigueLoss = elapsed * (0.13 + staminaLoad * 0.12 + altitudeLoad * 0.08);
  return Math.round(clamp(player.condition - fatigueLoss, 5, 100));
}

export function skill(
  player: PlacedPlayerLite,
  minute: number,
  elevation: number,
  parts: Array<[number, number]>
): number {
  return parts.reduce((sum, [value, weight]) => sum + value * weight, 0) * performanceFactor(player, minute, elevation);
}

export function sidePlayers(input: SimInput, side: MatchSide): PlacedPlayerLite[] {
  return side === "user" ? input.placed : input.oppPlaced;
}

export function otherSide(side: MatchSide): MatchSide {
  return side === "user" ? "opp" : "user";
}

export function outfield(players: PlacedPlayerLite[]): PlacedPlayerLite[] {
  const selected = players.filter((player) => player.position !== "GK");
  return selected.length ? selected : players;
}

export function goalkeeper(players: PlacedPlayerLite[]): PlacedPlayerLite {
  return players.find((player) => player.position === "GK") ?? players[0];
}
