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
  /** How far the full-backs run beyond the ball on their own flank. */
  fullbackPushBias?: number;
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
  /**
   * How far the assigned player role pushes him up the pitch and how wide it
   * asks him to sit. Roles reached the event model but never the shape, so on
   * the pitch — and in the replay — an inverted full-back stood exactly where
   * an overlapping one did.
   */
  roleAdvanceBonus?: number;
  roleWidthScale?: number;
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
  roleAdvanceBonus = 0,
  roleWidthScale = 1,
  profile = BALANCED_SHAPE_PROFILE,
}: FormationAnchorInput): WorldPoint {
  const canonicalBallX = direction === 1 ? ball.x : 100 - ball.x;
  const shiftGain =
    phase === "buildUp" ? 0.36 :
      phase === "transitionAttack" ? 0.54 :
        phase === "transitionDefense" ? 0.46 :
          phase === "finalThird" ? 0.5 :
            hasBall ? 0.48 : 0.42;
  // How far the whole block travels between its deepest and its highest
  // position. At +-13 it moved 26 units end to end where a real side covers
  // 35-40 m of a 105 m pitch, and the clamp was binding for most of any spell
  // in the final third — which is why every player's longitudinal spread came
  // out at about half of a real one and the three lines never overlapped.
  const blockShift = clamp((canonicalBallX - 50) * shiftGain, -18, 18);
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
      ? Math.max(0, overlap) * (onBallSide ? 8 : 4) - Math.max(0, -overlap) * 3
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
  const assignedAdvance = role === "GK" ? 0 : roleAdvanceBonus;
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
  const linePosition = clamp(
    structuredBaseX + (role === "GK" ? blockShift * 0.08 : blockShift) + roleAdvance + assignedAdvance,
    role === "GK" ? 2 : 5,
    role === "GK" ? 18 : 95,
  );
  // An overlapping full-back is a run past the ball, not a defender nudged a
  // few metres up his line. Expressing it as an offset on the back four meant
  // he never once reached the final third in a whole match while the winger
  // ahead of him was getting to the byline. Once the attack is down his side
  // he leaves the line entirely and goes beyond it.
  const fullbackPush = clamp(profile.fullbackPushBias ?? 0, -1, 1);
  const overlapRun =
    isFullBack && hasBall && onBallSide && fullbackPush > 0
      ? clamp(fullbackPush * (0.6 + attackProgress * 1.05), 0, 0.95)
      : 0;
  const bylineTarget = Math.min(93, canonicalBallX + 9);
  const canonicalX =
    overlapRun > 0 && bylineTarget > linePosition
      ? linePosition + (bylineTarget - linePosition) * overlapRun
      : linePosition;

  const widthBase = hasBall ? 0.96 : 0.8;
  // A full-back holds the touchline, and holds it hardest while he is running
  // past the ball — that is where the width for a cross comes from.
  const overlapWidth = !isFullBack || !hasBall
    ? 0
    : Math.max(0, overlap) * 0.1 + overlapRun * 0.22;
  const centralFocus = clamp(profile.centralFocusBias ?? 0, 0, 1);
  const centralNarrowing = hasBall
    ? centralFocus * (role === "FWD" ? 0.3 : role === "MID" ? 0.25 : role === "DEF" ? 0.1 : 0)
    : centralFocus * (role === "FWD" || role === "MID" ? 0.08 : 0.04);
  const widthScale = clamp(
    (widthBase + profile.widthBias * 0.2 + overlapWidth - centralNarrowing) *
      (role === "GK" ? 1 : roleWidthScale),
    0.42,
    1.45,
  );
  // The block slides across to the ball's side of the pitch. A real side shifts
  // 10-15 m of its 68 m width; at 0.2 it managed barely half that, so nobody
  // ever left his lane and every heat map came out as a column.
  const ballShift = hasBall ? 0.22 : 0.32;
  // Attacking down one side has to be legible on a heat map, so the shift is
  // real and the players who actually move over — the front and middle lines —
  // shift furthest. A little of it survives out of possession as well.
  const focusStrength = role === "FWD" ? 19 : role === "MID" ? 14 : role === "DEF" ? 6 : 1;
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
