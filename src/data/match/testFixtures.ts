import type { TeamAbilityProfile } from "../playerAbility";
import { BALANCED_SIM_TACTICS } from "./tactics";
import type {
  PlacedPlayerLite,
  SimInput,
  SimTacticProfile,
} from "./types";

/**
 * The real 4-3-3, in the canonical coordinates `toSimPlayer` produces
 * (`baseX = 100 - slot.y`, `baseY = slot.x`).
 *
 * This used to be a hand-written approximation, and calibrating against it
 * hid a large error: with the same tactics the fixture produced 2.7 goals and
 * 25 shots a match while the 4-3-3 the game actually ships produced 4.9 and
 * 37. Every guard in the suite was measuring a shape nobody plays.
 */
export const TEST_SHAPE = [
  ["GK", 8, 50],
  ["DEF", 28, 15],
  ["DEF", 22, 37],
  ["DEF", 22, 63],
  ["DEF", 28, 85],
  ["MID", 50, 25],
  ["MID", 46, 50],
  ["MID", 50, 75],
  ["FWD", 78, 18],
  ["FWD", 86, 50],
  ["FWD", 78, 82],
] as const;

export function testProfile(overall: number): TeamAbilityProfile {
  return {
    overall,
    attack: overall,
    creativity: overall,
    defense: overall,
    goalkeeper: overall,
    stamina: overall,
  };
}

export function testPlayer(
  id: number,
  teamId: number,
  index: number,
  overall = 74,
  condition = 95,
): PlacedPlayerLite {
  const [position, baseX, baseY] = TEST_SHAPE[index];
  const keeper = position === "GK";
  return {
    playerId: id,
    teamId,
    name: `P${id}`,
    slotId: `${teamId}-${index}`,
    slotLabel: position,
    naturalPosition: position,
    position,
    baseX,
    baseY,
    overall,
    pace: keeper ? 48 : overall,
    acceleration: keeper ? 48 : overall,
    shooting: keeper ? 15 : overall,
    finishing: keeper ? 10 : overall,
    positioning: overall,
    shotPower: keeper ? 45 : overall,
    longShots: keeper ? 12 : overall,
    passing: overall,
    vision: overall,
    shortPassing: overall,
    longPassing: overall,
    dribbling: keeper ? 40 : overall,
    ballControl: overall,
    agility: overall,
    composure: overall,
    reactions: overall,
    defending: keeper ? 18 : overall,
    interceptions: keeper ? 18 : overall,
    defensiveAwareness: keeper ? 22 : overall,
    standingTackle: keeper ? 12 : overall,
    physical: overall,
    strength: overall,
    aggression: overall,
    stamina: overall,
    penalties: overall,
    crossing: overall,
    freeKickAccuracy: overall,
    headingAccuracy: overall,
    gkDiving: keeper ? overall : 10,
    gkHandling: keeper ? overall : 10,
    gkPositioning: keeper ? overall : 10,
    gkReflexes: keeper ? overall : 10,
    condition,
  };
}

export function testTactics(
  patch: Partial<SimTacticProfile> = {},
): SimTacticProfile {
  return { ...BALANCED_SIM_TACTICS, ...patch };
}

export function testInput(
  seed: number,
  userOverall = 74,
  opponentOverall = 74,
  userTactics = testTactics(),
  oppTactics = testTactics(),
): SimInput {
  return {
    seed,
    userTeamName: "User",
    oppTeamName: "Opponent",
    userElo: 1700,
    oppElo: 1700,
    conditionIndex: 90,
    attackBias: 0,
    userTactics,
    oppTactics,
    isHome: true,
    elevation: 400,
    placed: TEST_SHAPE.map((_, index) =>
      testPlayer(100 + index, 1, index, userOverall),
    ),
    oppPlaced: TEST_SHAPE.map((_, index) =>
      testPlayer(200 + index, 2, index, opponentOverall),
    ),
    userAbility: testProfile(userOverall),
    oppAbility: testProfile(opponentOverall),
    actual: null,
    isKnockout: false,
  };
}

