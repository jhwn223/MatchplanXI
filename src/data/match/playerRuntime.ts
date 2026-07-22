import { clamp } from "./random";
import type { MatchSide, PlacedPlayerLite, SimInput } from "./types";

/** Condition, stamina, altitude and playing out of position alter every individual action. */
export function performanceFactor(player: PlacedPlayerLite, minute: number, elevation: number): number {
  const condition = currentCondition(player, minute, elevation);
  const conditionFactor = 0.6 + condition / 185;
  const positionFit = player.naturalPosition === player.position ? 1 : 0.88;
  return clamp(conditionFactor * positionFit, 0.62, 1.12);
}

export function currentCondition(player: PlacedPlayerLite, minute: number, elevation: number): number {
  const elapsed = clamp(minute, 0, 120);
  const staminaLoad = clamp((100 - player.stamina) / 60, 0, 1);
  const altitudeLoad = clamp((elevation - 800) / 4000, 0, 0.45);
  const fatigueLoss = elapsed * (0.08 + staminaLoad * 0.14 + altitudeLoad * 0.1);
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
