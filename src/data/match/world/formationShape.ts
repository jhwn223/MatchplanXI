import { clamp } from "../random";
import type { MatchPhase, WorldPoint } from "./types";

export type ShapeRole = "GK" | "DEF" | "MID" | "FWD";

export interface FormationShapeProfile {
  attackBias: number;
  pressBias: number;
  defensiveLineBias: number;
  widthBias: number;
  /** Pulls the front and midfield lines into the central lane. */
  centralFocusBias?: number;
  focusBias: number;
  /** Full-backs joining the attack. */
  overlapBias?: number;
  /** Direct play stretches the block; short passing keeps it compact. */
  directnessBias?: number;
  /** Urgency to get bodies past the ball once the team has it. */
  tempoBias?: number;
  /** Where the block starts pressing, independent of the back line. */
  engagementBias?: number;
  /** Positive squeezes the three lines together. */
  compactnessBias?: number;
  /** Positive keeps more players home while attacking. */
  restDefenseBias?: number;
}

export const BALANCED_SHAPE_PROFILE: FormationShapeProfile = {
  attackBias: 0,
  pressBias: 0,
  defensiveLineBias: 0,
  widthBias: 0,
  centralFocusBias: 0,
  focusBias: 0,
  overlapBias: 0,
  directnessBias: 0,
  tempoBias: 0,
  engagementBias: 0,
  compactnessBias: 0,
  restDefenseBias: 0,
};

interface FormationAnchorInput {
  direction: 1 | -1;
  role: ShapeRole;
  /** Position measured from this team's own goal toward the opponent goal. */
  baseX: number;
  /** Absolute lateral lane in the shared pitch coordinate system. */
  baseY: number;
  ball: WorldPoint;
  phase: MatchPhase;
  hasBall: boolean;
  profile?: FormationShapeProfile;
}

/**
 * Moves a formation as one elastic block while preserving every slot's
 * longitudinal layer and lateral lane. The ball translates the block; it does
 * not replace the formation as the player's destination.
 */
