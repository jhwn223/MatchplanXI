import { actionPerformanceFactor } from "../playerRuntime";
import { clamp } from "../random";
import type { MatchSide, PlacedPlayerLite, SimInput } from "../types";
import {
  blendPoint,
  constrainToAnchor,
  formationAnchor,
} from "./formationShape";
import { offsideLineFor } from "./perception";
import type {
  DefensiveRole,
  MatchPhase,
  MatchWorld,
  TacticsBySide,
  WorldIntent,
  WorldPlayerState,
  WorldPoint,
} from "./types";

function otherSide(side: MatchSide): MatchSide {
  return side === "user" ? "opp" : "user";
}

function direction(side: MatchSide) {
  return side === "user" ? 1 : -1;
}

function ownGoalX(side: MatchSide) {
  return side === "user" ? 2 : 98;
}

/**
 * Pitch coordinates never approach the range where Math.hypot's overflow
 * guarding matters, and this is the hottest function in the simulation —
 * roughly an eighth of a full match's cost on its own.
 */
function distance(a: WorldPoint, b: WorldPoint) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

function effectivePossessionSide(world: MatchWorld) {
  return world.ball.ownerSide ?? world.lastPossessionSide;
}

function registerPossession(world: MatchWorld, side: MatchSide) {
  if (world.lastPossessionSide === side) return;
  world.previousPossessionSide = world.lastPossessionSide;
  world.lastPossessionSide = side;
  world.possessionChangedAt = world.elapsedSeconds;
  for (const team of ["user", "opp"] as MatchSide[]) {
    for (const player of world.players[team].values()) {
      player.assignmentExpiresAt = 0;
    }
  }
}

function phaseForSide(world: MatchWorld, side: MatchSide): MatchPhase {
  const possessionSide = effectivePossessionSide(world);
  const transitionAge = world.elapsedSeconds - world.possessionChangedAt;
  if (transitionAge < 3.2 && world.previousPossessionSide !== world.lastPossessionSide) {
    return possessionSide === side ? "transitionAttack" : "transitionDefense";
  }
  if (possessionSide !== side) return "defensiveBlock";
  const canonicalBallX = side === "user" ? world.ball.x : 100 - world.ball.x;
  const owner = world.ball.ownerId != null ? world.players[side].get(world.ball.ownerId) : undefined;
  if (canonicalBallX < 32 || owner?.player.position === "GK") return "buildUp";
  if (canonicalBallX < 68) return "middleThird";
  return "finalThird";
}

function refreshPhases(world: MatchWorld) {
  world.phaseBySide.user = phaseForSide(world, "user");
  world.phaseBySide.opp = phaseForSide(world, "opp");
}

function formationLineTarget(
  world: MatchWorld,
  state: WorldPlayerState,
  tactics: TacticsBySide,
): WorldPoint {
  const { side, player } = state;
  const phase = world.phaseBySide[side];
  const hasBall = effectivePossessionSide(world) === side;
  return formationAnchor({
    direction: direction(side),
    role: player.position,
    baseX: player.baseX,
    baseY: player.baseY,
    ball: world.ball,
    phase,
    hasBall,
    profile: tactics[side],
  });
}

function setDefensiveAssignment(
  state: WorldPlayerState,
  role: DefensiveRole,
  expiresAt: number,
  targetId?: number,
) {
  state.defensiveRole = role;
  state.assignmentExpiresAt = expiresAt;
  state.markingTargetId = role === "marker" ? targetId : undefined;
  state.pressingTargetId = role === "presser" ? targetId : undefined;
}

