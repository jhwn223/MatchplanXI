import type { MatchSide } from "./types";

export interface PitchPoint {
  x: number;
  y: number;
}

export function canonicalAttackX(side: MatchSide, x: number) {
  return side === "user" ? x : 100 - x;
}

export function isHalfSpaceY(y: number) {
  return (y >= 27 && y <= 42) || (y >= 58 && y <= 73);
}

export function isWideLaneY(y: number) {
  return y <= 22 || y >= 78;
}

/** A crossing lane is wide and already beyond the opposing midfield block. */
export function isCrossingZone(side: MatchSide, point: PitchPoint) {
  const x = canonicalAttackX(side, point.x);
  return x >= 70 && x <= 97 && isWideLaneY(point.y);
}

/**
 * A shot has to be both close enough and have a credible view of goal.
 * Wide players near the touchline need to reach the byline before a rare
 * near-post attempt is possible; from the same lane outside the box their
 * football action is a cross, cut-back or recycle rather than a shot.
 */
export function canAttemptOpenPlayShot(side: MatchSide, point: PitchPoint) {
  const x = canonicalAttackX(side, point.x);
  const lateral = Math.abs(point.y - 50);
  if (x < 77) return false;
  // From the chalk there is effectively no goal-facing angle. Even at the
  // byline this should become a cross or cut-back, not a speculative shot.
  if (lateral >= 32) return false;
  if (lateral >= 25) return x >= 88;
  return true;
}

/** Allows a promising central/half-space carrier to visibly drive to the box. */
export function canDevelopOpenPlayShot(side: MatchSide, point: PitchPoint) {
  const x = canonicalAttackX(side, point.x);
  const lateral = Math.abs(point.y - 50);
  if (lateral >= 32) return x >= 88;
  if (lateral >= 25) return x >= 78;
  return x >= 70;
}

export function shotTargetXForLane(y: number) {
  const lateral = Math.abs(y - 50);
  if (lateral >= 32) return 101;
  if (lateral >= 25) return 88;
  return 79;
}

/** Location-only share of chance quality. Ability and pressure are added later. */
export function shotLocationXg(side: MatchSide, point: PitchPoint, headed = false) {
  const x = canonicalAttackX(side, point.x);
  const distanceToGoal = Math.hypot(100 - x, point.y - 50);
  const lateral = Math.abs(point.y - 50);
  const proximity = Math.max(0, 1 - distanceToGoal / 34);
  const angle = Math.max(0.18, 1 - lateral / 42);
  const headerFactor = headed ? 0.78 : 1;
  return (0.018 + proximity * proximity * 0.25 * angle) * headerFactor;
}
