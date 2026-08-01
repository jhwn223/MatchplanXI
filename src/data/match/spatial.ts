import { clamp } from "./random";
import type {
  MatchSide,
  PlacedPlayerLite,
  PositionSample,
  SimTacticProfile,
} from "./types";
import { roleDefinition } from "../playerRoles";

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
  const widthScale = (1 + tactics.widthBias * 0.28) * (1 - tactics.centralFocusBias * 0.22);
  const focusShift = tactics.focusBias * (side === "user" ? 1 : -1) * 7;
  const assignedRole = roleDefinition(player.tacticalRole);
  const roleAdvance =
    player.position === "GK"
      ? Math.max(0, tactics.defensiveLineBias) * 2
      : player.position === "DEF"
        ? tactics.defensiveLineBias * 9 + tactics.pressBias * 2
        : player.position === "MID"
          ? tactics.attackBias * 4 + tactics.pressBias * 2.5
          : tactics.attackBias * 5 - Math.max(0, tactics.directnessBias) * 1.5;
  const canonicalX = clamp(
    player.baseX + roleAdvance + assignedRole.advance,
    player.position === "GK" ? 2 : 7,
    player.position === "GK" ? 22 : 94,
  );
  const canonicalY = clamp(
    50 + (player.baseY - 50) * widthScale * assignedRole.widthScale + focusShift,
    4,
    96,
  );
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

export function passLanePressure(
  passer: PlacedPlayerLite,
  receiver: PlacedPlayerLite,
  attackingSide: MatchSide,
  attackingTactics: SimTacticProfile,
  defenders: PlacedPlayerLite[],
  defendingSide: MatchSide,
  defendingTactics: SimTacticProfile,
) {
  const start = tacticalHome(passer, attackingSide, attackingTactics);
  const end = tacticalHome(receiver, attackingSide, attackingTactics);
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSquared = Math.max(1, dx * dx + dy * dy);

  return defenders.reduce((pressure, defender) => {
    const point = tacticalHome(defender, defendingSide, defendingTactics);
    const projection = clamp(
      ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared,
      0,
      1,
    );
    if (projection <= 0.08 || projection >= 0.96) return pressure;
    const laneX = start.x + dx * projection;
    const laneY = start.y + dy * projection;
    const distance = Math.hypot(point.x - laneX, point.y - laneY);
    const reach =
      4.2 +
      defender.interceptions / 42 +
      defender.reactions / 55 +
      Math.max(0, defendingTactics.pressBias) * 1.4;
    if (distance >= reach) return pressure;
    return pressure + (1 - distance / reach) * (0.55 + defender.interceptions / 150);
  }, 0);
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