function assignDefensiveRoles(world: MatchWorld, side: MatchSide, tactics: TacticsBySide) {
  // Assignments only refresh every 1.4s, but this runs on every tick, so the
  // early-out must not allocate.
  let outfieldCount = 0;
  let allAssignmentsFresh = true;
  let hasPresser = false;
  for (const state of world.players[side].values()) {
    if (state.player.position === "GK") continue;
    outfieldCount++;
    if (state.assignmentExpiresAt <= world.elapsedSeconds) allAssignmentsFresh = false;
    if (state.defensiveRole === "presser") hasPresser = true;
  }
  if (outfieldCount && allAssignmentsFresh && hasPresser) return;

  const states = [...world.players[side].values()].filter(
    (state) => state.player.position !== "GK",
  );
  const expiresAt = world.elapsedSeconds + 1.4;
  const opponentSide = otherSide(side);
  const ownerId = world.ball.ownerSide === opponentSide ? world.ball.ownerId ?? undefined : undefined;
  for (const state of states) {
    setDefensiveAssignment(
      state,
      state.player.position === "MID" ? "screen" : "restDefense",
      expiresAt,
    );
  }

  const used = new Set<number>();
  const presser = [...states].sort((a, b) => {
    const rolePenalty = (state: WorldPlayerState) =>
      state.player.position === "DEF" ? 6 : state.player.position === "MID" ? 1.5 : 0;
    return distance(a, world.ball) + rolePenalty(a) - distance(b, world.ball) - rolePenalty(b);
  })[0];
  if (presser) {
    used.add(presser.player.playerId);
    setDefensiveAssignment(presser, "presser", expiresAt, ownerId);
  }
  const cover = [...states]
    .filter((state) => !used.has(state.player.playerId))
    .sort((a, b) => {
      const rolePenalty = (state: WorldPlayerState) => state.player.position === "FWD" ? 6 : 0;
      return distance(a, world.ball) + rolePenalty(a) - distance(b, world.ball) - rolePenalty(b);
    })[0];
  if (cover) {
    used.add(cover.player.playerId);
    setDefensiveAssignment(cover, "cover", expiresAt);
  }

  const opponents = [...world.players[opponentSide].values()]
    .filter((state) => state.player.position !== "GK")
    .sort((a, b) => {
      const threat = (state: WorldPlayerState) =>
        (state.player.position === "FWD" ? 30 : state.player.position === "MID" ? 15 : 0) -
        Math.abs(state.x - ownGoalX(side)) * 0.2;
      return threat(b) - threat(a);
    });
  const marked = new Set<number>();
  const markingDefenders = states
    .filter((state) => state.player.position === "DEF" && !used.has(state.player.playerId))
    .sort((a, b) => distance(a, world.ball) - distance(b, world.ball))
    .slice(0, 3);
  for (const defender of markingDefenders) {
    const target = opponents
      .filter((candidate) => !marked.has(candidate.player.playerId))
      .sort((a, b) => distance(defender, a) - distance(defender, b))[0];
    const anchor = formationLineTarget(world, defender, tactics);
    if (target && distance(anchor, target) <= 24) {
      marked.add(target.player.playerId);
      setDefensiveAssignment(defender, "marker", expiresAt, target.player.playerId);
    }
  }
}

/** The two closest outfield teammates to the ball, without sorting the squad. */
function supportIds(world: MatchWorld, side: MatchSide) {
  const ownerId = world.ball.ownerId;
  if (world.ball.ownerSide !== side || ownerId == null) return [];
  let firstId = -1;
  let secondId = -1;
  let firstDistance = Infinity;
  let secondDistance = Infinity;
  for (const candidate of world.players[side].values()) {
    if (candidate.player.position === "GK" || candidate.player.playerId === ownerId) continue;
    const gap = distance(candidate, world.ball);
    if (gap < firstDistance) {
      secondDistance = firstDistance;
      secondId = firstId;
      firstDistance = gap;
      firstId = candidate.player.playerId;
    } else if (gap < secondDistance) {
      secondDistance = gap;
      secondId = candidate.player.playerId;
    }
  }
  if (firstId < 0) return [];
  return secondId < 0 ? [firstId] : [firstId, secondId];
}

