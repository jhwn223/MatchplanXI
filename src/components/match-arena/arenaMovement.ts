import type { PositionSample } from "../../data/matchSim";
import {
  BALANCED_SHAPE_PROFILE,
  blendPoint,
  constrainToAnchor,
  formationAnchor,
} from "../../data/match/world/formationShape";
import { clamp } from "./runtimeMath";
import type { ArenaDot, ArenaMatchPhase, ArenaState } from "./runtimeTypes";

export interface ArenaPositionTarget {
  x: number;
  y: number;
}

export type PositionSampleIndex = Map<number, PositionSample[]>;

interface MovementTarget extends ArenaPositionTarget {
  speed: number;
  action: ArenaDot["action"];
}

const MAX_PLAYER_SPEED = 18;
const TRANSITION_SECONDS = 3.2;

export function indexPositionSamples(samples: PositionSample[] | undefined): PositionSampleIndex {
  const index: PositionSampleIndex = new Map();
  for (const sample of samples ?? []) {
    const list = index.get(sample.playerId);
    if (list) list.push(sample);
    else index.set(sample.playerId, [sample]);
  }
  for (const list of index.values()) list.sort((a, b) => a.minute - b.minute);
  return index;
}

export function interpolatePositionTargets(
  index: PositionSampleIndex,
  clock: number,
): Map<number, ArenaPositionTarget> {
  const targets = new Map<number, ArenaPositionTarget>();
  for (const [playerId, samples] of index) {
    if (!samples.length) continue;
    let previous = samples[0];
    let next: PositionSample | null = null;
    for (const sample of samples) {
      if (sample.minute <= clock) previous = sample;
      else {
        next = sample;
        break;
      }
    }
    if (!next || previous.minute >= clock) {
      targets.set(playerId, {
        x: clamp(previous.x, 2, 98),
        y: clamp(previous.y, 3, 97),
      });
      continue;
    }
    const span = Math.max(0.001, next.minute - previous.minute);
    const progress = clamp((clock - previous.minute) / span, 0, 1);
    targets.set(playerId, {
      x: clamp(previous.x + (next.x - previous.x) * progress, 2, 98),
      y: clamp(previous.y + (next.y - previous.y) * progress, 3, 97),
    });
  }
  return targets;
}

function direction(team: 0 | 1) {
  return team === 0 ? 1 : -1;
}

function ownGoalX(team: 0 | 1) {
  return team === 0 ? 2 : 98;
}

function opponentGoalX(team: 0 | 1) {
  return team === 0 ? 98 : 2;
}

function effectivePossessionTeam(state: ArenaState): 0 | 1 {
  return state.ball.owner >= 0 ? state.dots[state.ball.owner].team : state.ball.lastTeam;
}

function phaseForTeam(state: ArenaState, team: 0 | 1): ArenaMatchPhase {
  const possessionTeam = effectivePossessionTeam(state);
  const movement = state.movement;
  const transitionAge = movement ? state.time - movement.changedAt : Number.POSITIVE_INFINITY;
  if (movement && transitionAge < TRANSITION_SECONDS) {
    return possessionTeam === team ? "transitionAttack" : "transitionDefense";
  }
  if (possessionTeam !== team) return "defensiveBlock";
  const canonicalBallX = team === 0 ? state.ball.x : 100 - state.ball.x;
  const owner = state.ball.owner >= 0 ? state.dots[state.ball.owner] : null;
  if (canonicalBallX < 32 || owner?.role === "GK") return "buildUp";
  if (canonicalBallX < 68) return "middleThird";
  return "finalThird";
}

function updateMovementContext(state: ArenaState) {
  const possessionTeam = effectivePossessionTeam(state);
  if (!state.movement) {
    state.movement = {
      possessionTeam,
      previousPossessionTeam: possessionTeam,
      changedAt: state.time,
      phaseByTeam: ["middleThird", "defensiveBlock"],
    };
  } else if (state.movement.possessionTeam !== possessionTeam) {
    state.movement.previousPossessionTeam = state.movement.possessionTeam;
    state.movement.possessionTeam = possessionTeam;
    state.movement.changedAt = state.time;
    for (const dot of state.dots) dot.assignmentExpiresAt = 0;
  }
  state.movement.phaseByTeam = [phaseForTeam(state, 0), phaseForTeam(state, 1)];
  return state.movement;
}

