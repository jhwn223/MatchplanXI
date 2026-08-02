import { describe, expect, test } from "vitest";
import {
  quickSimExpectedGoals,
  quickSimMatch,
  quickSimScore,
} from "./quickSim";
import { testProfile, testTactics } from "./testFixtures";

describe("quick simulation", () => {
  test("keeps the legacy score-only API deterministic", () => {
    expect(quickSimScore(17, 1700, 1680)).toEqual(
      quickSimScore(17, 1700, 1680),
    );
  });

  test("uses real team ability and condition when supplied", () => {
    const strong = quickSimExpectedGoals({
      seed: 1,
      home: {
        elo: 1700,
        ability: testProfile(84),
        conditionIndex: 90,
      },
      away: {
        elo: 1700,
        ability: testProfile(68),
        conditionIndex: 70,
      },
    });
    const weak = quickSimExpectedGoals({
      seed: 1,
      home: {
        elo: 1700,
        ability: testProfile(64),
        conditionIndex: 65,
      },
      away: {
        elo: 1700,
        ability: testProfile(76),
        conditionIndex: 85,
      },
    });
    expect(strong.homeXg - strong.awayXg)
      .toBeGreaterThan(weak.homeXg - weak.awayXg);
  });

  test("returns expected goals alongside a seeded result", () => {
    const result = quickSimMatch({
      seed: 99,
      home: {
        elo: 1750,
        ability: testProfile(78),
        tactics: testTactics({ attackBias: 0.4 }),
      },
      away: {
        elo: 1680,
        ability: testProfile(73),
      },
      elevation: 1_800,
    });
    expect(result.homeXg).toBeGreaterThan(0);
    expect(result.awayXg).toBeGreaterThan(0);
    expect(Number.isInteger(result.home)).toBe(true);
    expect(Number.isInteger(result.away)).toBe(true);
  });
});

