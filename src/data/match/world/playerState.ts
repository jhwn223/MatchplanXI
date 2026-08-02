import { fatigueBreakdown } from "../playerRuntime";
import { clamp } from "../random";
import type {
  MatchSide,
  PlacedPlayerLite,
  SimInput,
  SimTacticProfile,
} from "../types";
import type {
  MatchWorld,
  PlayerUnavailableReason,
  TacticsBySide,
  WorldFatigueState,
} from "./types";

function ensureFatigueState(
  world: MatchWorld,
  side: MatchSide,
  player: PlacedPlayerLite,
): WorldFatigueState {
  const existing = world.fatigueByPlayer[side].get(player.playerId);
  if (existing) return existing;
  const created = {
    condition: player.condition,
    updatedAtMinute: Math.max(0, player.enteredAtMinute ?? world.minute),
    totalLoss: 0,
    tacticalLoss: 0,
  };
  world.fatigueByPlayer[side].set(player.playerId, created);
  return created;
}

function runtimePlayer(
  world: MatchWorld,
  side: MatchSide,
  player: PlacedPlayerLite,
): PlacedPlayerLite {
  const fatigue = ensureFatigueState(world, side, player);
  return {
    ...player,
    condition: fatigue.condition,
  };
}

/** Builds the only lineup event generation may use and anchors fatigue at the previous chunk. */
export function runtimeInputForWorld(input: SimInput, world: MatchWorld): SimInput {
  const runtimePlayers = (side: MatchSide, players: PlacedPlayerLite[]) =>
    players.map((player) => runtimePlayer(world, side, player));
  const placed = runtimePlayers("user", input.placed);
  const oppPlaced = runtimePlayers("opp", input.oppPlaced);

  for (const [side, players] of [["user", placed], ["opp", oppPlaced]] as const) {
    for (const player of players) {
      const state = world.players[side].get(player.playerId);
      if (state) {
        state.player = player;
        state.movementFactorMinute = undefined;
        state.movementFactor = undefined;
      }
    }
  }
  return { ...input, placed, oppPlaced };
}

export function accruePlayerFatigue(
  world: MatchWorld,
  side: MatchSide,
  player: PlacedPlayerLite,
  minute: number,
  elevation: number,
  tactics: SimTacticProfile,
) {
  const state = ensureFatigueState(world, side, player);
  if (minute <= state.updatedAtMinute) return;
  const breakdown = fatigueBreakdown(
    { ...player, condition: state.condition, enteredAtMinute: state.updatedAtMinute },
    minute,
    elevation,
    tactics,
  );
  state.condition = clamp(state.condition - breakdown.totalLoss, 5, 100);
  state.updatedAtMinute = minute;
  state.totalLoss += breakdown.totalLoss;
  state.tacticalLoss += breakdown.tacticalLoss;
  player.condition = state.condition;
}

export function accrueActiveFatigue(
  world: MatchWorld,
  input: SimInput,
  minute: number,
  tactics: TacticsBySide,
) {
  for (const side of ["user", "opp"] as const) {
    for (const state of world.players[side].values()) {
      accruePlayerFatigue(world, side, state.player, minute, input.elevation, tactics[side]);
    }
  }
}

/** Records a permanent match status and removes the player from every spatial/action pool. */
export function markPlayerUnavailable(
  world: MatchWorld,
  input: SimInput,
  side: MatchSide,
  player: PlacedPlayerLite,
  reason: PlayerUnavailableReason,
  minute: number,
  tactics: SimTacticProfile,
) {
  if (world.unavailablePlayers[side].has(player.playerId)) return;
  accruePlayerFatigue(world, side, player, minute, input.elevation, tactics);
  world.unavailablePlayers[side].set(player.playerId, reason);
  world.players[side].delete(player.playerId);
  if (world.ball.ownerSide === side && world.ball.ownerId === player.playerId) {
    world.ball.ownerSide = null;
    world.ball.ownerId = null;
  }
  const opponent = side === "user" ? "opp" : "user";
  for (const state of world.players[opponent].values()) {
    if (state.markingTargetId === player.playerId) {
      state.markingTargetId = undefined;
      state.defensiveRole = undefined;
    }
    if (state.pressingTargetId === player.playerId) {
      state.pressingTargetId = undefined;
    }
  }
}