function targetForPlayer(
  world: MatchWorld,
  state: WorldPlayerState,
  tactics: TacticsBySide,
  nearbySupportIds: readonly number[],
  offsideLine: number,
): { point: WorldPoint; intent: WorldIntent } {
  const { side, player } = state;
  const dir = direction(side);
  const phase = world.phaseBySide[side];
  const hasBall = effectivePossessionSide(world) === side;
  const ownsBall = world.ball.ownerSide === side && world.ball.ownerId === player.playerId;
  const shape = formationLineTarget(world, state, tactics);

  if (player.position === "GK") {
    const goalX = ownGoalX(side);
    return {
      point: {
        x: clamp(goalX + (world.ball.x - goalX) * 0.07, side === "user" ? 2 : 84, side === "user" ? 16 : 98),
        y: clamp(50 + (world.ball.y - 50) * 0.17, 35, 65),
      },
      intent: "protectGoal",
    };
  }
  if (ownsBall) {
    const desired = {
      x: state.x + dir * (phase === "transitionAttack" ? 5 : 3),
      y: state.y + (shape.y - state.y) * 0.28,
    };
    return {
      point: constrainToAnchor(
        shape,
        desired,
        player.position === "FWD" ? 14 : player.position === "MID" ? 5 : 6,
        player.position === "FWD" ? 14 : 12,
      ),
      intent: "carry",
    };
  }
  if (hasBall) {
    const nearbySupportRank = nearbySupportIds.indexOf(player.playerId);
    if (nearbySupportRank >= 0 && player.position !== "FWD") {
      const desired = {
        x: world.ball.x - dir * (7 + nearbySupportRank * 2),
        y: world.ball.y + (nearbySupportRank === 0 ? -10 : 10),
      };
      return {
        point: constrainToAnchor(shape, desired, 5, 14),
        intent: "support",
      };
    }
    let targetX = shape.x;
    const pulse = Math.sin(world.elapsedSeconds * 0.9 + player.playerId * 0.37);
    if (player.position === "FWD") {
      const timingError = pulse > 0.999
        ? 0.3 + (100 - player.positioning) / 90
        : -2.2;
      const permitted = offsideLine + dir * timingError;
      targetX = side === "user" ? Math.min(targetX + pulse * 2.4, permitted) : Math.max(targetX - pulse * 2.4, permitted);
    } else if (player.position === "MID") {
      targetX += dir * (phase === "transitionAttack" ? 4 : 1.5);
    }
    return {
      point: {
        x: clamp(targetX, 3, 97),
        y: clamp(shape.y + (world.ball.y - shape.y) * (player.position === "MID" ? 0.18 : 0.08), 4, 96),
      },
      intent: "support",
    };
  }

  if (phase === "transitionDefense" && distance(state, world.ball) < 13) {
    return {
      point: constrainToAnchor(
        shape,
        { x: world.ball.x - dir * 1.2, y: world.ball.y },
        player.position === "DEF" ? 11 : 15,
        player.position === "DEF" ? 13 : 17,
      ),
      intent: "press",
    };
  }
  if (state.defensiveRole === "presser") {
    return {
      point: constrainToAnchor(
        shape,
        { x: world.ball.x - dir * 1.1, y: world.ball.y },
        player.position === "DEF" ? 12 : player.position === "MID" ? 16 : 20,
        player.position === "DEF" ? 14 : 19,
      ),
      intent: "press",
    };
  }
  if (state.defensiveRole === "cover") {
    const desired = {
      x: world.ball.x + (ownGoalX(side) - world.ball.x) * 0.12,
      y: world.ball.y + (50 - world.ball.y) * 0.12,
    };
    return {
      point: constrainToAnchor(shape, desired, 10, 13),
      intent: "mark",
    };
  }
  if (state.defensiveRole === "marker" && state.markingTargetId != null) {
    const marked = world.players[otherSide(side)].get(state.markingTargetId);
    if (marked) {
      const goalSide = {
        x: marked.x + (ownGoalX(side) - marked.x) * 0.1,
        y: marked.y,
      };
      return {
        point: constrainToAnchor(shape, blendPoint(shape, goalSide, 0.48), 9, 13),
        intent: "mark",
      };
    }
  }
  if (state.defensiveRole === "screen") {
    return {
      point: {
        x: shape.x + (world.ball.x - shape.x) * 0.18,
        y: shape.y + (world.ball.y - shape.y) * 0.35,
      },
      intent: "mark",
    };
  }
  return { point: shape, intent: "holdShape" };
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
  const remaining = Math.sqrt(dx * dx + dy * dy);
  if (remaining < 0.01) {
    state.vx = 0;
    state.vy = 0;
    return;
  }
  // Every input to this is fixed for the whole match minute, but it used to be
  // recomputed for all 22 players on every tick.
  if (state.movementFactorMinute !== minute) {
    state.movementFactorMinute = minute;
    state.movementFactor = actionPerformanceFactor(
      state.player,
      minute,
      input.elevation,
      "movement",
      tactics[state.side],
    );
  }
  const performance = state.movementFactor ?? 1;
  const pace = (state.player.pace * 0.62 + state.player.acceleration * 0.38) / 100;
  const intelligence = clamp((state.player.positioning + state.player.reactions) / 180, 0.65, 1.1);
  const maxSpeed = (2.5 + pace * 3.4) * performance * intelligence;
  const step = Math.min(remaining, maxSpeed * seconds);
  state.vx = (dx / remaining) * (step / Math.max(seconds, 0.001));
  state.vy = (dy / remaining) * (step / Math.max(seconds, 0.001));
  state.x = clamp(state.x + (dx / remaining) * step, 1, 99);
  state.y = clamp(state.y + (dy / remaining) * step, 2, 98);
}

/**
 * Shape corrections are rate-limited by the tick length. Applying them as a
 * fixed per-tick snap moved players faster than they can run whenever a
 * correction target jumped (a possession change lifting the defensive line),
 * which then showed up in the rendered picture as a teleport.
 */
const SEPARATION_RATE = 4;
const LINE_CATCHUP_SPEED = 11;
const MAX_CORRECTION_SPEED = 12;

