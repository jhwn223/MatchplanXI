import { describe, expect, test } from "vitest";
import { simulatePeriod } from "./eventEngine";
import { validateHalfResult } from "./invariants";
import { testInput } from "./testFixtures";

function total(
  results: ReturnType<typeof simulatePeriod>[],
  select: (result: ReturnType<typeof simulatePeriod>) => number,
) {
  return results.reduce((sum, result) => sum + select(result), 0);
}

describe("player ability sensitivity", () => {
  test("stronger players improve the aggregate result under identical seeds", () => {
    const strong = Array.from({ length: 24 }, (_, seed) =>
      simulatePeriod(testInput(seed + 2_000, 84, 70), 1, 90, 0),
    );
    const weak = Array.from({ length: 24 }, (_, seed) =>
      simulatePeriod(testInput(seed + 2_000, 64, 70), 1, 90, 0),
    );

    const strongGoalDifference = total(
      strong,
      (result) => result.userGoals - result.oppGoals,
    );
    const weakGoalDifference = total(
      weak,
      (result) => result.userGoals - result.oppGoals,
    );
    const strongPassRate = total(
      strong,
      (result) => result.teamStats.user.passSuccessRate,
    );
    const weakPassRate = total(
      weak,
      (result) => result.teamStats.user.passSuccessRate,
    );

    expect(strongGoalDifference).toBeGreaterThan(weakGoalDifference);
    expect(strongPassRate).toBeGreaterThan(weakPassRate);
    expect(total(strong, (result) => result.userXg))
      .toBeGreaterThan(total(weak, (result) => result.userXg));
  });

  test("team and player statistics remain internally consistent", () => {
    for (let seed = 0; seed < 12; seed++) {
      const result = simulatePeriod(testInput(seed + 3_000), 1, 90, 0);
      expect(validateHalfResult(result)).toEqual([]);
    }
  });
});

