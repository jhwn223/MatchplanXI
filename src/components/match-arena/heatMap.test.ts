import { describe, expect, it } from "vitest";
import { simulatePeriod } from "../../data/match/eventEngine";
import { testInput } from "../../data/match/testFixtures";
import { ballDwell, playerDwell } from "../../data/matchSim";
import { buildHeatCells, heatColor } from "./heatMap";

const track = simulatePeriod(testInput(4), 1, 45, 1).track!;

function share(cells: { intensity: number }[], from: number, to: number) {
  return cells.filter((cell) => cell.intensity >= from && cell.intensity < to).length / cells.length;
}

describe("heat map scale", () => {
  it("uses its whole range on a real match", () => {
    // The map is worthless if everything lands in one band, which is what
    // scaling against the single busiest cell used to produce.
    for (const cells of [
      buildHeatCells(ballDwell(track, { side: "user" })),
      buildHeatCells(playerDwell(track, { side: "user" })),
    ]) {
      expect(cells.length).toBeGreaterThan(100);
      expect(Math.max(...cells.map((cell) => cell.intensity))).toBe(1);
      expect(share(cells, 0.8, 1.01)).toBeGreaterThan(0.02);
      expect(share(cells, 0.8, 1.01)).toBeLessThan(0.3);
      expect(share(cells, 0, 0.4)).toBeGreaterThan(0.25);
    }
  });

  it("weighs dwell time, not sample count", () => {
    const parked = buildHeatCells([
      { x: 20, y: 50, seconds: 60 },
      { x: 80, y: 50, seconds: 1 },
      { x: 80, y: 50, seconds: 1 },
    ]);
    const hottest = parked.reduce((best, cell) => (cell.intensity > best.intensity ? cell : best));
    expect(hottest.x).toBeLessThan(50);
  });

  it("stays empty with nothing recorded", () => {
    expect(buildHeatCells([])).toEqual([]);
  });

  it("runs cool to hot", () => {
    expect(heatColor(0)).toBe("rgb(24,108,60)");
    expect(heatColor(1)).toBe("rgb(242,56,27)");
    expect(heatColor(0.72)).toBe("rgb(255,230,0)");
  });
});
