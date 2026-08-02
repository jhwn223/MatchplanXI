import { describe, expect, test } from "vitest";
import { testInput, testTactics } from "../testFixtures";
import { continueMatchWorld, createMatchWorld } from "./createWorld";
import {
  accrueActiveFatigue,
  markPlayerUnavailable,
  runtimeInputForWorld,
} from "./playerState";

describe("persistent player runtime state", () => {
  test("a tactical change only charges fatigue after the change", () => {
    const input = testInput(71);
    const balanced = { user: testTactics(), opp: testTactics() };
    const intense = {
      user: testTactics({ pressBias: 1, tempoBias: 1, attackBias: 0.8 }),
      opp: testTactics(),
    };
    const world = createMatchWorld(input, 1, balanced);
    const playerId = input.placed[6].playerId;

    const firstRuntime = runtimeInputForWorld(input, world);
    accrueActiveFatigue(world, firstRuntime, 45, balanced);
    const afterFirstHalf = { ...world.fatigueByPlayer.user.get(playerId)! };

    const secondRuntime = runtimeInputForWorld(input, world);
    accrueActiveFatigue(world, secondRuntime, 46, intense);
    const afterChange = world.fatigueByPlayer.user.get(playerId)!;

    expect(afterChange.condition).toBeLessThan(afterFirstHalf.condition);
    expect(afterChange.tacticalLoss - afterFirstHalf.tacticalLoss).toBeGreaterThan(0);
    expect(afterChange.tacticalLoss - afterFirstHalf.tacticalLoss).toBeLessThan(0.2);
    expect(afterChange.updatedAtMinute).toBe(46);
  });

  test("lowering intensity never restores condition already spent", () => {
    const input = testInput(72);
    const intense = {
      user: testTactics({ pressBias: 1, tempoBias: 1, attackBias: 0.8 }),
      opp: testTactics(),
    };
    const balanced = { user: testTactics(), opp: testTactics() };
    const world = createMatchWorld(input, 1, intense);
    const playerId = input.placed[6].playerId;

    accrueActiveFatigue(world, runtimeInputForWorld(input, world), 45, intense);
    const beforeChange = world.fatigueByPlayer.user.get(playerId)!.condition;
    accrueActiveFatigue(world, runtimeInputForWorld(input, world), 46, balanced);

    expect(world.fatigueByPlayer.user.get(playerId)!.condition).toBeLessThanOrEqual(beforeChange);
  });

  test("fatigue updates never overwrite a player's actual entry minute", () => {
    const input = testInput(75);
    const tactics = { user: testTactics(), opp: testTactics() };
    input.placed[6].enteredAtMinute = 17;
    const playerId = input.placed[6].playerId;
    const world = createMatchWorld(input, 18, tactics);

    const runtime = runtimeInputForWorld(input, world);
    const player = runtime.placed.find((candidate) => candidate.playerId === playerId)!;
    accrueActiveFatigue(world, runtime, 19, tactics);

    expect(player.enteredAtMinute).toBe(17);
    expect(world.players.user.get(playerId)?.player.enteredAtMinute).toBe(17);
    expect(runtimeInputForWorld(input, world).placed.find(
      (candidate) => candidate.playerId === playerId,
    )?.enteredAtMinute).toBe(17);
    expect(world.fatigueByPlayer.user.get(playerId)?.updatedAtMinute).toBe(19);
  });

  test.each(["dismissed", "injured"] as const)(
    "%s players stay unavailable when the next chunk supplies the original lineup",
    (reason) => {
      const input = testInput(reason === "dismissed" ? 73 : 74);
      const tactics = { user: testTactics(), opp: testTactics() };
      const world = createMatchWorld(input, 1, tactics);
      const runtime = runtimeInputForWorld(input, world);
      const player = runtime.placed[6];
      world.ball.ownerSide = "user";
      world.ball.ownerId = player.playerId;

      markPlayerUnavailable(world, runtime, "user", player, reason, 30, tactics.user);

      expect(world.unavailablePlayers.user.get(player.playerId)).toBe(reason);
      expect(world.players.user.has(player.playerId)).toBe(false);
      expect(world.ball.ownerId).toBeNull();
      expect(world.fatigueByPlayer.user.get(player.playerId)?.updatedAtMinute).toBe(30);

      const continued = continueMatchWorld(world, input, 31, tactics);
      expect(continued.players.user.has(player.playerId)).toBe(false);
      expect(continued.unavailablePlayers.user.get(player.playerId)).toBe(reason);
    },
  );
});
