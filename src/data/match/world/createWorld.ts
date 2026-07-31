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
    elapsedSeconds: 0,
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

