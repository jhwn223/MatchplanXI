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
      buildHeatCells(
        playerDwell(track, { side: "user", includeKeeper: true, inPlayOnly: true }),
        { normalizeGroups: true },
      ),
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

  it("keeps a continuous ball route visible between possession hubs", () => {
    const route = buildHeatCells([
      { x: 20, y: 50, seconds: 2, segmentStart: true },
      { x: 40, y: 50, seconds: 0.5 },
      { x: 60, y: 50, seconds: 0.5 },
      { x: 80, y: 50, seconds: 2 },
    ], { preserveRoutes: true });
    expect(route.some((cell) => cell.x > 47 && cell.x < 53 && cell.y > 27 && cell.y < 37)).toBe(true);
  });

  it("keeps a goalkeeper zone without letting it flatten every outfield role", () => {
    const points = playerDwell(track, { side: "user", includeKeeper: true, inPlayOnly: true });
    const cells = buildHeatCells(points, { normalizeGroups: true });
    const ownBox = cells.filter((cell) => cell.x < 16);
    const outfield = cells.filter((cell) => cell.x >= 16);
    expect(ownBox.length).toBeGreaterThan(0);
    expect(outfield.length).toBeGreaterThan(ownBox.length);
    expect(Math.max(...outfield.map((cell) => cell.intensity))).toBeGreaterThan(0.75);
  });

  it("keeps continuous player movement visible between low-frequency stops", () => {
    const cells = buildHeatCells([
      { x: 15, y: 50, seconds: 1, groupId: 9, segmentStart: true },
      { x: 30, y: 50, seconds: 1, groupId: 9 },
      { x: 45, y: 50, seconds: 1, groupId: 9 },
      { x: 60, y: 50, seconds: 1, groupId: 9 },
      { x: 75, y: 50, seconds: 1, groupId: 9 },
    ], { normalizeGroups: true });
    const centerRoute = cells.filter(
      (cell) => cell.x >= 30 && cell.x <= 70 && cell.y >= 27 && cell.y <= 37,
    );
    expect(centerRoute.length).toBeGreaterThan(10);
  });

  it("runs cool to hot", () => {
    expect(heatColor(0)).toBe("rgb(24,108,60)");
    expect(heatColor(1)).toBe("rgb(242,56,27)");
    expect(heatColor(0.72)).toBe("rgb(255,230,0)");
  });
});
