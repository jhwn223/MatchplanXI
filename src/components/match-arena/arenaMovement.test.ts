import { describe, expect, test } from "vitest";
import { updateArenaMovement } from "./arenaMovement";
import type { ArenaDot, ArenaState } from "./runtimeTypes";
import type { LiveIntensity } from "./tactics";

function dot(
  playerId: number,
  team: 0 | 1,
  role: ArenaDot["role"],
  x: number,
  y: number,
): ArenaDot {
  return {
    playerId,
    team,
    role,
    x,
    y,
    vx: 0,
    vy: 0,
    facing: team === 0 ? 0 : Math.PI,
    hx: x,
    hy: y,
    num: playerId,
    name: `P${playerId}`,
    react: 1,
    pace: 72,
    passing: 72,
    dribbling: 72,
    shooting: 72,
    defending: 72,
    goalkeeping: role === "GK" ? 74 : 10,
    stamina: 75,
    condition: 95,
    nz: 1,
    ph: 0,
    action: "idle",
    actionT: 0,
  };
}

function arena(): ArenaState {
  return {
    clock: 20,
    phase: "play",
    celebrateT: 0,
    actionT: 0,
    score: [0, 0],
    nextGoal: 0,
    nextEvent: 0,
    dots: [
      dot(1, 0, "GK", 7, 50),
      dot(2, 0, "MID", 45, 50),
      dot(3, 0, "FWD", 67, 28),
      dot(4, 1, "GK", 93, 50),
      dot(5, 1, "DEF", 62, 44),
      dot(6, 1, "MID", 58, 62),
    ],
    ball: {
      x: 45,
      y: 50,
      previousX: 45,
      previousY: 50,
      owner: 1,
      flightTo: -1,
      flightTarget: null,
      lastTeam: 0,
      scripted: false,
      trail: [],
    },
    banner: null,
    goalSide: null,
    time: 0,
    scoring: null,
    periodBanner: null,
    periodBannerT: 0,
    announcedET1: false,
    announcedET2: false,
    penT: 0,
    pkSequence: [],
    pkIndex: 0,
    pkScore: [0, 0],
    pkStage: "aim",
  };
}

const balanced: LiveIntensity = {
  fluidDefense: 40,
  attackPress: 45,
  teamWidth: 50,
  tempo: 50,
  mentality: 50,
  directness: 50,
  focus: 0,
  defensiveLine: 50,
  counter: 50,
};

describe("continuous arena movement", () => {
  test("players accelerate toward a target instead of teleporting", () => {
    const state = arena();
    const before = state.dots[1].x;
    updateArenaMovement(state, [balanced, balanced], 0.1);
    expect(state.dots[1].vx).toBeGreaterThan(0);
    expect(state.dots[1].x).toBeGreaterThan(before);
    expect(state.dots[1].x - before).toBeLessThan(1);
  });

  test("both teams contest a genuinely loose ball", () => {
    const state = arena();
    state.ball.owner = -1;
    state.ball.flightTarget = null;
    state.ball.flightTo = -1;
    state.ball.x = 52;
    state.ball.y = 52;
    updateArenaMovement(state, [balanced, balanced], 0.1);
    expect(state.dots.some((player) => player.team === 0 && player.action === "press")).toBe(true);
    expect(state.dots.some((player) => player.team === 1 && player.action === "press")).toBe(true);
  });

  test("high pressure visibly sends a second defender to the ball", () => {
    const lowState = arena();
    const highState = arena();
    updateArenaMovement(
      lowState,
      [balanced, { ...balanced, attackPress: 40 }],
      0.1,
    );
    updateArenaMovement(
      highState,
      [balanced, { ...balanced, attackPress: 82 }],
      0.1,
    );
    expect(
      lowState.dots.filter((player) => player.action === "press"),
    ).toHaveLength(1);
    expect(
      highState.dots.filter((player) => player.action === "press"),
    ).toHaveLength(2);
  });

  test("players retain a minimum separation instead of overlapping", () => {
    const state = arena();
    state.dots[4].x = state.dots[5].x;
    state.dots[4].y = state.dots[5].y;
    state.dots[5].x += 0.05;
    updateArenaMovement(state, [balanced, balanced], 0.1);
    const distance = Math.hypot(
      state.dots[4].x - state.dots[5].x,
      state.dots[4].y - state.dots[5].y,
    );
    expect(distance).toBeGreaterThan(1.5);
  });
});