function approachBand(value: number, lower: number, upper: number, maxStep: number) {
  if (value < lower) return Math.min(lower, value + maxStep);
  if (value > upper) return Math.max(upper, value - maxStep);
  return value;
}

function enforceSpacingAndLines(
  world: MatchWorld,
  seconds: number,
  all: WorldPlayerState[],
) {
  for (let first = 0; first < all.length; first++) {
    for (let second = first + 1; second < all.length; second++) {
      const a = all[first];
      const b = all[second];
      let dx = b.x - a.x;
      let dy = b.y - a.y;
      const sameTeam = a.side === b.side;
      const sameLine = sameTeam && a.player.position === b.player.position;
      const minimum = sameLine ? 5.2 : sameTeam ? 3.7 : 0.85;
      // Most of the 231 pairs are far apart every tick, so reject on the
      // squared distance and only pay for the square root on a real overlap.
      const squared = dx * dx + dy * dy;
      if (squared >= minimum * minimum) continue;
      let current = Math.sqrt(squared);
      if (current <= 0.01) {
        dx = 0;
        dy = a.player.baseY <= b.player.baseY ? 1 : -1;
        current = 1;
      }
      const push = Math.min(
        (minimum - current) * (sameTeam ? SEPARATION_RATE : SEPARATION_RATE * 0.7) * seconds,
        MAX_CORRECTION_SPEED * seconds,
      );
      let nx = dx / current;
      let ny = dy / current;
      if (sameLine && Math.abs(ny) < 0.45) {
        ny = a.player.baseY <= b.player.baseY ? 1 : -1;
        nx *= 0.2;
      }
      a.x = clamp(a.x - nx * push, 1, 99);
      a.y = clamp(a.y - ny * push, 2, 98);
      b.x = clamp(b.x + nx * push, 1, 99);
      b.y = clamp(b.y + ny * push, 2, 98);
    }
  }
  const lineStep = LINE_CATCHUP_SPEED * seconds;
  for (const side of ["user", "opp"] as MatchSide[]) {
    const defenders = [...world.players[side].values()].filter(
      (state) => state.player.position === "DEF",
    );
    if (defenders.length) {
      const targetLineX = defenders.reduce((sum, state) => sum + state.target.x, 0) / defenders.length;
      for (const defender of defenders) {
        defender.x = approachBand(defender.x, targetLineX - 5.5, targetLineX + 5.5, lineStep);
      }
    }
    const keeper = [...world.players[side].values()].find(
      (state) => state.player.position === "GK",
    );
    if (keeper) {
      keeper.x = approachBand(keeper.x, side === "user" ? 2 : 84, side === "user" ? 16 : 98, lineStep);
      keeper.y = approachBand(keeper.y, 35, 65, lineStep);
    }
  }
}

export function advanceWorld(
  world: MatchWorld,
  input: SimInput,
  tactics: TacticsBySide,
  seconds: number,
  // Statistical world snapshots do not need animation-frame granularity.
  // Half-second tactical ticks retain movement continuity while keeping
  // full-match simulation and calibration tests fast; a caller stepping
  // through a stoppage can ask for a coarser tick.
  tickLength = 0.5,
) {
  // The squads cannot change while the world is being stepped, so the flat
  // player list the spacing pass needs is built once per call.
  const everyone = [...world.players.user.values(), ...world.players.opp.values()];
  const sides = ["user", "opp"] as const;
  let remaining = clamp(seconds, 0, 12);
  while (remaining > 0.001) {
    const tick = Math.min(tickLength, remaining);
    refreshPhases(world);
    const possessionSide = effectivePossessionSide(world);
    if (possessionSide) assignDefensiveRoles(world, otherSide(possessionSide), tactics);
    const supporters = {
      user: supportIds(world, "user"),
      opp: supportIds(world, "opp"),
    };
    // The offside line only changes once per tick, but every forward used to
    // recompute it on its own.
    const offsideLines = {
      user: offsideLineFor(world, "user"),
      opp: offsideLineFor(world, "opp"),
    };
    for (const side of sides) {
      for (const state of world.players[side].values()) {
        const next = targetForPlayer(world, state, tactics, supporters[side], offsideLines[side]);
        state.target = next.point;
        state.intent = next.intent;
        movePlayer(state, next.point, tick, world.minute, input, tactics);
      }
    }
    enforceSpacingAndLines(world, tick, everyone);
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
  registerPossession(world, side);
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
  registerPossession(world, side);
  world.ball.ownerSide = side;
  world.ball.ownerId = player.playerId;
  world.ball.x = state.x;
  world.ball.y = state.y;
}
