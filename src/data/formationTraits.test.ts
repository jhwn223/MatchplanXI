import { describe, expect, test } from "vitest";
import { FORMATION_KEYS, slotsOf } from "./formation";
import { formationTraits } from "./formationTraits";
import { toSimPlayer } from "../components/match-board/simInput";
import type { Player } from "./types";

/** A player good enough to fill any slot; only his position matters here. */
function filler(id: number): Player {
  return {
    player_id: id,
    team_id: 1,
    player_name: `P${id}`,
    position: "MID",
    caps: 10,
  } as Player;
}

describe("formation traits are read from the shape the engine sees", () => {
  test("commitment matches the engine's own thirds, slot for slot", () => {
    for (const key of FORMATION_KEYS) {
      const traits = formationTraits(key);
      // Recompute through the same conversion the match input uses, so the
      // traits cannot drift from what the simulation actually counts.
      const engineCounts = [0, 0, 0];
      slotsOf(key).forEach((slot, index) => {
        const simPlayer = toSimPlayer(filler(index), slot, 90);
        if (simPlayer.position === "GK") return;
        const canonicalX = simPlayer.baseX;
        engineCounts[canonicalX < 34 ? 0 : canonicalX < 67 ? 1 : 2]++;
      });
      expect(traits.commitment, key).toEqual(engineCounts);
      expect(traits.commitment[0] + traits.commitment[1] + traits.commitment[2], key).toBe(10);
    }
  });

  test("every formation names at least one strength and one weakness", () => {
    for (const key of FORMATION_KEYS) {
      const traits = formationTraits(key);
      expect(traits.pros.length, key).toBeGreaterThan(0);
      expect(traits.cons.length, key).toBeGreaterThan(0);
    }
  });

  test("the notes follow the counts rather than being written about them", () => {
    const backFive = formationTraits("5-4-1");
    expect(backFive.commitment[0]).toBe(5);
    expect(backFive.pros.join()).toContain("수비 5명");
    expect(backFive.commitment[2]).toBe(1);
    expect(backFive.cons.join()).toContain("최전방 1명");

    const backThree = formationTraits("3-4-3");
    expect(backThree.commitment[0]).toBe(3);
    expect(backThree.cons.join()).toContain("수비 3명");
    expect(backThree.commitment[2]).toBe(3);
    expect(backThree.pros.join()).toContain("최전방");
  });
});
