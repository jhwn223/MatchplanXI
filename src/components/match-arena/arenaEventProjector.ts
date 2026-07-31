import type { MatchEvent } from "../../data/matchSim";
import { displayArenaName } from "./names";
import { clamp } from "./runtimeMath";
import type { ArenaState } from "./runtimeTypes";

function eventPoint(event: MatchEvent, end = false) {
  return {
    x: clamp((end ? event.endX : event.x) ?? 50, 1, 99),
    y: clamp((end ? event.endY : event.y) ?? 50, -2, 102),
  };
}

function setAction(
  state: ArenaState,
  index: number,
  action: ArenaState["dots"][number]["action"],
  duration: number,
) {
  if (index < 0) return;
  state.dots[index].action = action;
  state.dots[index].actionT = duration;
}

function giveBallTo(state: ArenaState, owner: number) {
  if (owner < 0) return;
  const dot = state.dots[owner];
  state.ball.owner = owner;
  state.ball.x = dot.x;
  state.ball.y = dot.y;
  state.ball.flightTo = -1;
  state.ball.flightTarget = null;
  state.ball.lastTeam = dot.team;
  state.ball.scripted = false;
}

function startBallFlight(
  state: ArenaState,
  x: number,
  y: number,
  owner: number | null,
  speed = 54,
  chaser = owner,
) {
  const fromX = state.ball.x;
  const fromY = state.ball.y;
  const distance = Math.hypot(x - fromX, y - fromY);
  state.ball.owner = -1;
  state.ball.flightTo = -1;
  state.ball.flightTarget = {
    fromX,
    fromY,
    x,
    y,
    owner,
    chaser,
    elapsed: 0,
    duration: clamp(distance / speed, 0.14, 0.46),
  };
  state.ball.scripted = true;
}

function nearestTeamDot(
  state: ArenaState,
  side: 0 | 1,
  x: number,
  y: number,
) {
  let nearest = -1;
  let nearestDistance = Number.POSITIVE_INFINITY;
  state.dots.forEach((dot, index) => {
    if (dot.team !== side) return;
    const distance = Math.hypot(dot.x - x, dot.y - y);
    if (distance < nearestDistance) {
      nearest = index;
      nearestDistance = distance;
    }
  });
  return nearest;
}

function moveBallToOwner(state: ArenaState, owner: number, speed = 72) {
  if (owner < 0) return;
  const target = state.dots[owner];
  setAction(state, owner, "receive", 0.45);
  if (Math.hypot(target.x - state.ball.x, target.y - state.ball.y) <= 2.2) {
    giveBallTo(state, owner);
    return;
  }
  startBallFlight(state, target.x, target.y, owner, speed);
}

export function findEventDot(
  state: ArenaState,
  side: 0 | 1,
  name?: string,
  playerId?: number,
) {
  if (playerId != null) {
    const byId = state.dots.findIndex(
      (dot) => dot.team === side && dot.playerId === playerId,
    );
    if (byId >= 0) return byId;
  }
  if (!name) return -1;
  const exact = state.dots.findIndex((dot) => dot.team === side && dot.name === name);
  if (exact >= 0) return exact;
  return state.dots.findIndex(
    (dot) => dot.team === side && displayArenaName(dot.name) === displayArenaName(name),
  );
}

export function alignOpeningPossession(
  state: ArenaState,
  event: MatchEvent | undefined,
) {
  if (!event) return false;
  const side: 0 | 1 = event.side === "user" ? 0 : 1;
  const actor = findEventDot(state, side, event.actor, event.actorId);
  if (actor < 0) return false;
  const player = state.dots[actor];
  state.ball.owner = actor;
  state.ball.x = player.x;
  state.ball.y = player.y;
  state.ball.flightTo = -1;
  state.ball.flightTarget = null;
  state.ball.lastTeam = player.team;
  state.ball.scripted = false;
  state.scriptedRun = null;
  return true;
}

/**
 * Events are stored with integer match minutes. Spread events from the same
 * minute across that minute so passes, tackles and shots can actually be seen.
 */
export function eventPlaybackClock(events: MatchEvent[], index: number) {
  const event = events[index];
  if (!event) return Number.POSITIVE_INFINITY;
  if (event.timestamp != null) return event.timestamp;
  const sameMinute = events.filter((candidate) => candidate.minute === event.minute);
  const ordinal = events
    .slice(0, index + 1)
    .filter((candidate) => candidate.minute === event.minute).length;
  return event.minute - 1 + ordinal / (sameMinute.length + 1);
}