function refreshDefensiveAssignments(state: ArenaState, defendingTeam: 0 | 1) {
  const defenders = state.dots
    .map((dot, index) => ({ dot, index }))
    .filter(({ dot }) => dot.team === defendingTeam && dot.role !== "GK");
  if (
    defenders.length &&
    defenders.every(({ dot }) => (dot.assignmentExpiresAt ?? 0) > state.time) &&
    defenders.some(({ dot }) => dot.defensiveRole === "presser")
  ) return;

  const expiresAt = state.time + 1.4;
  const attackingTeam: 0 | 1 = defendingTeam === 0 ? 1 : 0;
  for (const { dot } of defenders) {
    Object.assign(dot, {
      defensiveRole: dot.role === "MID" ? "screen" as const : "restDefense" as const,
      markingTargetId: undefined,
      pressingTargetId: undefined,
      assignmentExpiresAt: expiresAt,
    });
  }
  const used = new Set<number>();
  const presser = [...defenders].sort((a, b) => {
    const rolePenalty = ({ dot }: { dot: ArenaDot }) => dot.role === "DEF" ? 6 : dot.role === "MID" ? 1.5 : 0;
    return (
      Math.hypot(a.dot.x - state.ball.x, a.dot.y - state.ball.y) + rolePenalty(a) -
      Math.hypot(b.dot.x - state.ball.x, b.dot.y - state.ball.y) - rolePenalty(b)
    );
  })[0]?.index ?? -1;
  if (presser >= 0) {
    used.add(presser);
    Object.assign(state.dots[presser], {
      defensiveRole: "presser" as const,
      pressingTargetId: state.ball.owner >= 0 ? state.dots[state.ball.owner].playerId : undefined,
      markingTargetId: undefined,
      assignmentExpiresAt: expiresAt,
    });
  }
  const cover = [...defenders]
    .filter(({ index }) => !used.has(index))
    .sort((a, b) => {
      const rolePenalty = ({ dot }: { dot: ArenaDot }) => dot.role === "FWD" ? 6 : 0;
      return (
        Math.hypot(a.dot.x - state.ball.x, a.dot.y - state.ball.y) + rolePenalty(a) -
        Math.hypot(b.dot.x - state.ball.x, b.dot.y - state.ball.y) - rolePenalty(b)
      );
    })[0]?.index ?? -1;
  if (cover >= 0) {
    used.add(cover);
    Object.assign(state.dots[cover], {
      defensiveRole: "cover" as const,
      pressingTargetId: undefined,
      markingTargetId: undefined,
      assignmentExpiresAt: expiresAt,
    });
  }
  const attackers = state.dots
    .filter((dot) => dot.team === attackingTeam && dot.role !== "GK")
    .sort((a, b) => {
      const threat = (dot: ArenaDot) =>
        (dot.role === "FWD" ? 30 : dot.role === "MID" ? 15 : 0) -
        Math.abs(dot.x - ownGoalX(defendingTeam)) * 0.2;
      return threat(b) - threat(a);
    });
  const marked = new Set<number>();
  const markingDefenders = defenders
    .filter(({ dot, index }) => dot.role === "DEF" && !used.has(index))
    .sort((a, b) =>
      Math.hypot(a.dot.x - state.ball.x, a.dot.y - state.ball.y) -
      Math.hypot(b.dot.x - state.ball.x, b.dot.y - state.ball.y)
    )
    .slice(0, 3);
  for (const { dot } of markingDefenders) {
    const target = attackers
      .filter((attacker) => !marked.has(attacker.playerId))
      .sort((a, b) =>
        Math.hypot(dot.x - a.x, dot.y - a.y) - Math.hypot(dot.x - b.x, dot.y - b.y)
      )[0];
    const phase = state.movement?.phaseByTeam[dot.team] ?? "defensiveBlock";
    const anchor = relativeShapeTarget(state, dot, undefined, phase);
    if (target && Math.hypot(anchor.x - target.x, anchor.y - target.y) <= 24) {
      marked.add(target.playerId);
      Object.assign(dot, {
        defensiveRole: "marker" as const,
        markingTargetId: target.playerId,
        pressingTargetId: undefined,
        assignmentExpiresAt: expiresAt,
      });
    }
  }
}

