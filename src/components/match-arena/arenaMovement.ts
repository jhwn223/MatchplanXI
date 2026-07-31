import { clamp, distanceSquared } from "./runtimeMath";
import type { ArenaDot, ArenaState } from "./runtimeTypes";
import type { LiveIntensity } from "./tactics";

type Team = 0 | 1;

interface Target {
  x: number;
  y: number;
  speed: number;
  action: ArenaDot["action"];
}

const direction = (team: Team) => (team === 0 ? 1 : -1);
const ownGoalX = (team: Team) => (team === 0 ? 2 : 98);
const opponentGoalX = (team: Team) => (team === 0 ? 98 : 2);

function nearestIndex(
  state: ArenaState,
  team: Team,
  x: number,
  y: number,
  excluded = new Set<number>(),
) {
  let best = -1;
  let bestDistance = Number.POSITIVE_INFINITY;
  state.dots.forEach((dot, index) => {
    if (dot.team !== team || excluded.has(index) || dot.role === "GK") return;
    const distance = distanceSquared(dot.x, dot.y, x, y);
    if (distance < bestDistance) {
      best = index;
      bestDistance = distance;
    }
  });
  return best;
}

function nearestOpponent(state: ArenaState, index: number) {
  const dot = state.dots[index];
  let best = -1;
  let bestDistance = Number.POSITIVE_INFINITY;
  state.dots.forEach((candidate, candidateIndex) => {
    if (candidate.team === dot.team || candidate.role === "GK") return;
    const rolePenalty = candidate.role === dot.role ? 0 : 45;
    const distance =
      distanceSquared(dot.x, dot.y, candidate.x, candidate.y) + rolePenalty;
    if (distance < bestDistance) {
      best = candidateIndex;
      bestDistance = distance;
    }
  });
  return best;
}

function offsideLimit(state: ArenaState, attackingTeam: Team) {
  const defenders = state.dots
    .filter((dot) => dot.team !== attackingTeam && dot.role !== "GK")
    .map((dot) => dot.x)
    .sort((a, b) => a - b);
  if (defenders.length < 2) return attackingTeam === 0 ? 94 : 6;
  return attackingTeam === 0
    ? defenders[defenders.length - 2] - 1.4
    : defenders[1] + 1.4;
}

function steer(
  dot: ArenaDot,
  target: Target,
  dt: number,
  clock: number,
) {
  const dx = target.x - dot.x;
  const dy = target.y - dot.y;
  const distance = Math.hypot(dx, dy);
  const fatigue = clamp(
    1 - (clock / 120) * (0.24 - dot.stamina / 700) - (100 - dot.condition) / 520,
    0.68,
    1,
  );
  const abilitySpeed = 0.78 + dot.pace / 280;
  const brakingDistance = Math.max(2, target.speed * 0.45);
  const arrivalScale = clamp(distance / brakingDistance, 0, 1);
  const desiredSpeed = target.speed * abilitySpeed * fatigue * arrivalScale;
  const desiredVx = distance > 0.01 ? (dx / distance) * desiredSpeed : 0;
  const desiredVy = distance > 0.01 ? (dy / distance) * desiredSpeed : 0;
  const acceleration = 13 + dot.react * 5 + dot.pace / 18;
  const velocityDeltaX = clamp(desiredVx - dot.vx, -acceleration * dt, acceleration * dt);
  const velocityDeltaY = clamp(desiredVy - dot.vy, -acceleration * dt, acceleration * dt);
  dot.vx += velocityDeltaX;
  dot.vy += velocityDeltaY;

  if (distance < 0.8) {
    const damping = Math.max(0, 1 - dt * 7);
    dot.vx *= damping;
    dot.vy *= damping;
  }

  dot.x = clamp(dot.x + dot.vx * dt, 2, 98);
  dot.y = clamp(dot.y + dot.vy * dt, 3, 97);
  if (Math.hypot(dot.vx, dot.vy) > 0.2) {
    dot.facing = Math.atan2(dot.vy, dot.vx);
  }
  if (dot.actionT <= 0) dot.action = target.action;
}

