import { clamp } from "./random";
import type {
  MatchSide,
  PlacedPlayerLite,
  SimInput,
  SimTacticProfile,
} from "./types";

export type ActionKind =
  | "generic"
  | "movement"
  | "technical"
  | "decision"
  | "duel"
  | "goalkeeping";

export interface FatigueBreakdown {
  condition: number;
  baseLoss: number;
  staminaLoss: number;
  altitudeLoss: number;
  tacticalLoss: number;
  totalLoss: number;
}

const NO_TACTICAL_LOAD: Pick<
  SimTacticProfile,
  "pressBias" | "tempoBias" | "attackBias" | "tacklingBias"
> = {
  pressBias: 0,
  tempoBias: 0,
  attackBias: 0,
  tacklingBias: 0,
};

/** Condition, stamina, altitude and playing out of position alter every individual action. */
export function performanceFactor(
  player: PlacedPlayerLite,
  minute: number,
  elevation: number,
  tactics?: SimTacticProfile,
): number {
  return actionPerformanceFactor(player, minute, elevation, "generic", tactics);
}

export function actionPerformanceFactor(
  player: PlacedPlayerLite,
  minute: number,
  elevation: number,
  action: ActionKind,
  tactics?: SimTacticProfile,
): number {
  const condition = currentCondition(player, minute, elevation, tactics);
  const conditionFactor =
    action === "movement"
      ? 0.7 + condition / 245
      : action === "duel"
        ? 0.72 + condition / 255
        : action === "technical"
          ? 0.8 + condition / 340
          : action === "decision"
            ? 0.78 + condition / 310
            : action === "goalkeeping"
              ? 0.82 + condition / 365
              : 0.75 + condition / 280;
  const positionFit = player.naturalPosition === player.position ? 1 : 0.88;
  return clamp(conditionFactor * positionFit, 0.62, 1.12);
}

/**
 * How hard each role runs. Previously every position drained at the same rate
 * and a full match cost only about nine points, so nobody ever looked tired.
 * Keepers barely move; forwards make the most repeated high-intensity runs.
 */
const POSITION_LOAD: Record<PlacedPlayerLite["position"], number> = {
  GK: 0.35,
  DEF: 0.9,
  MID: 1.15,
  FWD: 1.3,
};

export function fatigueBreakdown(
  player: PlacedPlayerLite,
  minute: number,
  elevation: number,
  tactics?: SimTacticProfile,
): FatigueBreakdown {
  const elapsed = clamp(minute, 0, 120);
  const load = tactics ?? NO_TACTICAL_LOAD;
  const positionLoad = POSITION_LOAD[player.position] ?? 1;
  const baseLoss = elapsed * 0.25 * positionLoad;
  const staminaLoss =
    elapsed * clamp((100 - player.stamina) / 1_000, 0.004, 0.065) * positionLoad;
  const altitudeLoss =
    elapsed * clamp((elevation - 800) / 45_000, 0, 0.075) * positionLoad;
  const tacticalIntensity =
    Math.max(0, load.pressBias) * 0.5 +
    Math.max(0, load.tempoBias) * 0.32 +
    Math.max(0, load.attackBias) * 0.1 +
    Math.max(0, load.tacklingBias) * 0.08;
  const staminaResistance = clamp((player.stamina - 55) / 90, 0, 0.5);
  const tacticalLoss =
    elapsed * tacticalIntensity * 0.075 * (1 - staminaResistance) * positionLoad;
  const totalLoss = baseLoss + staminaLoss + altitudeLoss + tacticalLoss;
  return {
    condition: Math.round(clamp(player.condition - totalLoss, 5, 100)),
    baseLoss,
    staminaLoss,
    altitudeLoss,
    tacticalLoss,
    totalLoss,
  };
}

export function currentCondition(
  player: PlacedPlayerLite,
  minute: number,
  elevation: number,
  tactics?: SimTacticProfile,
): number {
  return fatigueBreakdown(player, minute, elevation, tactics).condition;
}

export function skill(
  player: PlacedPlayerLite,
  minute: number,
  elevation: number,
  parts: Array<[number, number]>,
  action: ActionKind = "generic",
  tactics?: SimTacticProfile,
): number {
  return parts.reduce((sum, [value, weight]) => sum + value * weight, 0) *
    actionPerformanceFactor(player, minute, elevation, action, tactics);
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
