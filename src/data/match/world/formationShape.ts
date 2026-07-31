import { clamp } from "../random";
import type { MatchPhase, WorldPoint } from "./types";

export type ShapeRole = "GK" | "DEF" | "MID" | "FWD";

export interface FormationShapeProfile {
  attackBias: number;
  pressBias: number;
  defensiveLineBias: number;
  widthBias: number;
  focusBias: number;
}

export const BALANCED_SHAPE_PROFILE: FormationShapeProfile = {
  attackBias: 0,
  pressBias: 0,
  defensiveLineBias: 0,
  widthBias: 0,
  focusBias: 0,
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
    phase === "buildUp" ? 0.38 :
      phase === "transitionAttack" ? 0.62 :
        phase === "transitionDefense" ? 0.5 :
          phase === "finalThird" ? 0.58 :
            hasBall ? 0.54 : 0.46;
  const blockShift = clamp((canonicalBallX - 50) * shiftGain, -18, 18);
  const roleAdvance =
    role === "GK"
      ? Math.max(0, profile.defensiveLineBias) * 2
      : role === "DEF"
        ? profile.defensiveLineBias * 5 + profile.pressBias * 1.2
        : role === "MID"
          ? profile.attackBias * 2.2 + profile.pressBias * 1.4
          : profile.attackBias * 3;
  const longitudinalScale =
    role === "GK" ? 1 :
      phase === "transitionAttack" ? 0.9 :
        phase === "transitionDefense" ? 0.8 :
          hasBall ? 0.86 : 0.78;
  const structuredBaseX =
    role === "GK" ? baseX : 50 + (baseX - 50) * longitudinalScale;
  const canonicalX = clamp(
    structuredBaseX + (role === "GK" ? blockShift * 0.08 : blockShift) + roleAdvance,
    role === "GK" ? 2 : 5,
    role === "GK" ? 18 : 95,
  );

  const widthBase = hasBall ? 0.96 : 0.8;
  const widthScale = clamp(widthBase + profile.widthBias * 0.2, 0.62, 1.18);
  const ballShift = hasBall ? 0.14 : 0.2;
  const focusShift = hasBall ? profile.focusBias * 3.5 : 0;
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
