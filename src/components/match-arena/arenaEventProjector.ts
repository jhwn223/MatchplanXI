import type { MatchEvent } from "../../data/matchSim";
import { displayArenaName } from "./names";
import { clamp, lerp } from "./runtimeMath";
import type { ArenaState } from "./runtimeTypes";

function eventPoint(event: MatchEvent, end = false) {
  return {
    x: clamp((end ? event.endX : event.x) ?? 50, 1, 99),
    y: clamp((end ? event.endY : event.y) ?? 50, 3, 97),
  };
}

function placeDotNearEvent(state: ArenaState, index: number, event: MatchEvent, end = false) {
  if (index < 0) return;
  const point = eventPoint(event, end);
  const dot = state.dots[index];
  dot.x = lerp(dot.x, point.x, 0.72);
  dot.y = lerp(dot.y, point.y, 0.72);
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
    elapsed: 0,
    duration: clamp(distance / speed, 0.28, 0.9),
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
  const sameMinute = events.filter((candidate) => candidate.minute === event.minute);
  const ordinal = events
    .slice(0, index + 1)
    .filter((candidate) => candidate.minute === event.minute).length;
  return event.minute - 1 + ordinal / (sameMinute.length + 1);
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
    placeDotNearEvent(state, actor, event);
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
    if (event.success && target >= 0) {
      const receiver = state.dots[target];
      startBallFlight(state, receiver.x, receiver.y, target);
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
      startBallFlight(state, failedX, failedY, null);
    }
    return;
  }

  if (event.type === "dribble" && actor >= 0) {
    placeDotNearEvent(state, actor, event, true);
    giveBallTo(state, actor);
    return;
  }

  if ((event.type === "interception" || event.type === "tackle") && actor >= 0) {
    placeDotNearEvent(state, actor, event);
    giveBallTo(state, actor);
    return;
  }

  if (event.type === "shot" && actor >= 0) {
    placeDotNearEvent(state, actor, event);
    state.ball.owner = -1;
    state.ball.x = state.dots[actor].x;
    state.ball.y = state.dots[actor].y;
    state.ball.lastTeam = side;
    const end = eventPoint(event, true);
    startBallFlight(state, end.x, end.y, null, 78);
    return;
  }

  if ((event.type === "save" || event.type === "block") && actor >= 0) {
    placeDotNearEvent(state, actor, event);
    giveBallTo(state, actor);
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

  if (event.type === "corner" || event.type === "freeKick" || event.type === "foul") {
    placeDotNearEvent(state, actor, event);
    giveBallTo(state, actor);
    return;
  }

  if (event.type === "offside") {
    const keeper = state.dots.findIndex(
      (dot) => dot.team === defendingSide && dot.role === "GK",
    );
    if (keeper >= 0) giveBallTo(state, keeper);
  }
}
