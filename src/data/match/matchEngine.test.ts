import { describe, expect, test } from "vitest";
import { simulatePeriod } from "./eventEngine";
import { samplePlayerPositions } from "./spatial";
import { BALANCED_SIM_TACTICS } from "./tactics";
import type { PlacedPlayerLite, SimInput, SimTacticProfile } from "./types";

const profile = {
  overall: 74,
  attack: 74,
  creativity: 74,
  defense: 74,
  goalkeeper: 74,
  stamina: 74,
};

const shape = [
  ["GK", 8, 50],
  ["DEF", 28, 18],
  ["DEF", 25, 39],
  ["DEF", 25, 61],
  ["DEF", 28, 82],
  ["MID", 48, 25],
  ["MID", 45, 50],
  ["MID", 48, 75],
  ["FWD", 72, 20],
  ["FWD", 78, 50],
  ["FWD", 72, 80],
] as const;

function player(
  id: number,
  teamId: number,
  index: number,
  overall = 74,
): PlacedPlayerLite {
  const [position, baseX, baseY] = shape[index];
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
    gkDiving: keeper ? overall : 10,
    gkHandling: keeper ? overall : 10,
    gkPositioning: keeper ? overall : 10,
    gkReflexes: keeper ? overall : 10,
    condition: 95,
  };
}

function tactics(patch: Partial<SimTacticProfile> = {}): SimTacticProfile {
  return { ...BALANCED_SIM_TACTICS, ...patch };
}

function input(
  seed: number,
  userTactics = tactics(),
  oppTactics = tactics(),
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
    placed: shape.map((_, index) => player(100 + index, 1, index)),
    oppPlaced: shape.map((_, index) => player(200 + index, 2, index)),
    userAbility: profile,
    oppAbility: profile,
    actual: null,
    isKnockout: false,
  };
}

describe("match engine invariants", () => {
  test("the same seed and inputs reproduce the same timeline", () => {
    const first = simulatePeriod(input(42), 1, 90, 0);
    const second = simulatePeriod(input(42), 1, 90, 0);
    expect(second).toEqual(first);
  });

  test("position heat samples preserve football roles and respond to width", () => {
    const squad = input(1).placed;
    const narrow = samplePlayerPositions(20, "user", squad, tactics({ widthBias: -1 }));
    const wide = samplePlayerPositions(20, "user", squad, tactics({ widthBias: 1 }));
    const goalkeeper = narrow.find((sample) => sample.playerId === 100);
    const narrowSpread = Math.max(...narrow.map((sample) => sample.y)) - Math.min(...narrow.map((sample) => sample.y));
    const wideSpread = Math.max(...wide.map((sample) => sample.y)) - Math.min(...wide.map((sample) => sample.y));
    expect(goalkeeper?.x).toBeLessThan(15);
    expect(wideSpread).toBeGreaterThan(narrowSpread + 10);
  });

  test("a full match stays inside broad football calibration limits", () => {
    const results = Array.from({ length: 30 }, (_, seed) =>
      simulatePeriod(input(seed + 1), 1, 90, 0),
    );
    const average = (values: number[]) =>
      values.reduce((sum, value) => sum + value, 0) / values.length;
    const passes = average(results.map((result) => result.teamStats.user.passesAttempted));
    const shots = average(results.map((result) => result.teamStats.user.shots));
    const fouls = average(results.map((result) => result.teamStats.user.fouls));
    expect(passes).toBeGreaterThan(220);
    expect(passes).toBeLessThan(850);
    expect(shots).toBeGreaterThan(3);
    expect(shots).toBeLessThan(35);
    expect(fouls).toBeGreaterThan(0);
    expect(fouls).toBeLessThan(30);
    for (const result of results) {
      const goalkeeperShots = result.playerStats
        .filter((playerStat) => playerStat.position === "GK")
        .reduce((sum, playerStat) => sum + playerStat.shots, 0);
      expect(goalkeeperShots).toBe(0);
    }
  });

  test("successful passes preserve the carrier inside each possession", () => {
    const result = simulatePeriod(input(77), 1, 90, 0);
    const possessions = new Map<string, typeof result.events>();
    for (const event of result.events) {
      if (!event.possessionId) continue;
      const group = possessions.get(event.possessionId) ?? [];
      group.push(event);
      possessions.set(event.possessionId, group);
    }
    let checkedLinks = 0;
    for (const events of possessions.values()) {
      let expectedCarrier: number | undefined;
      let expectedSide: (typeof events)[number]["side"] | undefined;
      for (const event of events) {
        if (event.type !== "pass") continue;
        if (
          expectedCarrier != null &&
          expectedSide === event.side
        ) {
          expect(event.actorId).toBe(expectedCarrier);
          checkedLinks++;
        }
        expectedCarrier = event.success ? event.targetId : undefined;
        expectedSide = event.side;
      }
    }
    expect(checkedLinks).toBeGreaterThan(30);
  });

  test("event coordinates form one continuous ball path per possession", () => {
    const result = simulatePeriod(input(91), 1, 90, 0);
    const previousByPossession = new Map<string, (typeof result.events)[number]>();
    let checkedLinks = 0;
    for (const event of result.events) {
      if (!event.possessionId) continue;
      const previous = previousByPossession.get(event.possessionId);
      if (
        previous?.endX != null &&
        previous.endY != null &&
        event.x != null &&
        event.y != null
      ) {
        expect(event.x).toBeCloseTo(previous.endX, 5);
        expect(event.y).toBeCloseTo(previous.endY, 5);
        checkedLinks++;
      }
      previousByPossession.set(event.possessionId, event);
    }
    expect(checkedLinks).toBeGreaterThan(80);
  });

  test("high pressing changes recoveries and carries a fatigue/foul trade-off", () => {
    const high = Array.from({ length: 50 }, (_, seed) =>
      simulatePeriod(
        input(
          seed + 500,
          tactics({ pressBias: 1, defensiveLineBias: 0.8, tacklingBias: 0.5 }),
        ),
        1,
        90,
        0,
      ),
    );
    const low = Array.from({ length: 50 }, (_, seed) =>
      simulatePeriod(
        input(
          seed + 500,
          tactics({ pressBias: -1, defensiveLineBias: -0.8, tacklingBias: -0.5 }),
        ),
        1,
        90,
        0,
      ),
    );
    const recoveries = (results: typeof high) =>
      results.reduce(
        (sum, result) =>
          sum + result.teamStats.user.interceptions + result.teamStats.user.tacklesWon,
        0,
      );
    expect(recoveries(high)).toBeGreaterThan(recoveries(low));
    expect(high.reduce((sum, result) => sum + result.teamStats.user.fouls, 0))
      .toBeGreaterThanOrEqual(low.reduce((sum, result) => sum + result.teamStats.user.fouls, 0));
  });
});
