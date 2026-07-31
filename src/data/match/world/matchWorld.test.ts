import { describe, expect, test } from "vitest";
import { createMatchWorld } from "./createWorld";
import { beginPossession, advanceWorld } from "./movementEngine";
import {
  isPlayerOffside,
  offsideLineFor,
  passOptionScore,
  worldDistance,
} from "./perception";
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

  test("the whole team follows the ball as a compact relative shape", () => {
    const input = testInput(7);
    const tactics = { user: testTactics(), opp: testTactics() };
    const world = createMatchWorld(input, 30, tactics);
    const carrier = input.placed[6];
    const carrierState = world.players.user.get(carrier.playerId);
    if (!carrierState) throw new Error("carrier missing");
    carrierState.x = 75;
    carrierState.y = 52;
    beginPossession(world, "user", carrier);
    advanceWorld(world, input, tactics, 2.4);

    const meanX = (position: "DEF" | "MID" | "FWD") => {
      const line = [...world.players.user.values()].filter((state) => state.player.position === position);
      return line.reduce((sum, state) => sum + state.x, 0) / line.length;
    };
    const defense = meanX("DEF");
    const midfield = meanX("MID");
    const attack = meanX("FWD");
    expect(defense).toBeGreaterThan(34);
    expect(midfield - defense).toBeGreaterThan(8);
    expect(midfield - defense).toBeLessThan(24);
    expect(attack - midfield).toBeGreaterThan(8);
    expect(attack - midfield).toBeLessThan(24);
    expect(world.phaseBySide.user).toBe("transitionAttack");
    expect(world.phaseBySide.opp).toBe("transitionDefense");
  });

  test("marking assignments persist instead of changing every tick", () => {
    const input = testInput(8);
    const tactics = { user: testTactics(), opp: testTactics() };
    const world = createMatchWorld(input, 15, tactics);
    beginPossession(world, "user", input.placed[6]);
    advanceWorld(world, input, tactics, 0.4);
    const before = [...world.players.opp.values()]
      .filter((state) => state.defensiveRole === "marker")
      .map((state) => [state.player.playerId, state.markingTargetId]);
    advanceWorld(world, input, tactics, 0.6);
    const after = [...world.players.opp.values()]
      .filter((state) => state.defensiveRole === "marker")
      .map((state) => [state.player.playerId, state.markingTargetId]);
    expect(before.length).toBeGreaterThan(0);
    expect(after).toEqual(before);
  });

  test("defending preserves lanes and sends only a small unit away from the block", () => {
    const input = testInput(81);
    const tactics = { user: testTactics(), opp: testTactics() };
    const world = createMatchWorld(input, 18, tactics);
    const carrier = input.placed[6];
    const carrierState = world.players.user.get(carrier.playerId);
    if (!carrierState) throw new Error("carrier missing");
    carrierState.x = 58;
    carrierState.y = 46;
    beginPossession(world, "user", carrier);
    advanceWorld(world, input, tactics, 3.4);

    const defending = [...world.players.opp.values()].filter(
      (state) => state.player.position !== "GK",
    );
    const markers = defending.filter((state) => state.defensiveRole === "marker");
    const activelyDetached = defending.filter((state) =>
      state.defensiveRole === "presser" || state.defensiveRole === "cover",
    );
    expect(markers.length).toBeLessThanOrEqual(3);
    expect(activelyDetached).toHaveLength(2);

    const defenderLanes = defending
      .filter((state) => state.player.position === "DEF")
      .sort((a, b) => a.player.baseY - b.player.baseY)
      .map((state) => state.y);
    expect(defenderLanes).toEqual([...defenderLanes].sort((a, b) => a - b));

    const crowdedNearBall = [...world.players.user.values(), ...world.players.opp.values()]
      .filter((state) => state.player.position !== "GK")
      .filter((state) => Math.hypot(state.x - world.ball.x, state.y - world.ball.y) < 9);
    expect(crowdedNearBall.length).toBeLessThanOrEqual(6);
  });

  test("offside uses the ball and the actual second-last opponent", () => {
    const input = testInput(9);
    const tactics = { user: testTactics(), opp: testTactics() };
    const world = createMatchWorld(input, 20, tactics);
    const passer = input.placed[6];
    const receiver = input.placed[9];
    const passerState = world.players.user.get(passer.playerId);
    const receiverState = world.players.user.get(receiver.playerId);
    if (!passerState || !receiverState) throw new Error("attacking states missing");
    passerState.x = 60;
    world.ball.x = 60;
    world.ball.y = 50;
    world.ball.ownerSide = "user";
    world.ball.ownerId = passer.playerId;
    const opponentStates = [...world.players.opp.values()].sort(
      (a, b) => a.player.playerId - b.player.playerId,
    );
    opponentStates.forEach((state, index) => {
      state.x = index === 0 ? 96 : 72 + index * 1.2;
    });
    const line = offsideLineFor(world, "user");
    receiverState.x = line + 1;
    expect(isPlayerOffside(world, "user", receiver)).toBe(true);
    receiverState.x = line - 1;
    expect(isPlayerOffside(world, "user", receiver)).toBe(false);
  });
});
