import { describe, expect, test } from "vitest";
import { formationAnchor } from "./formationShape";

const ball = { x: 64, y: 42 };

describe("elastic formation shape", () => {
  test("preserves separate holding and attacking midfield layers", () => {
    const anchors = [
      { role: "DEF" as const, baseX: 24, baseY: 50 },
      { role: "MID" as const, baseX: 42, baseY: 38 },
      { role: "MID" as const, baseX: 64, baseY: 50 },
      { role: "FWD" as const, baseX: 82, baseY: 50 },
    ].map((slot) => formationAnchor({
      direction: 1,
      ...slot,
      ball,
      phase: "middleThird",
      hasBall: true,
    }));

    expect(anchors[0].x).toBeLessThan(anchors[1].x);
    expect(anchors[1].x).toBeLessThan(anchors[2].x);
    expect(anchors[2].x).toBeLessThan(anchors[3].x);
    expect(anchors[2].x - anchors[1].x).toBeGreaterThan(12);
  });

  test("moves both blocks toward the ball until attackers and defenders overlap", () => {
    const attacker = formationAnchor({
      direction: 1,
      role: "FWD",
      baseX: 74,
      baseY: 50,
      ball,
      phase: "middleThird",
      hasBall: true,
    });
    const defender = formationAnchor({
      direction: -1,
      role: "DEF",
      baseX: 26,
      baseY: 50,
      ball,
      phase: "defensiveBlock",
      hasBall: false,
    });
    expect(Math.abs(attacker.x - defender.x)).toBeLessThan(10);
  });

  test("team width changes lateral spacing without collapsing lane order", () => {
    const lane = (baseY: number, widthBias: number) => formationAnchor({
      direction: 1,
      role: "FWD",
      baseX: 74,
      baseY,
      ball,
      phase: "middleThird",
      hasBall: true,
      profile: {
        attackBias: 0,
        pressBias: 0,
        defensiveLineBias: 0,
        widthBias,
        focusBias: 0,
      },
    }).y;
    const narrowSpread = lane(80, -1) - lane(20, -1);
    const wideSpread = lane(80, 1) - lane(20, 1);
    expect(wideSpread).toBeGreaterThan(narrowSpread + 15);
  });
});