export function arenaOffsideLine(state: ArenaState, attackingTeam: 0 | 1) {
  const defendingTeam: 0 | 1 = attackingTeam === 0 ? 1 : 0;
  const defenderX = state.dots
    .filter((dot) => dot.team === defendingTeam)
    .map((dot) => dot.x)
    .sort((a, b) => a - b);
  if (defenderX.length < 2) return attackingTeam === 0 ? 96 : 4;
  return attackingTeam === 0
    ? Math.max(state.ball.x, defenderX[defenderX.length - 2])
    : Math.min(state.ball.x, defenderX[1]);
}

function relativeShapeTarget(
  state: ArenaState,
  dot: ArenaDot,
  sample: ArenaPositionTarget | undefined,
  phase: ArenaMatchPhase,
): ArenaPositionTarget {
  const hasBall = effectivePossessionTeam(state) === dot.team;
  const canonicalHomeX = dot.team === 0 ? dot.hx : 100 - dot.hx;
  const anchor = formationAnchor({
    direction: direction(dot.team),
    role: dot.role,
    baseX: canonicalHomeX,
    baseY: dot.hy,
    ball: state.ball,
    phase,
    hasBall,
    profile: state.shapeProfiles?.[dot.team] ?? BALANCED_SHAPE_PROFILE,
  });
  return sample ? blendPoint(anchor, sample, 0.18) : anchor;
}

function setPieceTarget(state: ArenaState, dot: ArenaDot, index: number): MovementTarget | null {
  const situation = state.situation;
  if (!situation) return null;
  const attacking = dot.team === situation.side;
  const dir = direction(situation.side);
  const goalX = opponentGoalX(situation.side);
  const lane = (index % 5) - 2;
  if (index === situation.actor) return { x: situation.x, y: situation.y, speed: 16, action: "receive" };
  if (situation.type === "penaltyKick") {
    if (!attacking && dot.role === "GK") return { x: goalX, y: 50, speed: 12, action: "save" };
    return { x: goalX - dir * (attacking ? 25 : 22), y: clamp(50 + lane * 5, 30, 70), speed: 12, action: "move" };
  }
  if (situation.type === "corner") {
    if (dot.role === "GK") return { x: ownGoalX(dot.team), y: 50, speed: 9, action: "move" };
    return {
      x: clamp(goalX - dir * (attacking ? 10 + (index % 3) * 3 : 7 + (index % 4) * 2), 3, 97),
      y: clamp(50 + lane * (attacking ? 8 : 6), 16, 84),
      speed: 13,
      action: attacking ? "receive" : "press",
    };
  }
  if (situation.type === "offside") {
    if (dot.role === "GK") {
      return { x: ownGoalX(dot.team), y: 50, speed: 9, action: "move" };
    }
    // An offside restart is an ordinary indirect free kick: only the taker
    // approaches the stationary ball. Teammates retain their open-play shape,
    // while opponents that are too close retreat just far enough to respect
    // the required distance instead of both teams crowding the restart point.
    if (dot.team !== situation.side) {
      const dx = dot.x - situation.x;
      const dy = dot.y - situation.y;
      const distance = Math.hypot(dx, dy);
      if (distance < 9.15) {
        const fallbackX = direction(dot.team);
        const nx = distance > 0.01 ? dx / distance : fallbackX;
        const ny = distance > 0.01 ? dy / distance : 0;
        return {
          x: clamp(situation.x + nx * 9.5, 3, 97),
          y: clamp(situation.y + ny * 9.5, 4, 96),
          speed: 12,
          action: "move",
        };
      }
    }
    return null;
  }
  if (situation.type === "freeKick") {
    if (dot.role === "GK") return { x: ownGoalX(dot.team), y: 50, speed: 9, action: "move" };
    return {
      x: clamp(situation.x + dir * (attacking ? 8 + (index % 4) * 4 : 10), 3, 97),
      y: clamp(50 + lane * 7, 14, 86),
      speed: 12,
      action: attacking ? "receive" : "press",
    };
  }
  return null;
}

