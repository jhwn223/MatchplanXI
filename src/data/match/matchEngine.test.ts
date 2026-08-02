import { describe, expect, test } from "vitest";
import { simulatePeriod, simulatePeriodWithWorld } from "./eventEngine";
import { samplePlayerPositions } from "./spatial";
import { BALANCED_SIM_TACTICS } from "./tactics";
import { applyExtraTime, combineHalves } from "./result";
import type { PlacedPlayerLite, SimInput, SimTacticProfile } from "./types";
import type { MatchWorld } from "./world/types";

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
    crossing: overall,
    freeKickAccuracy: overall,
    headingAccuracy: overall,
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

  test("one-minute live chunks preserve and advance the same match world", () => {
    const first = simulatePeriodWithWorld(input(43), 1, 1, 999_983);
    const firstElapsedSeconds = first.world.elapsedSeconds;
    const firstPositions = [...first.world.players.user.values()].map((state) => ({
      playerId: state.player.playerId,
      x: state.x,
      y: state.y,
    }));

    const second = simulatePeriodWithWorld(
      input(43),
      2,
      2,
      2 * 999_983,
      first.world,
    );

    expect(first.world.minute).toBe(1);
    expect(first.world.elapsedSeconds).toBe(firstElapsedSeconds);
    expect(second.world.minute).toBe(2);
    expect(second.world.elapsedSeconds).toBeGreaterThan(firstElapsedSeconds);
    expect(second.world.fatigueByPlayer.user.get(106)?.updatedAtMinute).toBe(2);
    expect(second.world.fatigueByPlayer.user.get(106)?.condition).toBeLessThan(95);
    expect(second.world).not.toBe(first.world);
    for (const position of firstPositions) {
      const preserved = first.world.players.user.get(position.playerId);
      expect(preserved?.x).toBe(position.x);
      expect(preserved?.y).toBe(position.y);
    }
  });

  test("yellow cards persist across live chunks and can be inherited after half-time", () => {
    const firstInput = input(143);
    firstInput.initialYellowCards = { user: { 105: 1 } };
    const first = simulatePeriodWithWorld(firstInput, 46, 46, 46 * 999_983);
    expect(first.world.yellowCards.user.get(105)).toBe(1);

    first.world.yellowCards.user.set(106, 1);
    const second = simulatePeriodWithWorld(
      input(143),
      47,
      47,
      47 * 999_983,
      first.world,
    );
    expect(second.world.yellowCards.user.get(105)).toBe(1);
    expect(second.world.yellowCards.user.get(106)).toBe(1);
  });

  test("live minute chunks timestamp every event inside their own minute", () => {
    // The arena replays by timestamp and holds its clock at the period end
    // while events are pending. An event stamped outside its chunk — or after
    // the final whistle — can never be reached, which froze the match just
    // short of half time.
    for (let seed = 0; seed < 6; seed++) {
      let world: MatchWorld | undefined;
      let previousTimestamp = 0;
      for (let minute = 1; minute <= 45; minute++) {
        const step = simulatePeriodWithWorld(
          input(seed + 1),
          minute,
          minute,
          minute * 999_983,
          world,
        );
        world = step.world;
        for (const event of step.result.events) {
          const timestamp = event.timestamp ?? event.minute - 1;
          expect(timestamp).toBeGreaterThanOrEqual(minute - 1);
          expect(timestamp).toBeLessThan(minute);
          expect(timestamp).toBeGreaterThanOrEqual(previousTimestamp);
          previousTimestamp = timestamp;
          expect(event.minute).toBe(minute);
        }
      }
    }
  });

  test("a continued world removes dismissed players without resetting everyone else", () => {
    const first = simulatePeriodWithWorld(input(44), 1, 1, 999_983);
    const removedId = first.world.players.user.keys().next().value as number;
    first.world.ball.ownerSide = "user";
    first.world.ball.ownerId = removedId;
    const nextInput = input(44);
    nextInput.placed = nextInput.placed.filter((player) => player.playerId !== removedId);

    const second = simulatePeriodWithWorld(
      nextInput,
      2,
      2,
      2 * 999_983,
      first.world,
    );

    expect(second.world.players.user.has(removedId)).toBe(false);
    expect(second.world.ball.ownerId).not.toBe(removedId);
    expect(second.world.elapsedSeconds).toBeGreaterThan(first.world.elapsedSeconds);
  });

  test("dismissed and injured players do not return for extra time", () => {
    const knockoutInput = input(45);
    knockoutInput.isKnockout = true;
    const base = combineHalves(
      knockoutInput,
      simulatePeriod(knockoutInput, 1, 45, 999_983),
      simulatePeriod(knockoutInput, 46, 90, 1_999_966),
    );
    base.userGoals = 0;
    base.oppGoals = 0;
    const dismissedId = knockoutInput.placed[5].playerId;
    const injuredId = knockoutInput.placed[6].playerId;
    const dismissed = base.playerStats.find((stat) => stat.side === "user" && stat.playerId === dismissedId);
    const injured = base.playerStats.find((stat) => stat.side === "user" && stat.playerId === injuredId);
    if (!dismissed || !injured) throw new Error("continuation stats missing");
    dismissed.redCards = 1;
    injured.injuries = 1;

    const result = applyExtraTime(knockoutInput, base);
    const unavailable = new Set([dismissedId, injuredId]);
    const extraTimeEvents = result.events.filter((event) => event.minute >= 91);
    const extraTimeSamples = result.positionSamples.filter((sample) => sample.minute >= 91);

    expect(result.wentToExtraTime).toBe(true);
    expect(extraTimeSamples.length).toBeGreaterThan(0);
    expect(extraTimeEvents.some((event) =>
      unavailable.has(event.actorId) || (event.targetId != null && unavailable.has(event.targetId))
    )).toBe(false);
    expect(extraTimeSamples.some((sample) => unavailable.has(sample.playerId))).toBe(false);
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

  test("all attack directions produce distinct pass and heat-map patterns", () => {
    const simulateFocus = (patch: Partial<SimTacticProfile>) => [311, 312].map((seed) =>
      simulatePeriod(input(seed, tactics(patch)), 1, 30, 0),
    );
    const left = simulateFocus({ focusBias: -1 });
    const balanced = simulateFocus({ focusBias: 0, centralFocusBias: 0 });
    const right = simulateFocus({ focusBias: 1 });
    const central = simulateFocus({ focusBias: 0, centralFocusBias: 1, widthBias: -0.2 });
    const attackingIds = new Set(
      input(0).placed
        .filter((player) => player.position === "MID" || player.position === "FWD")
        .map((player) => player.playerId),
    );
    const mean = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length;
    const passEndY = (results: ReturnType<typeof simulatePeriod>[]) => mean(
      results.flatMap((result) => result.events
        .filter((event) => event.side === "user" && event.type === "pass" && event.success)
        .map((event) => event.endY ?? 50)),
    );
    const attackingHeatY = (results: ReturnType<typeof simulatePeriod>[]) => mean(
      results.flatMap((result) => result.positionSamples
        .filter((sample) => sample.side === "user" && attackingIds.has(sample.playerId))
        .map((sample) => sample.y)),
    );
    const passCentralDeviation = (results: ReturnType<typeof simulatePeriod>[]) => mean(
      results.flatMap((result) => result.events
        .filter((event) => event.side === "user" && event.type === "pass" && event.success)
        .map((event) => Math.abs((event.endY ?? 50) - 50))),
    );
    const heatCentralDeviation = (results: ReturnType<typeof simulatePeriod>[]) => mean(
      results.flatMap((result) => result.positionSamples
        .filter((sample) => sample.side === "user" && attackingIds.has(sample.playerId))
        .map((sample) => Math.abs(sample.y - 50))),
    );

    expect(passEndY(right) - passEndY(left)).toBeGreaterThan(9);
    expect(attackingHeatY(right) - attackingHeatY(left)).toBeGreaterThan(15);
    expect(passEndY(balanced)).toBeGreaterThan(passEndY(left));
    expect(passEndY(balanced)).toBeLessThan(passEndY(right));
    expect(passCentralDeviation(central)).toBeLessThan(passCentralDeviation(balanced) - 3);
    expect(heatCentralDeviation(central)).toBeLessThan(heatCentralDeviation(balanced) - 3);
  });

  test("a full match stays inside football calibration limits in both halves", () => {
    const results = Array.from({ length: 30 }, (_, seed) =>
      simulatePeriod(input(seed + 1), 1, 90, 0),
    );
    const average = (values: number[]) =>
      values.reduce((sum, value) => sum + value, 0) / values.length;
    const passes = average(results.map((result) => result.teamStats.user.passesAttempted));
    const shots = average(results.map((result) => result.teamStats.user.shots));
    const combinedShots = average(results.map(
      (result) => result.teamStats.user.shots + result.teamStats.opp.shots,
    ));
    const combinedShotsOnTarget = average(results.map(
      (result) => result.teamStats.user.shotsOnTarget + result.teamStats.opp.shotsOnTarget,
    ));
    const firstHalfShots = average(results.map((result) => result.events.filter(
      (event) => event.type === "shot" && event.minute <= 45,
    ).length));
    const secondHalfShots = average(results.map((result) => result.events.filter(
      (event) => event.type === "shot" && event.minute > 45,
    ).length));
    const fouls = average(results.map((result) => result.teamStats.user.fouls));
    const offsides = average(results.map((result) => result.teamStats.user.offsides));
    expect(passes).toBeGreaterThan(220);
    expect(passes).toBeLessThan(850);
    expect(shots).toBeGreaterThan(3);
    expect(shots).toBeLessThan(18);
    expect(combinedShots).toBeGreaterThanOrEqual(20);
    expect(combinedShots).toBeLessThanOrEqual(29);
    expect(firstHalfShots).toBeGreaterThanOrEqual(9);
    expect(firstHalfShots).toBeLessThanOrEqual(15);
    expect(secondHalfShots).toBeGreaterThanOrEqual(9);
    expect(secondHalfShots).toBeLessThanOrEqual(15);
    expect(combinedShotsOnTarget).toBeGreaterThanOrEqual(7);
    expect(combinedShotsOnTarget).toBeLessThanOrEqual(12);
    expect(fouls).toBeGreaterThan(0);
    expect(fouls).toBeLessThan(30);
    expect(offsides).toBeLessThan(8);
    for (const result of results) {
      const goalkeeperShots = result.playerStats
        .filter((playerStat) => playerStat.position === "GK")
        .reduce((sum, playerStat) => sum + playerStat.shots, 0);
      expect(goalkeeperShots).toBe(0);
    }
  });

  test("a clear Elo advantage improves results without pre-deciding them", () => {
    const sampleSize = 24;
    const level = Array.from({ length: sampleSize }, (_, seed) =>
      simulatePeriod(input(seed + 1000), 1, 90, 0),
    );
    const stronger = Array.from({ length: sampleSize }, (_, seed) => {
      const match = input(seed + 1000);
      match.userElo = 1850;
      match.oppElo = 1600;
      return simulatePeriod(match, 1, 90, 0);
    });
    const averageGoalDifference = (results: typeof stronger) =>
      results.reduce(
        (sum, result) => sum + result.userGoals - result.oppGoals,
        0,
      ) / results.length;
    const strongerWins = stronger.filter(
      (result) => result.userGoals > result.oppGoals,
    ).length;
    const strongerNonWins = stronger.length - strongerWins;

    expect(averageGoalDifference(stronger)).toBeGreaterThan(
      averageGoalDifference(level),
    );
    expect(strongerWins).toBeGreaterThan(strongerNonWins);
    // The cap is intentional: an Elo edge improves repeated decisions but
    // never turns a match into a predetermined result.
    expect(strongerNonWins).toBeGreaterThan(0);
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

  test("open-play shots only come from the attacking third and never from goalkeepers", () => {
    const results = Array.from({ length: 25 }, (_, seed) =>
      simulatePeriod(input(seed + 900), 1, 90, 0),
    );
    const shots = results.flatMap((result) =>
      result.events.filter(
        (event) =>
          event.type === "shot" && !event.possessionId?.includes(":restart:"),
      ),
    );
    expect(shots.length).toBeGreaterThan(20);
    for (const shot of shots) {
      const canonicalX = shot.side === "user" ? shot.x ?? 0 : 100 - (shot.x ?? 100);
      expect(canonicalX).toBeGreaterThanOrEqual(78);
      const squad = shot.side === "user" ? input(0).placed : input(0).oppPlaced;
      expect(squad.find((player) => player.playerId === shot.actorId)?.position).not.toBe("GK");
    }
  });

  test("dead-ball restarts exclude throw-ins from the continuous match flow", () => {
    const results = Array.from({ length: 45 }, (_, seed) =>
      simulatePeriod(input(seed + 1200), 1, 90, 0),
    );
    const events = results.flatMap((result) => result.events);
    const types = new Set(events.map((event) => event.type));
    expect(types.has("corner")).toBe(true);
    expect(types.has("freeKick")).toBe(true);
    expect(types.has("offside")).toBe(true);
    expect(types.has("throwIn")).toBe(false);
    for (const event of events) {
      if (event.type !== "pass") continue;
      expect(event.endY ?? 50).toBeGreaterThanOrEqual(3);
      expect(event.endY ?? 50).toBeLessThanOrEqual(97);
    }
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
    // A high line also regains possession by catching the opponent offside;
    // include those deliberate trap wins now that offsides use real positions.
    const recoveries = (results: typeof high) =>
      results.reduce(
        (sum, result) =>
          sum +
          result.teamStats.user.interceptions +
          result.teamStats.user.tacklesWon +
          result.teamStats.opp.offsides,
        0,
      );
    expect(recoveries(high)).toBeGreaterThan(recoveries(low));
    expect(high.reduce((sum, result) => sum + result.teamStats.user.fouls, 0))
      .toBeGreaterThanOrEqual(low.reduce((sum, result) => sum + result.teamStats.user.fouls, 0));
    // A hundred full matches, and the engine now steps the world through every
    // second of match time rather than a few seconds per possession.
  });
});
