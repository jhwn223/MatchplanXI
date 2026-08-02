import { describe, expect, test } from "vitest";
import {
  canAttemptOpenPlayShot,
  isCrossingZone,
  isHalfSpaceY,
  shotLocationXg,
} from "./attackingPlay";

describe("attacking geometry", () => {
  test("rejects touchline shots outside a credible near-post angle", () => {
    expect(canAttemptOpenPlayShot("user", { x: 84, y: 6 })).toBe(false);
    expect(canAttemptOpenPlayShot("opp", { x: 16, y: 94 })).toBe(false);
    expect(canAttemptOpenPlayShot("user", { x: 88, y: 50 })).toBe(true);
    expect(canAttemptOpenPlayShot("user", { x: 96, y: 17 })).toBe(false);
  });

  test("recognises wide delivery zones and both half-spaces", () => {
    expect(isCrossingZone("user", { x: 76, y: 14 })).toBe(true);
    expect(isCrossingZone("opp", { x: 24, y: 86 })).toBe(true);
    expect(isCrossingZone("user", { x: 76, y: 50 })).toBe(false);
    expect(isHalfSpaceY(35)).toBe(true);
    expect(isHalfSpaceY(65)).toBe(true);
    expect(isHalfSpaceY(50)).toBe(false);
  });

  test("central close shots are better than wide attempts and headers are discounted", () => {
    const central = shotLocationXg("user", { x: 88, y: 50 });
    const wide = shotLocationXg("user", { x: 88, y: 76 });
    const header = shotLocationXg("user", { x: 88, y: 50 }, true);
    expect(central).toBeGreaterThan(wide);
    expect(central).toBeGreaterThan(header);
  });
});
