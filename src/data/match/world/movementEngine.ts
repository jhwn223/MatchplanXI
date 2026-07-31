import { actionPerformanceFactor } from "../playerRuntime";
import { clamp } from "../random";
import { tacticalHome } from "../spatial";
import type { MatchSide, PlacedPlayerLite, SimInput } from "../types";
import type {
  MatchWorld,
  TacticsBySide,
  WorldIntent,
  WorldPlayerState,
  WorldPoint,
} from "./types";

function distance(a: WorldPoint, b: WorldPoint) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function nearestState(states: WorldPlayerState[], point: WorldPoint) {
  return [...states].sort((a, b) => distance(a, point) - distance(b, point))[0];
}

function targetForPlayer(
  world: MatchWorld,
  state: WorldPlayerState,
  tactics: TacticsBySide,
): { point: WorldPoint; intent: WorldIntent } {
  const { side, player } = state;
  const ownTactics = tactics[side];
  const home = tacticalHome(player, side, ownTactics);
  const direction = side === "user" ? 1 : -1;
  const ownsBall =
    world.ball.ownerSide === side &&
    world.ball.ownerId === player.playerId;
  const teamHasBall = world.ball.ownerSide === side;

  if (player.position === "GK") {
    const ownGoalX = side === "user" ? 4 : 96;
    return {
      point: {
        x: clamp(ownGoalX + (world.ball.x - 50) * 0.045, side === "user" ? 2 : 86, side === "user" ? 14 : 98),
        y: clamp(50 + (world.ball.y - 50) * 0.18, 34, 66),
      },
      intent: "protectGoal",
    };
  }

  if (ownsBall) {
    return {
      point: {
        x: clamp(state.x + direction * (5 + Math.max(0, ownTactics.tempoBias) * 2), 3, 97),
        y: clamp(state.y + (50 - state.y) * 0.08, 3, 97),
      },
      intent: "carry",
    };
  }

  if (teamHasBall) {
    const supportDepth =
      player.position === "FWD" ? 9 :
        player.position === "MID" ? 3 : -5;
    const widthStretch = ownTactics.widthBias * (player.baseY < 50 ? -5 : 5);
    return {
      point: {
        x: clamp(home.x + direction * supportDepth + (world.ball.x - home.x) * 0.12, 4, 96),
        y: clamp(home.y + widthStretch + (world.ball.y - home.y) * 0.1, 3, 97),
      },
      intent: "support",
    };
  }

  const teammates = [...world.players[side].values()].filter(
    (candidate) => candidate.player.position !== "GK",
  );
  const nearest = nearestState(teammates, world.ball);
  if (nearest?.player.playerId === player.playerId) {
    return {
      point: {
        x: world.ball.x - direction * 0.8,
        y: world.ball.y,
      },
      intent: "press",
    };
  }

  const pressShift = Math.max(0, ownTactics.pressBias) * 5;
  return {
    point: {
      x: clamp(home.x + direction * pressShift + (world.ball.x - home.x) * 0.08, 4, 96),
      y: clamp(home.y + (world.ball.y - home.y) * 0.07, 3, 97),
    },
    intent: "mark",
  };
}

function movePlayer(
  state: WorldPlayerState,
  target: WorldPoint,
  seconds: number,
  minute: number,
  input: SimInput,
  tactics: TacticsBySide,
) {
  const dx = target.x - state.x;
  const dy = target.y - state.y;
  const remaining = Math.hypot(dx, dy);
  if (remaining < 0.01) {
    state.vx = 0;
    state.vy = 0;
    return;
  }
  const performance = actionPerformanceFactor(
    state.player,
    minute,
    input.elevation,
    "movement",
    tactics[state.side],
  );
  const pace = (state.player.pace * 0.62 + state.player.acceleration * 0.38) / 100;
  const maxSpeed = (2.3 + pace * 3.1) * performance;
  const step = Math.min(remaining, maxSpeed * seconds);
  state.vx = (dx / remaining) * (step / Math.max(seconds, 0.001));
  state.vy = (dy / remaining) * (step / Math.max(seconds, 0.001));
  state.x = clamp(state.x + (dx / remaining) * step, 1, 99);
  state.y = clamp(state.y + (dy / remaining) * step, 2, 98);
}

export function advanceWorld(
  world: MatchWorld,
  input: SimInput,
  tactics: TacticsBySide,
  seconds: number,
) {
  const tickLength = 0.2;
  let remaining = clamp(seconds, 0, 12);
  while (remaining > 0.001) {
    const tick = Math.min(tickLength, remaining);
    for (const side of ["user", "opp"] as MatchSide[]) {
      for (const state of world.players[side].values()) {
        const next = targetForPlayer(world, state, tactics);
        state.target = next.point;
        state.intent = next.intent;
        movePlayer(state, next.point, tick, world.minute, input, tactics);
      }
    }
    const owner =
      world.ball.ownerSide && world.ball.ownerId != null
        ? world.players[world.ball.ownerSide].get(world.ball.ownerId)
        : undefined;
    if (owner) {
      world.ball.x = owner.x;
      world.ball.y = owner.y;
    }
    world.elapsedSeconds += tick;
    remaining -= tick;
  }
}

export function beginPossession(
  world: MatchWorld,
  side: MatchSide,
  carrier: PlacedPlayerLite,
) {
  const state = world.players[side].get(carrier.playerId);
  if (!state) return;
  world.ball.ownerSide = side;
  world.ball.ownerId = carrier.playerId;
  world.ball.x = state.x;
  world.ball.y = state.y;
}

export function moveBallOwner(
  world: MatchWorld,
  side: MatchSide,
  player: PlacedPlayerLite | undefined,
) {
  if (!player) {
    world.ball.ownerSide = null;
    world.ball.ownerId = null;
    return;
  }
  const state = world.players[side].get(player.playerId);
  if (!state) return;
  world.ball.ownerSide = side;
  world.ball.ownerId = player.playerId;
  world.ball.x = state.x;
  world.ball.y = state.y;
}
