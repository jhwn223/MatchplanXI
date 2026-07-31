import { describe, expect, test } from "vitest";
import { createMatchWorld } from "./createWorld";
import { beginPossession, advanceWorld } from "./movementEngine";
import { passOptionScore, worldDistance } from "./perception";
import { testInput, testTactics } from "../testFixtures";

describe("authoritative match world", () => {
  test("movement uses player positions and keeps goalkeepers near their goal", () => {
    const input = testInput(4);
    const tactics = {
      user: testTactics({ widthBias: 1 }),
      opp: testTactics(),
    };
    const world = createMatchWorld(input, 20, tactics);
    const carrier = input.placed[6];
    beginPossession(world, "user", carrier);
    advanceWorld(world, input, tactics, 3);
    expect(world.players.user.get(input.placed[0].playerId)?.x).toBeLessThan(15);
    expect(world.ball.ownerId).toBe(carrier.playerId);
    expect(world.ball.x).toBeCloseTo(
      world.players.user.get(carrier.playerId)?.x ?? 0,
      5,
    );
  });

  test("receiver utility changes when an opponent closes the actual space", () => {
    const input = testInput(5);
    const tactics = { user: testTactics(), opp: testTactics() };
    const world = createMatchWorld(input, 20, tactics);
    const passer = input.placed[6];
    const receiver = input.placed[9];
    const defender = input.oppPlaced[2];
    const openScore = passOptionScore(world, "user", passer, receiver, 0);
    const receiverState = world.players.user.get(receiver.playerId);
    const defenderState = world.players.opp.get(defender.playerId);
    if (!receiverState || !defenderState) throw new Error("test world incomplete");
    defenderState.x = receiverState.x + 0.5;
    defenderState.y = receiverState.y + 0.5;
    const closedScore = passOptionScore(world, "user", passer, receiver, 0);
    expect(closedScore).toBeLessThan(openScore);
  });

  test("distance is calculated from current state rather than formation homes", () => {
    const input = testInput(6);
    const tactics = { user: testTactics(), opp: testTactics() };
    const world = createMatchWorld(input, 1, tactics);
    const user = input.placed[9];
    const opponent = input.oppPlaced[2];
    const before = worldDistance(world, "user", user, "opp", opponent);
    const opponentState = world.players.opp.get(opponent.playerId);
    const userState = world.players.user.get(user.playerId);
    if (!opponentState || !userState) throw new Error("test world incomplete");
    opponentState.x = userState.x;
    opponentState.y = userState.y;
    expect(worldDistance(world, "user", user, "opp", opponent)).toBe(0);
    expect(before).toBeGreaterThan(0);
  });
});
