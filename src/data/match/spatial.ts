import { clamp } from "./random";
import type {
  MatchSide,
  PlacedPlayerLite,
  PositionSample,
  SimTacticProfile,
} from "./types";

export interface PitchPoint {
  x: number;
  y: number;
}

function stableUnit(seed: string, salt: number) {
  let hash = 2166136261 ^ salt;
  for (let index = 0; index < seed.length; index++) {
    hash = Math.imul(hash ^ seed.charCodeAt(index), 16777619);
  }
  return ((hash >>> 0) % 10_000) / 10_000;
}

/**
 * Returns the player's tactical home in the shared match coordinate system.
 * User attacks left-to-right; opponent coordinates are mirrored.
 */
export function tacticalHome(
  player: PlacedPlayerLite,
  side: MatchSide,
  tactics: SimTacticProfile,
): PitchPoint {
  const widthScale = 1 + tactics.widthBias * 0.28;
  const focusShift = tactics.focusBias * 7;
  const roleAdvance =
    player.position === "GK"
      ? Math.max(0, tactics.defensiveLineBias) * 2
      : player.position === "DEF"
        ? tactics.defensiveLineBias * 9 + tactics.pressBias * 2
        : player.position === "MID"
          ? tactics.attackBias * 4 + tactics.pressBias * 2.5
          : tactics.attackBias * 5 - Math.max(0, tactics.directnessBias) * 1.5;
  const canonicalX = clamp(player.baseX + roleAdvance, player.position === "GK" ? 2 : 7, player.position === "GK" ? 18 : 94);
  const canonicalY = clamp(50 + (player.baseY - 50) * widthScale + focusShift, 4, 96);
  return {
    x: side === "user" ? canonicalX : 100 - canonicalX,
    y: canonicalY,
  };
}

export function tacticalDistance(
  a: PlacedPlayerLite,
  aSide: MatchSide,
  aTactics: SimTacticProfile,
  b: PlacedPlayerLite,
  bSide: MatchSide,
  bTactics: SimTacticProfile,
) {
  const first = tacticalHome(a, aSide, aTactics);
  const second = tacticalHome(b, bSide, bTactics);
  return Math.hypot(first.x - second.x, first.y - second.y);
}

export function samplePlayerPositions(
  minute: number,
  side: MatchSide,
  players: PlacedPlayerLite[],
  tactics: SimTacticProfile,
): PositionSample[] {
  return players.map((player) => {
    const home = tacticalHome(player, side, tactics);
    const seed = `${minute}:${side}:${player.playerId}`;
    const movementRadius =
      player.position === "GK" ? 2.2 :
        player.position === "DEF" ? 5.5 :
          player.position === "MID" ? 8 :
            7;
    const tempo = 1 + Math.max(0, tactics.tempoBias) * 0.2;
    return {
      minute,
      side,
      playerId: player.playerId,
      playerName: player.name,
      x: clamp(home.x + (stableUnit(seed, 17) - 0.5) * movementRadius * tempo, 1, 99),
      y: clamp(home.y + (stableUnit(seed, 43) - 0.5) * movementRadius * tempo, 2, 98),
    };
  });
}
