import { clamp } from "../random";
import type { MatchSide } from "../types";
import type { MatchWorld, WorldPlayerState, WorldPoint } from "./types";

/**
 * Where everybody stands for a restart.
 *
 * The engine resolved corners, free kicks and penalties as probabilities while
 * the twenty-two players carried on holding their open-play shape, so nothing
 * on the pitch ever looked like a set piece: no crowd in the box, no wall, the
 * taker not even at the ball. Measured over a full match it left every centre
 * back at exactly 0% of his time in the attacking third and every forward at
 * exactly 0% in his own — the two things a set piece is for.
 *
 * Positions are assigned from each player's rank in his own line so they stay
 * stable while the restart is being taken, rather than jittering as the sort
 * order changes.
 */

/** Distance from the attacking side's target goal, in pitch units. */
function towardGoal(side: MatchSide, depth: number) {
  return side === "user" ? 100 - depth : depth;
}

/** Everyone on the attacking side except the taker, in a stable order. */
function attackerRank(world: MatchWorld, state: WorldPlayerState, takerId: number) {
  let rank = 0;
  for (const other of world.players[state.side].values()) {
    if (other.player.position === "GK" || other.player.playerId === takerId) continue;
    if (other.player.playerId === state.player.playerId) return rank;
    rank++;
  }
  return rank;
}

function defenderRank(world: MatchWorld, state: WorldPlayerState) {
  let rank = 0;
  for (const other of world.players[state.side].values()) {
    if (other.player.position === "GK") continue;
    if (other.player.playerId === state.player.playerId) return rank;
    rank++;
  }
  return rank;
}

/**
 * A corner: eight or nine attackers in and around the box against everyone the
 * defending side has, with one attacker held back for the second ball.
 */
function cornerPoint(
  world: MatchWorld,
  state: WorldPlayerState,
  attackingSide: MatchSide,
  takerId: number,
): WorldPoint {
  const nearSide = world.ball.y < 50;
  if (state.side === attackingSide) {
    if (state.player.playerId === takerId) return { x: world.ball.x, y: world.ball.y };
    const rank = attackerRank(world, state, takerId);
    // Near post, penalty spot, far post, then the second wave on the edge.
    const spots: Array<[number, number]> = [
      [7, 38],
      [11, 50],
      [11, 62],
      [15, 44],
      [15, 57],
      [5, 30],
      [19, 50],
      [26, 40],
      [38, 55],
    ];
    const [depth, lane] = spots[Math.min(rank, spots.length - 1)];
    return {
      x: towardGoal(attackingSide, depth),
      // Lanes are written for a corner from the left; a corner from the right
      // is the same shape mirrored.
      y: clamp(nearSide ? lane : 100 - lane, 5, 95),
    };
  }
  // Defending: the keeper is handled by the caller, everyone else defends the
  // six-yard box and the penalty spot.
  const rank = defenderRank(world, state);
  const spots: Array<[number, number]> = [
    [5, 42],
    [5, 50],
    [5, 58],
    [9, 36],
    [9, 46],
    [9, 55],
    [9, 64],
    [14, 42],
    [14, 58],
    [20, 50],
  ];
  const [depth, lane] = spots[Math.min(rank, spots.length - 1)];
  return {
    x: towardGoal(attackingSide, depth),
    y: clamp(nearSide ? lane : 100 - lane, 5, 95),
  };
}

/**
 * A free kick. Close to goal it is played like a corner with a wall; further
 * out only the front line pushes up, which is what really happens.
 */
function freeKickPoint(
  world: MatchWorld,
  state: WorldPlayerState,
  attackingSide: MatchSide,
  takerId: number,
): WorldPoint | undefined {
  const ballDepth = attackingSide === "user" ? 100 - world.ball.x : world.ball.x;
  if (ballDepth > 36) return undefined;
  if (state.side === attackingSide) {
    if (state.player.playerId === takerId) {
      return {
        x: world.ball.x - (attackingSide === "user" ? 3 : -3),
        y: world.ball.y + (world.ball.y < 50 ? -2 : 2),
      };
    }
    const rank = attackerRank(world, state, takerId);
    const spots: Array<[number, number]> = [
      [7, 42],
      [7, 58],
      [11, 36],
      [11, 50],
      [11, 64],
      [17, 46],
      [24, 55],
      [34, 45],
      [46, 50],
    ];
    const [depth, lane] = spots[Math.min(rank, spots.length - 1)];
    return { x: towardGoal(attackingSide, depth), y: clamp(lane, 5, 95) };
  }
  const rank = defenderRank(world, state);
  // Four in the wall on the line between the ball and the goal, the rest
  // marking across the six-yard box.
  if (rank < 4) {
    const goalX = towardGoal(attackingSide, 0);
    const toGoalX = goalX - world.ball.x;
    const toGoalY = 50 - world.ball.y;
    const length = Math.max(1, Math.hypot(toGoalX, toGoalY));
    const wallDistance = 9.6;
    return {
      x: world.ball.x + (toGoalX / length) * wallDistance,
      y: clamp(world.ball.y + (toGoalY / length) * wallDistance + (rank - 1.5) * 1.9, 5, 95),
    };
  }
  const spots: Array<[number, number]> = [
    [4, 40],
    [4, 50],
    [4, 60],
    [8, 36],
    [8, 64],
    [13, 50],
  ];
  const [depth, lane] = spots[Math.min(rank - 4, spots.length - 1)];
  return { x: towardGoal(attackingSide, depth), y: clamp(lane, 5, 95) };
}

/** A penalty: the taker, the keeper, and everyone else outside the area. */
function penaltyPoint(
  world: MatchWorld,
  state: WorldPlayerState,
  attackingSide: MatchSide,
  takerId: number,
): WorldPoint {
  if (state.player.playerId === takerId) {
    return { x: towardGoal(attackingSide, 15), y: 50 };
  }
  const rank = state.side === attackingSide
    ? attackerRank(world, state, takerId)
    : defenderRank(world, state);
  const lane = state.side === attackingSide ? 34 + rank * 4 : 62 - rank * 4;
  return {
    x: towardGoal(attackingSide, 20 + (rank % 2) * 4),
    y: clamp(lane, 6, 94),
  };
}

/**
 * The restart position for one player, or undefined when the restart does not
 * rearrange him and the open-play shape should be used instead.
 */
export function setPieceTarget(
  world: MatchWorld,
  state: WorldPlayerState,
): WorldPoint | undefined {
  const restart = world.restart;
  if (!restart) return undefined;
  // Both keepers stay on their line; the attacking one has no business in the
  // box on any restart the engine models.
  if (state.player.position === "GK") return undefined;
  if (restart.kind === "corner") {
    return cornerPoint(world, state, restart.side, restart.takerId);
  }
  if (restart.kind === "penaltyKick") {
    return penaltyPoint(world, state, restart.side, restart.takerId);
  }
  return freeKickPoint(world, state, restart.side, restart.takerId);
}