export function prepareEventActor(state: ArenaState, event: MatchEvent) {
  if (
    event.type !== "pass" &&
    event.type !== "dribble" &&
    event.type !== "shot"
  ) {
    return true;
  }
  const side: 0 | 1 = event.side === "user" ? 0 : 1;
  const actor = findEventDot(state, side, event.actor, event.actorId);
  if (actor < 0) return true;
  if (state.ball.owner !== actor) {
    if (state.ball.owner >= 0) {
      setAction(state, state.ball.owner, "pass", 0.3);
    }
    moveBallToOwner(state, actor);
    return false;
  }
  if (event.type === "dribble" || event.type === "shot") {
    const target = eventPoint(event, event.type === "dribble");
    if (Math.hypot(state.dots[actor].x - target.x, state.dots[actor].y - target.y) > 2.2) {
      state.scriptedRun = {
        actor,
        x: target.x,
        y: clamp(target.y, 3, 97),
        action: "dribble",
        elapsed: 0,
      };
      setAction(state, actor, "dribble", 0.7);
      return false;
    }
  }
  return true;
}

function startSituation(
  state: ArenaState,
  type: NonNullable<ArenaState["situation"]>["type"],
  side: 0 | 1,
  actor: number,
  point: { x: number; y: number },
) {
  const restartActor = actor;
  const duration =
    type === "penaltyKick"
      ? 2
      : type === "corner" || type === "freeKick"
        ? 1.8
        : 0.5;
  state.situation = {
    type,
    side,
    actor: restartActor,
    x: point.x,
    y: point.y,
    remaining: duration,
  };
  state.ball.owner = -1;
  state.ball.flightTo = -1;
  state.ball.flightTarget = {
    fromX: state.ball.x,
    fromY: state.ball.y,
    x: point.x,
    y: point.y,
    owner: null,
    chaser: restartActor >= 0 ? restartActor : null,
    elapsed: 0,
    duration: 0.24,
  };
  state.ball.scripted = true;
  if (restartActor >= 0) {
    state.ball.lastTeam = state.dots[restartActor].team;
  } else {
    state.ball.x = point.x;
    state.ball.y = point.y;
  }
}

