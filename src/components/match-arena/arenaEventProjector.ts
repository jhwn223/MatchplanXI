import type { MatchEvent } from "../../data/matchSim";
import { displayArenaName } from "./names";
import { clamp } from "./runtimeMath";
import type { ArenaState } from "./runtimeTypes";

function eventPoint(event: MatchEvent, end = false) {
  return {
    x: clamp((end ? event.endX : event.x) ?? 50, 1, 99),
    y: clamp((end ? event.endY : event.y) ?? 50, 3, 97),
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

function claimLooseBall(state: ArenaState, owner: number) {
  if (owner < 0) return;
  const player = state.dots[owner];
  const distance = Math.hypot(player.x - state.ball.x, player.y - state.ball.y);
  state.ball.owner = -1;
  state.ball.flightTo = -1;
  state.ball.flightTarget = {
    fromX: state.ball.x,
    fromY: state.ball.y,
    x: state.ball.x,
    y: state.ball.y,
    owner,
    chaser: owner,
    elapsed: 0,
    duration: clamp(distance / 24, 0.12, 0.5),
  };
  state.ball.scripted = true;
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
  if (actor < 0 || state.ball.owner === actor) return true;
  setAction(state, actor, "receive", 0.7);
  claimLooseBall(state, actor);
  return false;
}

function startSituation(
  state: ArenaState,
  type: NonNullable<ArenaState["situation"]>["type"],
  side: 0 | 1,
  actor: number,
  point: { x: number; y: number },
) {
  const duration =
    type === "penaltyKick"
      ? 1.25
      : type === "corner" || type === "freeKick"
        ? 0.9
        : type === "throwIn"
          ? 0.7
          : 0.5;
  state.situation = {
    type,
    side,
    actor,
    x: point.x,
    y: point.y,
    remaining: duration,
  };
  state.ball.owner = actor;
  state.ball.flightTo = -1;
  state.ball.flightTarget = null;
  state.ball.scripted = false;
  if (actor >= 0) {
    state.ball.lastTeam = state.dots[actor].team;
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
      const failedY = clamp(
        state.ball.y + recordedEnd.y - recordedStart.y,
        3,
        97,
      );
      startBallFlight(state, failedX, failedY, null, passSpeed);
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
    setAction(
      state,
      actor,
      event.type === "recovery" ? "receive" : "tackle",
      0.55,
    );
    claimLooseBall(state, actor);
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
    claimLooseBall(state, actor);
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

  if (
    event.type === "corner" ||
    event.type === "freeKick" ||
    event.type === "throwIn" ||
    event.type === "penaltyKick" ||
    event.type === "foul"
  ) {
    setAction(state, actor, event.type === "foul" ? "tackle" : "pass", 0.5);
    startSituation(state, event.type, side, actor, eventPoint(event));
    return;
  }

  if (event.type === "offside") {
    const keeper = state.dots.findIndex(
      (dot) => dot.team === defendingSide && dot.role === "GK",
    );
    if (keeper >= 0) claimLooseBall(state, keeper);
    startSituation(state, "offside", defendingSide, keeper, eventPoint(event));
  }
}
