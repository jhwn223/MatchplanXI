import { describe, expect, it } from "vitest";
import { testInput, testTactics } from "../testFixtures";
import { createMatchWorld } from "./createWorld";
import { advanceWorld, beginPossession } from "./movementEngine";
import { nearestOpponentDistance } from "./perception";
import type { SimInput } from "../types";

const tactics = { user: testTactics(), opp: testTactics() };

/**
 * How much room the man on the ball has, sampled across every outfield slot.
 *
 * The defender pressing the ball used to aim at a fixed point 1.1 units behind
 * it, so this measured 1.10 at the median whatever was happening — the same
 * with eleven opponents as with ten. It is the quantity football is decided by,
 * and while it was a constant a red card could not cost anything.
 */
function spaceOnBall(input: SimInput) {
  const samples: number[] = [];
  for (let seed = 0; seed < 40; seed++) {
    const world = createMatchWorld({ ...input, seed }, 1, tactics);
    const carrier = input.placed.filter((player) => player.position !== "GK")[seed % 10];
    beginPossession(world, "user", carrier);
    advanceWorld(world, input, tactics, 6);
    for (let step = 0; step < 10; step++) {
      advanceWorld(world, input, tactics, 2);
      const state = world.players.user.get(carrier.playerId);
      if (!state) continue;
      world.ball.x = state.x;
      world.ball.y = state.y;
      samples.push(nearestOpponentDistance(world, "user", carrier));
    }
  }
  samples.sort((a, b) => a - b);
  return {
    median: samples[Math.floor(samples.length * 0.5)],
    mean: samples.reduce((sum, value) => sum + value, 0) / samples.length,
  };
}

describe("space on the ball", () => {
  const full = testInput(1);

  it("varies instead of sitting on a fixed engagement range", () => {
    const { median, mean } = spaceOnBall(full);
    // A metre and a bit is tighter than any real press; the old constant was
    // 1.10 exactly.
    expect(median).toBeGreaterThan(1.6);
    expect(mean).toBeLessThan(6);
  });

  it("opens up when the defending side is a man short in midfield", () => {
    const short: SimInput = {
      ...full,
      oppPlaced: full.oppPlaced.filter((_, index) => index !== 6),
    };
    expect(spaceOnBall(short).median).toBeGreaterThan(spaceOnBall(full).median * 1.15);
  });

  it("tightens when the defending side is told to press", () => {
    const pressed = spaceOnBall(full);
    const world = createMatchWorld(full, 1, {
      user: testTactics(),
      opp: testTactics({ pressBias: 1 }),
    });
    const carrier = full.placed.find((player) => player.position === "MID")!;
    beginPossession(world, "user", carrier);
    const highPress = { user: testTactics(), opp: testTactics({ pressBias: 1 }) };
    advanceWorld(world, full, highPress, 10);
    const state = world.players.user.get(carrier.playerId)!;
    world.ball.x = state.x;
    world.ball.y = state.y;
    expect(nearestOpponentDistance(world, "user", carrier)).toBeLessThan(pressed.mean);
  });
});