export function projectMatchEvent(
  state: ArenaState,
  event: MatchEvent,
  startScoring: (
    state: ArenaState,
    side: 0 | 1,
    scorer?: string,
    assist?: string,
    scorerId?: number,
  ) => void,
) {
  const side: 0 | 1 = event.side === "user" ? 0 : 1;
  const actor = findEventDot(state, side, event.actor, event.actorId);
  const target = findEventDot(state, side, event.target, event.targetId);
  const defendingSide: 0 | 1 = side === 0 ? 1 : 0;

  if (event.type === "goal") {
    setAction(state, actor, "shoot", 0.6);
    startScoring(state, side, event.actor, event.target, event.actorId);
    return;
  }

  if (event.type === "pass" && actor >= 0) {
    // The match engine decides who passes and receives. The renderer uses the
    // players' current on-pitch positions so neither player teleports when the
    // pass begins, and freezes a straight destination for the whole flight.
    state.ball.x = state.dots[actor].x;
    state.ball.y = state.dots[actor].y;
    state.ball.lastTeam = side;
    setAction(state, actor, "pass", 0.38);
    const passSpeed =
      event.passType === "short"
        ? 44
        : event.passType === "through"
          ? 66
          : event.passType === "longBall" || event.passType === "cross"
            ? 72
            : 55;
    if (event.success && target >= 0) {
      const receiver = state.dots[target];
      setAction(state, target, "receive", 0.7);
      const leadSeconds =
        event.passType === "through"
          ? 0.55
          : event.passType === "longBall" || event.passType === "cross"
            ? 0.38
            : event.passType === "short"
              ? 0.08
              : 0.2;
      startBallFlight(
        state,
        clamp(receiver.x + receiver.vx * leadSeconds, 2, 98),
        clamp(receiver.y + receiver.vy * leadSeconds, 3, 97),
        target,
        passSpeed,
      );
    } else {
      const recordedStart = eventPoint(event);
      const recordedEnd = eventPoint(event, true);
      const failedX = clamp(
        state.ball.x + recordedEnd.x - recordedStart.x,
        1,
        99,
      );
      const exitedTouchline = recordedEnd.y <= 0 || recordedEnd.y >= 100;
      const failedY = exitedTouchline
        ? recordedEnd.y
        : clamp(state.ball.y + recordedEnd.y - recordedStart.y, 3, 97);
      const recoveringPlayer = nearestTeamDot(
        state,
        defendingSide,
        failedX,
        failedY,
      );
      if (recoveringPlayer >= 0) {
        const recoveryTarget = state.dots[recoveringPlayer];
        startBallFlight(
          state,
          recoveryTarget.x,
          recoveryTarget.y,
          recoveringPlayer,
          passSpeed,
        );
      } else {
        startBallFlight(state, failedX, failedY, null, passSpeed);
      }
    }
    return;
  }

  if (event.type === "dribble" && actor >= 0) {
    setAction(state, actor, "dribble", 0.75);
    giveBallTo(state, actor);
    return;
  }

  if (
    (event.type === "recovery" ||
      event.type === "interception" ||
      event.type === "tackle") &&
    actor >= 0
  ) {
    const visualActor =
      state.ball.owner >= 0 && state.dots[state.ball.owner].team === side
        ? state.ball.owner
        : nearestTeamDot(state, side, state.ball.x, state.ball.y);
    setAction(
      state,
      visualActor >= 0 ? visualActor : actor,
      event.type === "recovery" ? "receive" : "tackle",
      0.55,
    );
    if (state.ball.owner < 0 || state.dots[state.ball.owner].team !== side) {
      moveBallToOwner(state, visualActor >= 0 ? visualActor : actor);
    }
    return;
  }

  if (event.type === "shot" && actor >= 0) {
    setAction(state, actor, "shoot", 0.55);
    state.ball.owner = -1;
    state.ball.x = state.dots[actor].x;
    state.ball.y = state.dots[actor].y;
    state.ball.lastTeam = side;
    const end = eventPoint(event, true);
    const keeper = state.dots.findIndex(
      (dot) => dot.team === defendingSide && dot.role === "GK",
    );
    if (keeper >= 0) setAction(state, keeper, "save", 0.75);
    startBallFlight(state, end.x, end.y, null, 78, keeper >= 0 ? keeper : null);
    return;
  }

  if ((event.type === "save" || event.type === "block") && actor >= 0) {
    setAction(state, actor, event.type === "save" ? "save" : "tackle", 0.7);
    moveBallToOwner(state, actor, 78);
    return;
  }

  if (event.type === "miss") {
    const keeper = state.dots.findIndex(
      (dot) => dot.team === defendingSide && dot.role === "GK",
    );
    const end = eventPoint(event, true);
    state.ball.lastTeam = defendingSide;
    startBallFlight(state, end.x, end.y, keeper >= 0 ? keeper : null, 78);
    return;
  }

  if (event.type === "throwIn") {
    const restartActor = nearestTeamDot(
      state,
      side,
      state.ball.x,
      state.ball.y,
    );
    moveBallToOwner(state, restartActor >= 0 ? restartActor : actor);
    return;
  }

  if (
    event.type === "corner" ||
    event.type === "freeKick" ||
    event.type === "penaltyKick" ||
    event.type === "foul"
  ) {
    setAction(state, actor, event.type === "foul" ? "tackle" : "pass", 0.5);
    startSituation(state, event.type, side, actor, eventPoint(event));
    return;
  }

  if (event.type === "offside") {
    const point = eventPoint(event);
    const keeper = state.dots.findIndex(
      (dot) => dot.team === defendingSide && dot.role === "GK",
    );
    let restartActor = -1;
    let restartDistance = Number.POSITIVE_INFINITY;
    state.dots.forEach((dot, index) => {
      if (dot.team !== defendingSide || dot.role === "GK") return;
      const distance = Math.hypot(dot.x - point.x, dot.y - point.y);
      if (distance < restartDistance) {
        restartDistance = distance;
        restartActor = index;
      }
    });
    if (restartActor < 0) restartActor = keeper;
    startSituation(state, "offside", defendingSide, restartActor, point);
  }
}