function steer(dot: ArenaDot, target: MovementTarget, dt: number, clock: number) {
  const dx = target.x - dot.x;
  const dy = target.y - dot.y;
  const distance = Math.hypot(dx, dy);
  const fatigue = clamp(1 - (clock / 120) * (0.2 - dot.stamina / 800) - (100 - dot.condition) / 600, 0.7, 1);
  const ability = clamp(0.78 + dot.pace / 300 + dot.react * 0.04, 0.82, 1.2);
  const desiredSpeed = Math.min(MAX_PLAYER_SPEED, target.speed * fatigue * ability * clamp(distance / 2.4, 0, 1));
  const desiredVx = distance > 0.001 ? (dx / distance) * desiredSpeed : 0;
  const desiredVy = distance > 0.001 ? (dy / distance) * desiredSpeed : 0;
  const acceleration = 18 + dot.react * 4 + dot.pace / 12;
  dot.vx += clamp(desiredVx - dot.vx, -acceleration * dt, acceleration * dt);
  dot.vy += clamp(desiredVy - dot.vy, -acceleration * dt, acceleration * dt);
  if (distance < 0.35) {
    const damping = Math.max(0, 1 - dt * 10);
    dot.vx *= damping;
    dot.vy *= damping;
  }
  const speed = Math.hypot(dot.vx, dot.vy);
  if (speed > MAX_PLAYER_SPEED) {
    dot.vx = dot.vx / speed * MAX_PLAYER_SPEED;
    dot.vy = dot.vy / speed * MAX_PLAYER_SPEED;
  }
  dot.x = clamp(dot.x + dot.vx * dt, 2, 98);
  dot.y = clamp(dot.y + dot.vy * dt, 3, 97);
  if (Math.hypot(dot.vx, dot.vy) > 0.15) dot.facing = Math.atan2(dot.vy, dot.vx);
  if (dot.actionT <= 0) dot.action = target.action;
}

/**
 * Dots that are executing a scripted obligation (running to claim a pass,
 * walking to a restart spot, chasing a flight) must be able to reach their
 * exact target, so collective-shape corrections never apply to them —
 * otherwise the wait-for-arrival states upstream can never resolve.
 */
function scriptedObligationIndices(state: ArenaState) {
  const busy = new Set<number>();
  if (state.scriptedRun) busy.add(state.scriptedRun.actor);
  if (state.situation) busy.add(state.situation.actor);
  const flight = state.ball.flightTarget;
  if (flight?.owner != null && flight.owner >= 0) busy.add(flight.owner);
  if (flight?.chaser != null && flight.chaser >= 0) busy.add(flight.chaser);
  if (state.ball.owner >= 0) busy.add(state.ball.owner);
  return busy;
}

/**
 * Every shape correction below is rate-limited by `dt`. These used to be
 * hard per-frame snaps, which read as teleports whenever a correction target
 * jumped (a possession change moving the defensive line, a crowded corner
 * separating) — a player can only ever be corrected at a plausible run speed.
 */
const SEPARATION_RATE = 4;
const LINE_CATCHUP_SPEED = 11;

function approachBand(value: number, lower: number, upper: number, maxStep: number) {
  if (value < lower) return Math.min(lower, value + maxStep);
  if (value > upper) return Math.max(upper, value - maxStep);
  return value;
}

