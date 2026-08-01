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

/**
 * How many outfield defenders are home in their own third.
 *
 * This is the quantity real defending is built on, and the engine had no
 * notion of it: every duel was resolved against a single picked opponent, so
 * fielding no defenders at all cost a side nothing. A crowded box is why
 * camping strikers in it creates nothing, and an empty one is why a side that
 * leaves nobody home concedes whenever the ball arrives.
 */
export function defensiveThirdCover(world: MatchWorld, defendingSide: MatchSide) {
  const goalX = defendingSide === "user" ? 0 : 100;
  let count = 0;
  for (const state of world.players[defendingSide].values()) {
    if (state.player.position === "GK") continue;
    if (Math.abs(state.x - goalX) <= 33) count++;
  }
  return count;
}

/**
 * Outfield bodies each side has within `radius` of a point on the pitch.
 *
 * Football is decided by numbers around the ball far more than by any single
 * duel, and this is the quantity the engine was missing: every contest was
 * resolved one-against-one with a defender picked by weight, so a side that
 * left an entire line of the pitch unmanned was never actually outnumbered
 * there. Counting bodies is what makes an empty midfield cost possession.
 */
export function localNumbers(
  world: MatchWorld,
  side: MatchSide,
  x: number,
  y: number,
  radius: number,
): { own: number; opponents: number } {
  const opponentSide = side === "user" ? "opp" : "user";
  const limit = radius * radius;
  let own = 0;
  let opponents = 0;
  for (const state of world.players[side].values()) {
    if (state.player.position === "GK") continue;
    const dx = state.x - x;
    const dy = state.y - y;
    if (dx * dx + dy * dy <= limit) own++;
  }
  for (const state of world.players[opponentSide].values()) {
    if (state.player.position === "GK") continue;
    const dx = state.x - x;
    const dy = state.y - y;
    if (dx * dx + dy * dy <= limit) opponents++;
  }
  return { own, opponents };
}

/**
 * How badly the side in possession is outnumbered around the ball. Negative
 * when it has the extra bodies.
 */
export function localPressure(
  world: MatchWorld,
  side: MatchSide,
  x: number,
  y: number,
  radius = 20,
) {
  const { own, opponents } = localNumbers(world, side, x, y, radius);
  return clamp((opponents - own) / 3, -1, 1.8);
}

/**
 * How far up the pitch a side holds its last line, measured from its own goal.
 *
 * Deliberately independent of the ball: `offsideLineFor` clamps to the ball
 * because that is how the offside law works, but it means that once the ball
 * is played forward the "line" reads as the ball's position rather than the
 * defence's. Judging how exposed a defence is needs the defenders alone.
 */
export function defensiveLineHeight(world: MatchWorld, defendingSide: MatchSide) {
  const defendsRight = defendingSide === "opp";
  let deepest = defendsRight ? -Infinity : Infinity;
  let secondDeepest = deepest;
  let count = 0;
  for (const state of world.players[defendingSide].values()) {
    count++;
    if (defendsRight ? state.x > deepest : state.x < deepest) {
      secondDeepest = deepest;
      deepest = state.x;
    } else if (defendsRight ? state.x > secondDeepest : state.x < secondDeepest) {
      secondDeepest = state.x;
    }
  }
  if (count < 2) return 50;
  return defendsRight ? 100 - secondDeepest : secondDeepest;
}

/**
 * How far beyond the last defender a receiver stands; negative when onside.
 *
 * The engine models players by where their shape puts them, not by runs they
 * time, so a side that pushes its whole team upfield leaves the opposition
 * forwards permanently and hopelessly "offside" — a static artefact rather
 * than an offence. The margin is what lets the caller tell a genuine run being
 * timed against the last man from a forward standing in acres of space who
 * would simply have stepped back onside.
 */
export function offsideMargin(
  world: MatchWorld,
  attackingSide: MatchSide,
  receiver: PlacedPlayerLite,
): number {
  const state = worldPlayer(world, attackingSide, receiver);
  if (!state) return -100;
  const line = offsideLineFor(world, attackingSide);
  return attackingSide === "user"
    ? state.x - Math.max(line, world.ball.x)
    : Math.min(line, world.ball.x) - state.x;
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
  // Every side wants to play forwards; directness only says how insistently.
  // Scaling purely by `directness` left a balanced team with no forward intent
  // at all — square and backward balls scored exactly the same as a ball
  // played up the pitch — and a short-passing side actively preferred to
  // retreat.
  const forwardFit = clamp(1 + forwardDistance * (0.5 + directness) / 50, 0.4, 1.9);
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

