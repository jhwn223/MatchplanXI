import { clamp } from "../random";
import { tacticalHome } from "../spatial";
import type { MatchSide, PlacedPlayerLite, SimInput } from "../types";
import type {
  MatchWorld,
  TacticsBySide,
  WorldPlayerState,
} from "./types";

function stableUnit(seed: number, minute: number, side: MatchSide, playerId: number, salt: number) {
  let hash = (seed ^ minute ^ playerId ^ salt) >>> 0;
  const text = `${side}:${playerId}:${minute}:${salt}`;
  for (let index = 0; index < text.length; index++) {
    hash = Math.imul(hash ^ text.charCodeAt(index), 16777619);
  }
  return (hash >>> 0) / 4_294_967_295;
}

function createPlayerState(
  input: SimInput,
  minute: number,
  side: MatchSide,
  player: PlacedPlayerLite,
  tactics: TacticsBySide,
): WorldPlayerState {
  const home = tacticalHome(player, side, tactics[side]);
  const radius =
    player.position === "GK" ? 0.8 :
      player.position === "DEF" ? 2.2 :
        player.position === "MID" ? 3.2 : 2.8;
  const x = clamp(
    home.x + (stableUnit(input.seed, minute, side, player.playerId, 17) - 0.5) * radius,
    player.position === "GK" ? (side === "user" ? 2 : 82) : 2,
    player.position === "GK" ? (side === "user" ? 18 : 98) : 98,
  );
  const y = clamp(
    home.y + (stableUnit(input.seed, minute, side, player.playerId, 43) - 0.5) * radius,
    2,
    98,
  );
  return {
    side,
    player,
    x,
    y,
    vx: 0,
    vy: 0,
    intent: player.position === "GK" ? "protectGoal" : "holdShape",
    target: { x, y },
    assignmentExpiresAt: 0,
  };
}

export function createMatchWorld(
  input: SimInput,
  minute: number,
  tactics: TacticsBySide,
): MatchWorld {
  const user = new Map(
    input.placed.map((player) => [
      player.playerId,
      createPlayerState(input, minute, "user", player, tactics),
    ]),
  );
  const opp = new Map(
    input.oppPlaced.map((player) => [
      player.playerId,
      createPlayerState(input, minute, "opp", player, tactics),
    ]),
  );
  return {
    minute,
    // The world clock is the match clock: seconds since kickoff. A world
    // created for minute `m` starts at the beginning of that minute.
    elapsedSeconds: Math.max(0, minute - 1) * 60,
    players: { user, opp },
    ball: {
      x: 50,
      y: 50,
      ownerSide: null,
      ownerId: null,
    },
    phaseBySide: {
      user: "middleThird",
      opp: "middleThird",
    },
    lastPossessionSide: null,
    previousPossessionSide: null,
    possessionChangedAt: 0,
  };
}

/**
 * Carries the live spatial state into the next simulated chunk.
 *
 * MatchArena asks the event engine for one minute at a time so that tactical
 * changes can take effect immediately. Rebuilding the world for every call
 * made players jump back to their formation homes and forgot possession,
 * marking, and transition state. This reconciles the previous world with the
 * current lineup while preserving the state of players who are still active.
 */
export function continueMatchWorld(
  previous: MatchWorld,
  input: SimInput,
  minute: number,
  tactics: TacticsBySide,
): MatchWorld {
  const reconcileSide = (
    side: MatchSide,
    players: PlacedPlayerLite[],
  ) => new Map(
    players.map((player) => {
      const existing = previous.players[side].get(player.playerId);
      if (!existing) {
        return [
          player.playerId,
          createPlayerState(input, minute, side, player, tactics),
        ] as const;
      }
      return [
        player.playerId,
        {
          ...existing,
          player,
          target: { ...existing.target },
        },
      ] as const;
    }),
  );

  const players = {
    user: reconcileSide("user", input.placed),
    opp: reconcileSide("opp", input.oppPlaced),
  };
  const ownerStillActive =
    previous.ball.ownerSide != null &&
    previous.ball.ownerId != null &&
    players[previous.ball.ownerSide].has(previous.ball.ownerId);
  const world: MatchWorld = {
    minute,
    elapsedSeconds: previous.elapsedSeconds,
    players,
    ball: {
      ...previous.ball,
      ownerSide: ownerStillActive ? previous.ball.ownerSide : null,
      ownerId: ownerStillActive ? previous.ball.ownerId : null,
    },
    phaseBySide: { ...previous.phaseBySide },
    lastPossessionSide: previous.lastPossessionSide,
    previousPossessionSide: previous.previousPossessionSide,
    possessionChangedAt: previous.possessionChangedAt,
  };

  for (const side of ["user", "opp"] as MatchSide[]) {
    const opponent = side === "user" ? "opp" : "user";
    for (const state of world.players[side].values()) {
      if (
        state.markingTargetId != null &&
        !world.players[opponent].has(state.markingTargetId)
      ) {
        state.markingTargetId = undefined;
        state.defensiveRole = undefined;
        state.assignmentExpiresAt = 0;
      }
      if (
        state.pressingTargetId != null &&
        !world.players[opponent].has(state.pressingTargetId)
      ) {
        state.pressingTargetId = undefined;
        state.assignmentExpiresAt = 0;
      }
    }
  }

  return world;
}