function enforceSpacingAndLines(state: ArenaState, dt: number) {
  const busy = scriptedObligationIndices(state);
  for (let first = 0; first < state.dots.length; first++) {
    for (let second = first + 1; second < state.dots.length; second++) {
      const a = state.dots[first];
      const b = state.dots[second];
      let dx = b.x - a.x;
      let dy = b.y - a.y;
      let distance = Math.hypot(dx, dy);
      const sameTeam = a.team === b.team;
      const sameLine = sameTeam && a.role === b.role;
      const minimum = sameLine ? 5.2 : sameTeam ? 3.7 : 0.85;
      if (distance >= minimum) continue;
      if (distance <= 0.01) {
        dx = 0;
        dy = a.hy <= b.hy ? 1 : -1;
        distance = 1;
      }
      const push = Math.min(
        (minimum - distance) * (sameTeam ? SEPARATION_RATE : SEPARATION_RATE * 0.7) * dt,
        MAX_PLAYER_SPEED * dt,
      );
      let nx = dx / distance;
      let ny = dy / distance;
      if (sameLine && Math.abs(ny) < 0.45) {
        ny = a.hy <= b.hy ? 1 : -1;
        nx *= 0.2;
      }
      const firstBusy = busy.has(first);
      const secondBusy = busy.has(second);
      if (firstBusy && secondBusy) continue;
      if (firstBusy) {
        b.x = clamp(b.x + nx * push * 2, 2, 98);
        b.y = clamp(b.y + ny * push * 2, 3, 97);
      } else if (secondBusy) {
        a.x = clamp(a.x - nx * push * 2, 2, 98);
        a.y = clamp(a.y - ny * push * 2, 3, 97);
      } else {
        a.x = clamp(a.x - nx * push, 2, 98);
        a.y = clamp(a.y - ny * push, 3, 97);
        b.x = clamp(b.x + nx * push, 2, 98);
        b.y = clamp(b.y + ny * push, 3, 97);
      }
    }
  }
  const lineStep = LINE_CATCHUP_SPEED * dt;
  for (const team of [0, 1] as const) {
    const defenders = state.dots
      .map((dot, index) => ({ dot, index }))
      .filter(({ dot }) => dot.team === team && dot.role === "DEF");
    if (defenders.length) {
      const phase = state.movement?.phaseByTeam[team] ?? "defensiveBlock";
      const targetLineX = defenders.reduce(
        (sum, { dot }) => sum + relativeShapeTarget(state, dot, undefined, phase).x,
        0,
      ) / defenders.length;
      for (const { dot, index } of defenders) {
        if (busy.has(index)) continue;
        dot.x = approachBand(dot.x, targetLineX - 5.5, targetLineX + 5.5, lineStep);
      }
    }
    const keeperIndex = state.dots.findIndex((dot) => dot.team === team && dot.role === "GK");
    if (keeperIndex >= 0 && !busy.has(keeperIndex)) {
      const keeper = state.dots[keeperIndex];
      keeper.x = approachBand(keeper.x, team === 0 ? 2 : 84, team === 0 ? 16 : 98, lineStep);
      keeper.y = approachBand(keeper.y, 35, 65, lineStep);
    }
  }
}