export function formationAnchor({
  direction,
  role,
  baseX,
  baseY,
  ball,
  phase,
  hasBall,
  profile = BALANCED_SHAPE_PROFILE,
}: FormationAnchorInput): WorldPoint {
  const canonicalBallX = direction === 1 ? ball.x : 100 - ball.x;
  const shiftGain =
    phase === "buildUp" ? 0.3 :
      phase === "transitionAttack" ? 0.46 :
        phase === "transitionDefense" ? 0.38 :
          phase === "finalThird" ? 0.42 :
            hasBall ? 0.4 : 0.34;
  const blockShift = clamp((canonicalBallX - 50) * shiftGain, -13, 13);
  const overlap = profile.overlapBias ?? 0;
  const directness = profile.directnessBias ?? 0;
  const tempo = profile.tempoBias ?? 0;
  const engagement = profile.engagementBias ?? 0;
  const compactness = profile.compactnessBias ?? 0;
  const restDefense = profile.restDefenseBias ?? 0;
  // Out of possession the whole block starts higher or drops off, which is
  // separate from how deep the back line itself defends.
  const engagementAdvance = hasBall ? 0 : engagement * (role === "FWD" ? 7 : role === "MID" ? 5 : 2);
  // Holding players back caps how far the rear lines join in with the ball.
  const restDefenseHold = hasBall ? Math.max(0, restDefense) * (role === "DEF" ? -5 : role === "MID" ? -2.5 : 0) : 0;
  // A wide defender is a full-back; overlap instructions send him forward and
  // wider once his team has the ball, which is the most visible of the
  // in-possession instructions.
  const isFullBack = role === "DEF" && Math.abs(baseY - 50) > 18;
  // An overlapping full-back only bombs on when the attack is down his side,
  // and the further the ball is up the pitch the higher he goes — that is the
  // whole point of the instruction. A flat forward nudge made the role look
  // like it did nothing.
  const onBallSide = isFullBack && Math.sign(baseY - 50) === Math.sign(ball.y - 50);
  const attackProgress = clamp((canonicalBallX - 45) / 45, 0, 1);
  const overlapAdvance = !isFullBack
    ? 0
    : hasBall
      ? Math.max(0, overlap) * (onBallSide ? 22 + attackProgress * 48 : 5) -
        Math.max(0, -overlap) * 3
      : 0;
  // Urgency pushes bodies beyond the ball; it only applies in possession.
  const tempoAdvance = hasBall ? (role === "MID" ? tempo * 2.4 : role === "FWD" ? tempo * 1.6 : 0) : 0;
  const roleAdvance =
    role === "GK"
      ? Math.max(0, profile.defensiveLineBias) * 2
      : role === "DEF"
        ? profile.defensiveLineBias * 5 + profile.pressBias * 1.2 + overlapAdvance + engagementAdvance + restDefenseHold
        : role === "MID"
          ? profile.attackBias * 2.2 + profile.pressBias * 1.4 + tempoAdvance + engagementAdvance + restDefenseHold
          : profile.attackBias * 3 + tempoAdvance + engagementAdvance;
  // Direct football stretches the side from back to front; a short passing
  // game squeezes the lines together to keep options close.
  // Compactness is the dedicated control for the gap between the lines;
  // directness stretches the side as a side effect of how it plays.
  const stretch = 1 + directness * 0.16 - compactness * 0.09;
  // The block concertinas, but it must not collapse into one line. Squeezing
  // every slot 20% towards halfway and then translating the whole shape with
  // the ball meant a striker stood in midfield whenever his side defended, so
  // a side fielding six forwards and no midfielders still had five bodies in
  // the middle third — measured, and all but identical to a normal 4-3-3.
  // Every formation converged on the same occupancy, which is exactly why the
  // manager's shape did not decide anything.
  const longitudinalScale =
    (role === "GK" ? 1 :
      phase === "transitionAttack" ? 0.92 :
        phase === "transitionDefense" ? 0.85 :
          phase === "finalThird" ? 0.87 :
            hasBall ? 0.92 : 0.86) * (role === "GK" ? 1 : stretch);
  const structuredBaseX =
    role === "GK" ? baseX : 50 + (baseX - 50) * longitudinalScale;
  const canonicalX = clamp(
    structuredBaseX + (role === "GK" ? blockShift * 0.08 : blockShift) + roleAdvance,
    role === "GK" ? 2 : 5,
    role === "GK" ? 18 : 95,
  );

  const widthBase = hasBall ? 0.96 : 0.8;
  const overlapWidth = hasBall && isFullBack ? Math.max(0, overlap) * 0.12 : 0;
  const centralFocus = clamp(profile.centralFocusBias ?? 0, 0, 1);
  const centralNarrowing = hasBall
    ? centralFocus * (role === "FWD" ? 0.3 : role === "MID" ? 0.25 : role === "DEF" ? 0.1 : 0)
    : centralFocus * (role === "FWD" || role === "MID" ? 0.08 : 0.04);
  const widthScale = clamp(
    widthBase + profile.widthBias * 0.2 + overlapWidth - centralNarrowing,
    0.5,
    1.26,
  );
  const ballShift = hasBall ? 0.14 : 0.2;
  // Attacking down one side has to be legible on a heat map, so the shift is
  // real and the players who actually move over — the front and middle lines —
  // shift furthest. A little of it survives out of possession as well.
  const focusStrength = role === "FWD" ? 14 : role === "MID" ? 11 : role === "DEF" ? 5 : 1;
  // Right/left is relative to the team's attacking direction. A side that
  // attacks the opposite goal therefore uses the opposite half of the shared
  // pitch for its own right flank.
  const focusShift = profile.focusBias * direction * focusStrength * (hasBall ? 1 : 0.35);
  const y = clamp(
    50 + (baseY - 50) * widthScale + (ball.y - 50) * ballShift + focusShift,
    4,
    96,
  );

  return {
    x: direction === 1 ? canonicalX : 100 - canonicalX,
    y,
  };
}

/** Keep an individual action inside the player's tactical responsibility. */
export function constrainToAnchor(
  anchor: WorldPoint,
  desired: WorldPoint,
  maxX: number,
  maxY: number,
): WorldPoint {
  const dx = desired.x - anchor.x;
  const dy = desired.y - anchor.y;
  const normalized = Math.hypot(dx / Math.max(0.1, maxX), dy / Math.max(0.1, maxY));
  if (normalized <= 1) {
    return { x: clamp(desired.x, 2, 98), y: clamp(desired.y, 3, 97) };
  }
  return {
    x: clamp(anchor.x + dx / normalized, 2, 98),
    y: clamp(anchor.y + dy / normalized, 3, 97),
  };
}

export function blendPoint(from: WorldPoint, to: WorldPoint, weight: number): WorldPoint {
  const amount = clamp(weight, 0, 1);
  return {
    x: from.x + (to.x - from.x) * amount,
    y: from.y + (to.y - from.y) * amount,
  };
}