function separatePlayers(state: ArenaState) {
  for (let first = 0; first < state.dots.length; first++) {
    for (let second = first + 1; second < state.dots.length; second++) {
      const a = state.dots[first];
      const b = state.dots[second];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const distance = Math.hypot(dx, dy);
      const minimum = a.team === b.team ? 2.35 : 1.9;
      if (distance <= 0.01 || distance >= minimum) continue;
      const overlap = (minimum - distance) * 0.5;
      const nx = dx / distance;
      const ny = dy / distance;
      a.x = clamp(a.x - nx * overlap, 2, 98);
      a.y = clamp(a.y - ny * overlap, 3, 97);
      b.x = clamp(b.x + nx * overlap, 2, 98);
      b.y = clamp(b.y + ny * overlap, 3, 97);
    }
  }
}

function setPieceTarget(
  state: ArenaState,
  dot: ArenaDot,
  index: number,
): Target | null {
  const situation = state.situation;
  if (!situation) return null;
  const attacking = dot.team === situation.side;
  const dir = direction(situation.side);
  const goalX = opponentGoalX(situation.side);
  const defendingGoalX = ownGoalX(dot.team);
  const lane = (index % 5) - 2;

  if (index === situation.actor) {
    return {
      x: situation.x,
      y: situation.y,
      speed: 11,
      action: "receive",
    };
  }

  if (situation.type === "penaltyKick") {
    if (!attacking && dot.role === "GK") {
      return { x: goalX, y: 50, speed: 10, action: "save" };
    }
    return {
      x: goalX - dir * (attacking ? 26 : 23),
      y: clamp(50 + lane * 5, 30, 70),
      speed: 9,
      action: "move",
    };
  }

  if (situation.type === "corner") {
    if (!attacking && dot.role === "GK") {
      return { x: defendingGoalX, y: 50, speed: 9, action: "move" };
    }
    if (dot.role === "GK") {
      return { x: ownGoalX(dot.team), y: 50, speed: 5, action: "move" };
    }
    return {
      x: clamp(goalX - dir * (attacking ? 9 + (index % 3) * 3 : 6 + (index % 4) * 2), 3, 97),
      y: clamp(50 + lane * (attacking ? 8 : 6), 18, 82),
      speed: 9,
      action: attacking ? "receive" : "press",
    };
  }

  if (situation.type === "throwIn") {
    if (dot.role === "GK") {
      return { x: ownGoalX(dot.team), y: 50, speed: 4, action: "move" };
    }
    const supportX = situation.x + (attacking ? dir : -dir) * (5 + (index % 3) * 3);
    return {
      x: clamp(supportX, 3, 97),
      y: clamp(situation.y + (lane * 5), 5, 95),
      speed: 8,
      action: attacking ? "receive" : "press",
    };
  }

  if (situation.type === "freeKick" || situation.type === "offside") {
    if (!attacking && dot.role === "GK") {
      return { x: defendingGoalX, y: 50, speed: 8, action: "save" };
    }
    if (dot.role === "GK") {
      return { x: ownGoalX(dot.team), y: 50, speed: 4, action: "move" };
    }
    const nearGoal = Math.abs(goalX - situation.x) < 30;
    if (!attacking && nearGoal && index % 3 !== 0) {
      return {
        x: clamp(situation.x + dir * 7, 3, 97),
        y: clamp(50 + lane * 3.2, 28, 72),
        speed: 9,
        action: "press",
      };
    }
    return {
      x: clamp(situation.x + dir * (attacking ? 8 + (index % 4) * 4 : 12), 3, 97),
      y: clamp(50 + lane * 8, 12, 88),
      speed: 8,
      action: attacking ? "receive" : "move",
    };
  }

  return {
    x: dot.hx + (situation.x - dot.hx) * 0.18,
    y: dot.hy + (situation.y - dot.hy) * 0.18,
    speed: 5,
    action: dot.team === situation.side ? "move" : "press",
  };
}

