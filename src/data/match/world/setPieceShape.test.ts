import { describe, expect, it } from "vitest";
import { simulatePeriod } from "../eventEngine";
import { combinePeriods } from "../result";
import { testInput } from "../testFixtures";
import { playerDwell } from "./worldTrack";

/**
 * A restart is the only time a centre back is in the opposition box and a
 * forward is in his own. Before the world knew about set pieces both of those
 * were measured at exactly zero for a whole match, which is what made the
 * position heat maps read as eleven separate islands.
 */
describe("set piece shapes", () => {
  const input = testInput(3);
  const track = combinePeriods(
    simulatePeriod(input, 1, 45, 1),
    simulatePeriod(input, 46, 90, 2),
  )!.track!;

  const share = (playerId: number, test: (x: number) => boolean) => {
    const points = playerDwell(track, { side: "user", playerId });
    return points.filter((point) => test(point.x)).length / points.length;
  };
  const byPosition = (position: string) =>
    input.placed.filter((player) => player.position === position);

  it("sends defenders forward for attacking set pieces", () => {
    for (const defender of byPosition("DEF")) {
      const forward = share(defender.playerId, (x) => x > 67);
      expect(forward).toBeGreaterThan(0.002);
      // Still a defender: this is a handful of set pieces, not a role change.
      expect(forward).toBeLessThan(0.08);
    }
  });

  it("brings forwards back to defend them", () => {
    for (const forward of byPosition("FWD")) {
      const home = share(forward.playerId, (x) => x < 34);
      expect(home).toBeGreaterThan(0.002);
      expect(home).toBeLessThan(0.15);
    }
  });

  it("keeps every line spread over its own half of the pitch", () => {
    // Each player's longitudinal range, which was about half a real one while
    // the block could only travel 26 units end to end.
    const spread = (playerId: number) => {
      const points = playerDwell(track, { side: "user", playerId });
      const mean = points.reduce((sum, point) => sum + point.x, 0) / points.length;
      return Math.sqrt(
        points.reduce((sum, point) => sum + (point.x - mean) ** 2, 0) / points.length,
      );
    };
    for (const player of input.placed) {
      if (player.position === "GK") continue;
      expect(spread(player.playerId)).toBeGreaterThan(10);
    }
  });
});