export function updateArenaMovement(
  state: ArenaState,
  positionTargets: ReadonlyMap<number, ArenaPositionTarget>,
  dt: number,
) {
  const movement = updateMovementContext(state);
  const ballTeam = movement.possessionTeam;
  const defendingTeam: 0 | 1 = ballTeam === 0 ? 1 : 0;
  refreshDefensiveAssignments(state, defendingTeam);

  const supporterIndices = state.dots
    .map((dot, index) => ({ dot, index }))
    .filter(({ dot, index }) => dot.team === ballTeam && dot.role !== "GK" && index !== state.ball.owner)
    .sort((a, b) =>
      Math.hypot(a.dot.x - state.ball.x, a.dot.y - state.ball.y) -
      Math.hypot(b.dot.x - state.ball.x, b.dot.y - state.ball.y)
    )
    .slice(0, 2)
    .map(({ index }) => index);

  state.dots.forEach((dot, index) => {
    dot.actionT = Math.max(0, dot.actionT - dt);
    const scripted = state.scriptedRun?.actor === index ? state.scriptedRun : null;
    const restart = setPieceTarget(state, dot, index);
    const flightChaser = state.ball.flightTarget?.owner === index || state.ball.flightTarget?.chaser === index;
    const phase = movement.phaseByTeam[dot.team];
    const shape = relativeShapeTarget(state, dot, positionTargets.get(dot.playerId), phase);
    let target: MovementTarget;

    if (scripted) {
      target = { x: scripted.x, y: scripted.y, speed: scripted.claimBall ? 18 : 16, action: scripted.action };
    } else if (restart) {
      target = restart;
    } else if (flightChaser && state.ball.flightTarget) {
      target = { x: state.ball.flightTarget.x, y: clamp(state.ball.flightTarget.y, 3, 97), speed: 15, action: "receive" };
    } else if (state.scoring?.shooter === index) {
      target = { x: clamp(dot.x + direction(dot.team) * 3.5, 3, 97), y: dot.y, speed: 12, action: "shoot" };
    } else if (dot.role === "GK") {
      const goalX = ownGoalX(dot.team);
      target = {
        x: clamp(goalX + (state.ball.x - goalX) * 0.07, dot.team === 0 ? 2 : 84, dot.team === 0 ? 16 : 98),
        y: clamp(50 + (state.ball.y - 50) * 0.17, 35, 65),
        speed: 6,
        action: "move",
      };
    } else if (state.ball.owner === index) {
      const desired = {
        x: dot.x + direction(dot.team) * (phase === "transitionAttack" ? 5 : 3),
        y: dot.y + (shape.y - dot.y) * 0.28,
      };
      const carrying = constrainToAnchor(
        shape,
        desired,
        dot.role === "FWD" ? 14 : dot.role === "MID" ? 5 : 6,
        dot.role === "FWD" ? 14 : 12,
      );
      target = {
        ...carrying,
        speed: 12,
        action: "dribble",
      };
    } else if (dot.team === ballTeam) {
      const supportRank = supporterIndices.indexOf(index);
      if (supportRank >= 0 && dot.role !== "FWD") {
        const awareness = clamp((dot.positioning + dot.vision) / 180, 0.72, 1.08);
        const desired = {
          x: state.ball.x - direction(dot.team) * (8 / awareness),
          y: state.ball.y + (supportRank === 0 ? -9 : 9) / awareness,
        };
        const support = constrainToAnchor(shape, desired, 5, 14);
        target = {
          ...support,
          speed: 10 + awareness,
          action: "move",
        };
      } else {
        let x = shape.x;
        if (dot.role === "FWD") {
          const line = arenaOffsideLine(state, dot.team);
          const pulse = Math.sin(state.time * 1.1 + dot.playerId * 0.37);
          const timingError = pulse > 0.999
            ? 0.3 + (100 - dot.positioning) / 90
            : -2.2;
          const permitted = line + direction(dot.team) * timingError;
          x = dot.team === 0 ? Math.min(x + pulse * 2, permitted) : Math.max(x - pulse * 2, permitted);
        }
        target = { x: clamp(x, 3, 97), y: shape.y, speed: dot.role === "FWD" ? 12 : 9.5, action: "move" };
      }
    } else if (phase === "transitionDefense" && Math.hypot(dot.x - state.ball.x, dot.y - state.ball.y) < 13) {
      const pressed = constrainToAnchor(
        shape,
        { x: state.ball.x - direction(dot.team) * 1.2, y: state.ball.y },
        dot.role === "DEF" ? 11 : 15,
        dot.role === "DEF" ? 13 : 17,
      );
      target = { ...pressed, speed: 15, action: "press" };
    } else if (dot.defensiveRole === "presser") {
      const pressed = constrainToAnchor(
        shape,
        { x: state.ball.x - direction(dot.team) * 1.1, y: state.ball.y },
        dot.role === "DEF" ? 12 : dot.role === "MID" ? 16 : 20,
        dot.role === "DEF" ? 14 : 19,
      );
      target = { ...pressed, speed: 15, action: "press" };
    } else if (dot.defensiveRole === "cover") {
      const covered = constrainToAnchor(
        shape,
        {
          x: state.ball.x + (ownGoalX(dot.team) - state.ball.x) * 0.12,
          y: state.ball.y + (50 - state.ball.y) * 0.12,
        },
        10,
        13,
      );
      target = {
        ...covered,
        speed: 12,
        action: "move",
      };
    } else if (dot.defensiveRole === "marker" && dot.markingTargetId != null) {
      const marked = state.dots.find((candidate) => candidate.team !== dot.team && candidate.playerId === dot.markingTargetId);
      if (marked) {
        const goalSide = {
          x: marked.x + (ownGoalX(dot.team) - marked.x) * 0.1,
          y: marked.y,
        };
        const marking = constrainToAnchor(shape, blendPoint(shape, goalSide, 0.48), 9, 13);
        target = { ...marking, speed: 11, action: "move" };
      } else {
        target = { ...shape, speed: 9, action: "move" };
      }
    } else if (dot.defensiveRole === "screen") {
      target = {
        x: shape.x + (state.ball.x - shape.x) * 0.18,
        y: shape.y + (state.ball.y - shape.y) * 0.35,
        speed: 9.5,
        action: "move",
      };
    } else {
      target = { ...shape, speed: 9, action: "move" };
    }
    steer(dot, target, dt, state.clock);
  });
  enforceSpacingAndLines(state, dt);
}
