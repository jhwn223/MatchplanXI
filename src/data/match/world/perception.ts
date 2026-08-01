import { clamp } from "../random";
import type { MatchSide, PlacedPlayerLite } from "../types";
import type { MatchWorld, WorldPlayerState } from "./types";

/**
 * Scores how well a lateral lane matches the selected attacking side.
 *
 * `focusBias` is expressed from the team's point of view: -1 is its left
 * flank and +1 is its right flank. Because the two teams attack in opposite
 * directions, their right flanks are opposite sides of the shared pitch.
 */
export function attackFocusLaneWeight(
  y: number,
  focusBias: number,
  attackDirection: 1 | -1,
  centralFocusBias = 0,
) {
  const focus = clamp(focusBias, -1, 1);
  const lane = clamp((y - 50) / 42, -1, 1);
  const alignment = lane * focus * attackDirection;
  const centralFocus = clamp(centralFocusBias, 0, 1);
  const centrality = 1 - Math.abs(lane);
  const flankWeight = alignment * Math.abs(focus) * 0.68;
  const centralWeight = centralFocus * (centrality * 0.7 - (1 - centrality) * 0.55);
  return clamp(1 + flankWeight + centralWeight, 0.36, 1.7);
}

/** The visible centre of the flank a focused attack is trying to occupy. */
export function attackFocusLaneY(
  focusBias: number,
  attackDirection: 1 | -1,
) {
  return 50 + clamp(focusBias, -1, 1) * attackDirection * 27;
}

/**
 * Pitch coordinates stay far inside the range where Math.hypot's overflow
 * guarding earns its cost, and these run on every simulation tick.
 */
function pointDistance(ax: number, ay: number, bx: number, by: number) {
  const dx = ax - bx;
  const dy = ay - by;
  return Math.sqrt(dx * dx + dy * dy);
}

export function worldPlayer(
  world: MatchWorld,
  side: MatchSide,
  player: PlacedPlayerLite,
): WorldPlayerState | undefined {
  return world.players[side].get(player.playerId);
}

export function worldDistance(
  world: MatchWorld,
  aSide: MatchSide,
  a: PlacedPlayerLite,
  bSide: MatchSide,
  b: PlacedPlayerLite,
) {
  const first = worldPlayer(world, aSide, a);
  const second = worldPlayer(world, bSide, b);
  if (!first || !second) return 100;
  return pointDistance(first.x, first.y, second.x, second.y);
}

export function nearestOpponentDistance(
  world: MatchWorld,
  side: MatchSide,
  player: PlacedPlayerLite,
): number {
  const state = worldPlayer(world, side, player);
  if (!state) return 100;
  const opponentSide = side === "user" ? "opp" : "user";
  let nearest = 100;
  for (const opponent of world.players[opponentSide].values()) {
    if (opponent.player.position === "GK") continue;
    nearest = Math.min(nearest, pointDistance(state.x, state.y, opponent.x, opponent.y));
  }
  return nearest;
}

/**
 * The furthest legal receiving line: the ball or the second-last opponent.
 * Runs on every simulation tick, so it scans for the two extreme defenders
 * rather than sorting the whole defence.
 */
export function offsideLineFor(world: MatchWorld, attackingSide: MatchSide) {
  const defendingSide = attackingSide === "user" ? "opp" : "user";
  const attackingRight = attackingSide === "user";
  let count = 0;
  let deepest = attackingRight ? -Infinity : Infinity;
  let secondDeepest = deepest;
  for (const state of world.players[defendingSide].values()) {
    count++;
    if (attackingRight ? state.x > deepest : state.x < deepest) {
      secondDeepest = deepest;
      deepest = state.x;
    } else if (attackingRight ? state.x > secondDeepest : state.x < secondDeepest) {
      secondDeepest = state.x;
    }
  }
  if (count < 2) return attackingRight ? 96 : 4;
  return attackingRight
    ? Math.max(world.ball.x, secondDeepest)
    : Math.min(world.ball.x, secondDeepest);
}

export function isPlayerOffside(
  world: MatchWorld,
  attackingSide: MatchSide,
  receiver: PlacedPlayerLite,
) {
  const state = worldPlayer(world, attackingSide, receiver);
  if (!state) return false;
  const line = offsideLineFor(world, attackingSide);
  if (attackingSide === "user") {
    return state.x > 50 && state.x > world.ball.x + 0.25 && state.x > line + 0.25;
  }
  return state.x < 50 && state.x < world.ball.x - 0.25 && state.x < line - 0.25;
}

export function worldPassLanePressure(
  world: MatchWorld,
  passerSide: MatchSide,
  passer: PlacedPlayerLite,
  receiver: PlacedPlayerLite,
  defenders: PlacedPlayerLite[],
): number {
  const start = worldPlayer(world, passerSide, passer);
  const end = worldPlayer(world, passerSide, receiver);
  if (!start || !end) return 0;
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSquared = Math.max(1, dx * dx + dy * dy);
  const defendingSide = passerSide === "user" ? "opp" : "user";

  return defenders.reduce((pressure, defender) => {
    const point = worldPlayer(world, defendingSide, defender);
    if (!point) return pressure;
    const projection = clamp(
      ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared,
      0,
      1,
    );
    if (projection <= 0.06 || projection >= 0.97) return pressure;
    const laneX = start.x + dx * projection;
    const laneY = start.y + dy * projection;
    const distance = pointDistance(point.x, point.y, laneX, laneY);
    const reach =
      3.4 +
      defender.interceptions / 48 +
      defender.reactions / 65;
    if (distance >= reach) return pressure;
    return pressure + (1 - distance / reach) * (0.5 + defender.interceptions / 170);
  }, 0);
}

export function passOptionScore(
  world: MatchWorld,
  side: MatchSide,
  passer: PlacedPlayerLite,
  receiver: PlacedPlayerLite,
  directness: number,
  focusBias = 0,
  centralFocusBias = 0,
) {
  const start = worldPlayer(world, side, passer);
  const end = worldPlayer(world, side, receiver);
  if (!start || !end) return 0.01;
  const direction = side === "user" ? 1 : -1;
  const forwardDistance = (end.x - start.x) * direction;
  const distance = pointDistance(end.x, end.y, start.x, start.y);
  const idealDistance = directness > 0.35 ? 30 : directness < -0.35 ? 14 : 21;
  const distanceFit = 1 / (1 + Math.abs(distance - idealDistance) / 13);
  const space = clamp(nearestOpponentDistance(world, side, receiver) / 12, 0.25, 1.4);
  const forwardFit = clamp(1 + forwardDistance * directness / 50, 0.4, 1.9);
  const roleWeight =
    receiver.position === "GK" ? 0.18 :
      receiver.position === "MID" ? 2.2 :
        receiver.position === "DEF" ? 1.45 : 1.7;
  const intelligence =
    0.5 + (receiver.positioning + receiver.reactions + receiver.ballControl) / 270;
  const focusFit = attackFocusLaneWeight(
    end.y,
    focusBias,
    direction,
    centralFocusBias,
  );
  return Math.max(0.01, roleWeight * intelligence * distanceFit * space * forwardFit * focusFit);
}

