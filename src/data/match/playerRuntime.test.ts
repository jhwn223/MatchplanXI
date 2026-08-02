import { describe, expect, test } from "vitest";
import {
  actionPerformanceFactor,
  fatigueBreakdown,
} from "./playerRuntime";
import { testPlayer, testTactics } from "./testFixtures";

describe("runtime fatigue", () => {
  test("high pressing and tempo cost more condition", () => {
    const player = testPlayer(1, 1, 6, 74);
    const balanced = fatigueBreakdown(
      player,
      90,
      400,
      testTactics(),
    );
    const intense = fatigueBreakdown(
      player,
      90,
      400,
      testTactics({ pressBias: 1, tempoBias: 1, attackBias: 0.6 }),
    );
    expect(intense.condition).toBeLessThan(balanced.condition);
    expect(intense.tacticalLoss).toBeGreaterThan(0);
  });

  test("stamina protects players from altitude and tactical fatigue", () => {
    const highStamina = testPlayer(1, 1, 6, 88);
    const lowStamina = testPlayer(2, 1, 6, 60);
    const tactics = testTactics({ pressBias: 1, tempoBias: 0.8 });
    const high = fatigueBreakdown(highStamina, 90, 2_200, tactics);
    const low = fatigueBreakdown(lowStamina, 90, 2_200, tactics);
    expect(high.condition).toBeGreaterThan(low.condition);
  });

  test("fatigue hurts movement before goalkeeper technique", () => {
    const player = testPlayer(1, 1, 6, 74, 65);
    const movement = actionPerformanceFactor(
      player,
      100,
      2_000,
      "movement",
      testTactics({ pressBias: 1, tempoBias: 1 }),
    );
    const goalkeeping = actionPerformanceFactor(
      player,
      100,
      2_000,
      "goalkeeping",
      testTactics({ pressBias: 1, tempoBias: 1 }),
    );
    expect(movement).toBeLessThan(goalkeeping);
  });

  test("high-workload roles spend more condition over the same minutes", () => {
    const base = testPlayer(1, 1, 9, 78);
    const poacher = fatigueBreakdown({ ...base, tacticalRole: "poacher" }, 90, 400, testTactics());
    const pressingForward = fatigueBreakdown(
      { ...base, tacticalRole: "pressingForward" },
      90,
      400,
      testTactics(),
    );

    expect(pressingForward.condition).toBeLessThan(poacher.condition);
    expect(pressingForward.roleLoss).toBeGreaterThan(poacher.roleLoss);
  });
});
