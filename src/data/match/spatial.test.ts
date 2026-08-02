import { describe, expect, test } from "vitest";
import { tacticalHome } from "./spatial";
import { testPlayer, testTactics } from "./testFixtures";

describe("role-based tactical positions", () => {
  test("a false nine drops deeper than a poacher", () => {
    const striker = testPlayer(1, 1, 9, 80);
    const tactics = testTactics();
    const poacher = tacticalHome({ ...striker, tacticalRole: "poacher" }, "user", tactics);
    const falseNine = tacticalHome({ ...striker, tacticalRole: "falseNine" }, "user", tactics);

    expect(falseNine.x).toBeLessThan(poacher.x);
  });

  test("an inverted fullback narrows while an overlapping fullback advances", () => {
    const fullback = testPlayer(2, 1, 1, 80);
    const tactics = testTactics();
    const inverted = tacticalHome({ ...fullback, tacticalRole: "invertedFullback" }, "user", tactics);
    const overlap = tacticalHome({ ...fullback, tacticalRole: "overlappingFullback" }, "user", tactics);

    expect(Math.abs(inverted.y - 50)).toBeLessThan(Math.abs(overlap.y - 50));
    expect(overlap.x).toBeGreaterThan(inverted.x);
  });
});