export function updateArenaMovement(
  state: ArenaState,
  intensities: readonly [LiveIntensity, LiveIntensity],
  dt: number,
) {
  const ballTeam: Team =
    state.ball.owner >= 0
      ? state.dots[state.ball.owner].team
      : state.ball.lastTeam;
  const defendingTeam: Team = ballTeam === 0 ? 1 : 0;
  const defendingIntensity = intensities[defendingTeam];
  const pressers = new Set<number>();
  const looseBall =
    state.ball.owner < 0 &&
    state.ball.flightTarget == null &&
    state.ball.flightTo < 0 &&
    !state.scoring &&
    !state.situation;
  const looseChasers = new Set<number>();
  if (looseBall) {
    ([0, 1] as const).forEach((team) => {
      const first = nearestIndex(state, team, state.ball.x, state.ball.y);
      if (first >= 0) looseChasers.add(first);
      const second = nearestIndex(state, team, state.ball.x, state.ball.y, looseChasers);
      if (second >= 0) looseChasers.add(second);
    });
  }
  const firstPresser = nearestIndex(
    state,
    defendingTeam,
    state.ball.x,
    state.ball.y,
  );
  if (firstPresser >= 0) pressers.add(firstPresser);
  if (defendingIntensity.attackPress >= 66) {
    const secondPresser = nearestIndex(
      state,
      defendingTeam,
      state.ball.x,
      state.ball.y,
      pressers,
    );
    if (secondPresser >= 0) pressers.add(secondPresser);
  }
  const offsideX = offsideLimit(state, ballTeam);

  state.dots.forEach((dot, index) => {
    dot.actionT = Math.max(0, dot.actionT - dt);
    const ownIntensity = intensities[dot.team];
    const dir = direction(dot.team);
    const widthScale = 0.64 + (ownIntensity.teamWidth / 100) * 0.72;
    const focusDirection = dot.team === 0 ? 1 : -1;
    const focusShift = ownIntensity.focus * focusDirection * 7;
    const shiftedHomeY =
      50 + (dot.hy - 50) * widthScale + focusShift;
    const tempoScale = 0.82 + ownIntensity.tempo / 240;
    const mentalityPush = (ownIntensity.mentality - 50) / 5.5;
    const directRun = (ownIntensity.directness - 50) / 6.5;
    let target: Target;

    const deadBallTarget = setPieceTarget(state, dot, index);
    if (deadBallTarget) {
      target = deadBallTarget;
    } else if (looseChasers.has(index)) {
      target = {
        x: state.ball.x,
        y: state.ball.y,
        speed: 11 * tempoScale,
        action: "press",
      };
    } else if (state.scoring && index === state.scoring.shooter) {
      target = {
        x: clamp(dot.x + dir * 5, 3, 97),
        y: dot.y,
        speed: 9 * tempoScale,
        action: "shoot",
      };
    } else if (
      state.ball.flightTarget?.owner === index ||
      state.ball.flightTarget?.chaser === index
    ) {
      target = {
        x: state.ball.flightTarget.x,
        y: state.ball.flightTarget.y,
        speed: 10 * tempoScale,
        action: "receive",
      };
    } else if (index === state.ball.owner) {
      const goalX = opponentGoalX(dot.team);
      const pressure = nearestIndex(
        state,
        dot.team === 0 ? 1 : 0,
        dot.x,
        dot.y,
      );
      const pressureY = pressure >= 0 ? state.dots[pressure].y : 50;
      const escapeY = clamp(dot.y + Math.sign(dot.y - pressureY || 1) * 5, 6, 94);
      target = {
        x: clamp(dot.x + dir * (dot.role === "GK" ? 2.5 : 8), 3, 97),
        y: dot.role === "GK" ? 50 + (state.ball.y - 50) * 0.08 : escapeY + (50 - escapeY) * 0.08,
        speed: (dot.role === "GK" ? 4 : 9.5) * tempoScale,
        action: dot.role === "GK" ? "move" : "dribble",
      };
      if (Math.abs(goalX - dot.x) < 8) target.y = 50;
    } else if (pressers.has(index)) {
      target = {
        x: state.ball.x - dir * 1.4,
        y: state.ball.y,
        speed: (9 + ownIntensity.attackPress / 35) * tempoScale,
        action: "press",
      };
    } else if (dot.team === ballTeam) {
      const canonicalBallProgress =
        dot.team === 0 ? state.ball.x : 100 - state.ball.x;
      const phasePush = clamp(
        (canonicalBallProgress - 28) * 0.18 + mentalityPush,
        -5,
        16,
      );
      const linePush =
        ownIntensity.attackPress / 14 +
        (ownIntensity.counter / 100) * Math.max(0, canonicalBallProgress - 45) * 0.08;
      if (dot.role === "GK") {
        target = {
          x: clamp(dot.hx + dir * Math.max(0, phasePush * 0.2), 3, 97),
          y: 50 + (state.ball.y - 50) * 0.06,
          speed: 3 * tempoScale,
          action: "move",
        };
      } else {
        const rolePush =
          dot.role === "FWD"
            ? 10 + phasePush + directRun
            : dot.role === "MID"
              ? 5 + phasePush * 0.7 + directRun * 0.35
              : 1.5 + phasePush * 0.35;
        const ballShift =
          dot.role === "FWD" ? 0.32 : dot.role === "MID" ? 0.22 : 0.12;
        let targetX = dot.hx + dir * (rolePush + linePush);
        if (dot.role === "FWD") {
          targetX =
            dot.team === 0
              ? Math.min(targetX, offsideX)
              : Math.max(targetX, offsideX);
        }
        target = {
          x: targetX,
          y: shiftedHomeY + (state.ball.y - shiftedHomeY) * ballShift,
          speed:
            (dot.role === "FWD" ? 8 : dot.role === "MID" ? 7 : 5.5) *
            tempoScale,
          action: "move",
        };
      }
    } else {
      const ownGoal = ownGoalX(dot.team);
      const compactness = 0.22 + ownIntensity.fluidDefense / 270;
      if (dot.role === "GK") {
        target = {
          x: dot.hx,
          y: clamp(50 + (state.ball.y - 50) * 0.18, 34, 66),
          speed: 4.5 * tempoScale,
          action: "move",
        };
      } else {
        const markerIndex = nearestOpponent(state, index);
        const marker = markerIndex >= 0 ? state.dots[markerIndex] : null;
        const roleDrop =
          dot.role === "DEF" ? 2 : dot.role === "MID" ? 5 : 8;
        const blockX =
          dot.hx - dir * roleDrop +
          (state.ball.x - dot.hx) * (dot.role === "FWD" ? 0.08 : 0.16) +
          dir * ((ownIntensity.defensiveLine - 50) / 5.5);
        const coverX = marker
          ? marker.x + (ownGoal - marker.x) * (dot.role === "DEF" ? 0.14 : 0.08)
          : blockX;
        const coverY = marker
          ? marker.y + (shiftedHomeY - marker.y) * 0.42
          : shiftedHomeY;
        target = {
          x: blockX * (1 - compactness) + coverX * compactness,
          y:
            (shiftedHomeY + (state.ball.y - shiftedHomeY) * 0.32) *
              (1 - compactness) +
            coverY * compactness,
          speed: (dot.role === "FWD" ? 6.5 : 7.2) * tempoScale,
          action: "move",
        };
      }
    }

    steer(
      dot,
      {
        ...target,
        x: clamp(target.x, 2, 98),
        y: clamp(target.y, 3, 97),
      },
      dt,
      state.clock,
    );
  });

  separatePlayers(state);
}
