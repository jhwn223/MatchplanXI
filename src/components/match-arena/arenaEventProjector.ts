import type { MatchEvent } from "../../data/matchSim";
import { displayArenaName } from "./names";
import type { ArenaState } from "./runtimeTypes";

export function findEventDot(state: ArenaState, side: 0 | 1, name?: string) {
  if (!name) return -1;
  const exact = state.dots.findIndex((dot) => dot.team === side && dot.name === name);
  if (exact >= 0) return exact;
  return state.dots.findIndex(
    (dot) => dot.team === side && displayArenaName(dot.name) === displayArenaName(name)
  );
}

export function projectMatchEvent(
  state: ArenaState,
  event: MatchEvent,
  startScoring: (state: ArenaState, side: 0 | 1, scorer?: string, assist?: string) => void
) {
  const side: 0 | 1 = event.side === "user" ? 0 : 1;
  const actor = findEventDot(state, side, event.actor);
  const target = findEventDot(state, side, event.target);
  if (event.type === "goal") {
    startScoring(state, side, event.actor, event.target);
    return;
  }
  if (event.type === "pass" && actor >= 0 && target >= 0) {
    state.ball.owner = -1;
    state.ball.x = state.dots[actor].x;
    state.ball.y = state.dots[actor].y;
    state.ball.flightTo = target;
    state.ball.lastTeam = side;
    state.ball.scripted = true;
    return;
  }
  if (actor >= 0 && ["dribble", "interception", "tackle"].includes(event.type)) {
    state.ball.owner = actor;
    state.ball.flightTo = -1;
    state.ball.lastTeam = side;
    state.ball.scripted = false;
    return;
  }
  if (event.type === "shot" && actor >= 0) {
    state.ball.owner = actor;
    state.ball.flightTo = -1;
    state.ball.scripted = false;
    return;
  }
  if ((event.type === "save" || event.type === "block") && actor >= 0) {
    state.ball.owner = actor;
    state.ball.flightTo = -1;
    state.ball.lastTeam = side;
    state.ball.scripted = false;
    return;
  }
  if (event.type === "miss") {
    const keeperIndex = state.dots.findIndex((dot) => dot.team !== side && dot.role === "GK");
    if (keeperIndex >= 0) {
      state.ball.owner = keeperIndex;
      state.ball.flightTo = -1;
      state.ball.lastTeam = side === 0 ? 1 : 0;
      state.ball.scripted = false;
    }
  }
}
