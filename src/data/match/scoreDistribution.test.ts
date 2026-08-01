import { describe, expect, test } from "vitest";
import {
  DEFAULT_TEAM_TACTICS,
  simProfileFromTeamTactics,
} from "../../components/match-arena/tactics";
import { simulatePeriod } from "./eventEngine";
import { testInput } from "./testFixtures";
import type { SimTacticProfile } from "./types";

type PeriodResult = ReturnType<typeof simulatePeriod>;

function sample(profile: SimTacticProfile, count: number): PeriodResult[] {
  return Array.from({ length: count }, (_, index) =>
    simulatePeriod(
      testInput((index + 1) * 100_003, 74, 74, profile, profile),
      1,
      90,
      0,
    ),
  );
}

function averageGoals(results: PeriodResult[]) {
  return results.reduce(
    (total, result) => total + result.userGoals + result.oppGoals,
    0,
  ) / results.length;
}

describe("score distribution from the tactics shown in the UI", () => {
  test("balanced tactics make shootouts possible but uncommon", () => {
    const balanced = simProfileFromTeamTactics(DEFAULT_TEAM_TACTICS);
    const results = sample(balanced, 32);
    const sevenPlus = results.filter(
      (result) => result.userGoals + result.oppGoals >= 7,
    );
    const teamFivePlus = results.filter(
      (result) => Math.max(result.userGoals, result.oppGoals) >= 5,
    );

    expect(averageGoals(results)).toBeGreaterThanOrEqual(2);
    expect(averageGoals(results)).toBeLessThanOrEqual(3.6);
    expect(sevenPlus.length).toBeLessThanOrEqual(2);
    expect(teamFivePlus.length).toBeLessThanOrEqual(2);
  });

  test("extreme attacking tactics still trade stability for more goals", () => {
    const balanced = simProfileFromTeamTactics(DEFAULT_TEAM_TACTICS);
    const aggressive = simProfileFromTeamTactics({
      ...DEFAULT_TEAM_TACTICS,
      mentality: "attacking",
      tempo: "fast",
      workRate: "intense",
      chanceCreation: "forwardRuns",
      pressing: "high",
      defensiveLine: "high",
      lineOfEngagement: "high",
      restDefense: 2,
    });
    const balancedResults = sample(balanced, 24);
    const aggressiveResults = sample(aggressive, 24);

    expect(averageGoals(aggressiveResults))
      .toBeGreaterThan(averageGoals(balancedResults) + 0.35);
    expect(averageGoals(aggressiveResults)).toBeLessThanOrEqual(5.5);
  });
});
