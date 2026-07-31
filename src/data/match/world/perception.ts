import { clamp } from "../random";
import type { MatchSide, PlacedPlayerLite } from "../types";
import type { MatchWorld, WorldPlayerState } from "./types";

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
  return Math.hypot(first.x - second.x, first.y - second.y);
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
    nearest = Math.min(nearest, Math.hypot(state.x - opponent.x, state.y - opponent.y));
  }
  return nearest;
}

/** The furthest legal receiving line: the ball or the second-last opponent. */
export function offsideLineFor(world: MatchWorld, attackingSide: MatchSide) {
  const defendingSide = attackingSide === "user" ? "opp" : "user";
  const defenderX = [...world.players[defendingSide].values()]
    .map((state) => state.x)
    .sort((a, b) => a - b);
  if (defenderX.length < 2) return attackingSide === "user" ? 96 : 4;
  if (attackingSide === "user") {
    const secondLastOpponent = defenderX[defenderX.length - 2];
    return Math.max(world.ball.x, secondLastOpponent);
  }
  const secondLastOpponent = defenderX[1];
  return Math.min(world.ball.x, secondLastOpponent);
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
    const distance = Math.hypot(point.x - laneX, point.y - laneY);
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
) {
  const start = worldPlayer(world, side, passer);
  const end = worldPlayer(world, side, receiver);
  if (!start || !end) return 0.01;
  const direction = side === "user" ? 1 : -1;
  const forwardDistance = (end.x - start.x) * direction;
  const distance = Math.hypot(end.x - start.x, end.y - start.y);
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
  return Math.max(0.01, roleWeight * intelligence * distanceFit * space * forwardFit);
}

