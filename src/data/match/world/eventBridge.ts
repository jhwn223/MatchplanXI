import { clamp } from "../random";
import type {
  MatchEventType,
  MatchSide,
  PlacedPlayerLite,
  PositionSample,
  SimInput,
} from "../types";
import { advanceWorld, moveBallOwner } from "./movementEngine";
import type {
  MatchWorld,
  MatchWorldSnapshot,
  TacticsBySide,
} from "./types";

export interface WorldEventCoordinate {
  x: number;
  y: number;
  endX: number;
  endY: number;
}

function statePoint(
  world: MatchWorld,
  side: MatchSide,
  player: PlacedPlayerLite | undefined,
) {
  if (!player) return undefined;
  return world.players[side].get(player.playerId);
}

export function coordinateFromWorld(
  world: MatchWorld,
  input: SimInput,
  tactics: TacticsBySide,
  side: MatchSide,
  type: MatchEventType,
  actor: PlacedPlayerLite,
  target: PlacedPlayerLite | undefined,
  success: boolean,
): WorldEventCoordinate {
  const targetState = statePoint(world, side, target);
  const direction = side === "user" ? 1 : -1;
  const start = {
    x: world.ball.x,
    y: world.ball.y,
  };

  let end = { ...start };
  if (type === "pass" && targetState) {
    end = {
      x: targetState.x,
      y: targetState.y,
    };
  } else if (type === "dribble") {
    advanceWorld(world, input, tactics, 1.2);
    const moved = statePoint(world, side, actor);
    end = { x: moved?.x ?? start.x + direction * 5, y: moved?.y ?? start.y };
  } else if (type === "shot" || type === "goal" || type === "miss") {
    end = {
      x: side === "user" ? 99 : 1,
      y: clamp(50 + (actor.finishing - 70) * 0.04, 42, 58),
    };
  } else if (type === "corner") {
    end = { x: side === "user" ? 98 : 2, y: start.y < 50 ? 3 : 97 };
  } else if (type === "penaltyKick") {
    end = { x: side === "user" ? 99 : 1, y: 50 };
  }

  const coordinate = {
    x: clamp(start.x, 1, 99),
    y: clamp(start.y, 2, 98),
    endX: clamp(end.x, 1, 99),
    endY: clamp(end.y, 2, 98),
  };

  if (type === "pass") {
    if (success) {
      moveBallOwner(world, side, target);
    } else {
      world.ball.x = coordinate.endX;
      world.ball.y = coordinate.endY;
      moveBallOwner(world, side, undefined);
    }
  } else if (
    type === "recovery" ||
    type === "interception" ||
    type === "tackle" ||
    type === "save"
  ) {
    moveBallOwner(world, side, actor);
  } else if (type === "dribble") {
    moveBallOwner(world, side, actor);
  } else if (type === "shot" || type === "goal" || type === "miss") {
    world.ball.x = coordinate.endX;
    world.ball.y = coordinate.endY;
    moveBallOwner(world, side, undefined);
  }

  return coordinate;
}

export function samplesFromWorld(world: MatchWorld, minute: number): PositionSample[] {
  const samples: PositionSample[] = [];
  for (const side of ["user", "opp"] as MatchSide[]) {
    for (const state of world.players[side].values()) {
      samples.push({
        minute,
        side,
        playerId: state.player.playerId,
        playerName: state.player.name,
        x: state.x,
        y: state.y,
      });
    }
  }
  return samples;
}

export function snapshotWorld(world: MatchWorld): MatchWorldSnapshot {
  return {
    minute: world.minute,
    elapsedSeconds: world.elapsedSeconds,
    ball: { ...world.ball },
    players: (["user", "opp"] as MatchSide[]).flatMap((side) =>
      [...world.players[side].values()].map((state) => ({
        side,
        playerId: state.player.playerId,
        x: state.x,
        y: state.y,
        vx: state.vx,
        vy: state.vy,
        intent: state.intent,
      })),
    ),
  };
}
