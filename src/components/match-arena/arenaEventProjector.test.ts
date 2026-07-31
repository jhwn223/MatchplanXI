import { describe, expect, test, vi } from "vitest";
import type { MatchEvent } from "../../data/matchSim";
import {
  alignOpeningPossession,
  eventPlaybackClock,
  prepareEventActor,
  projectMatchEvent,
} from "./arenaEventProjector";
import type { ArenaDot, ArenaState } from "./runtimeTypes";

function dot(playerId: number, team: 0 | 1, x: number): ArenaDot {
  return {
    playerId,
    team,
    x,
    y: 50,
    vx: 0,
    vy: 0,
    facing: 0,
    hx: x,
    hy: 50,
    num: playerId,
    name: `Player ${playerId}`,
    role: playerId === 3 ? "GK" : "MID",
    react: 1,
    pace: 70,
    passing: 70,
    dribbling: 70,
    shooting: 70,
    defending: 70,
    goalkeeping: playerId === 3 ? 75 : 10,
    stamina: 75,
    condition: 100,
    nz: 1,
    ph: 0,
    action: "idle",
    actionT: 0,
  };
}

function state(): ArenaState {
  return {
    clock: 0,
    phase: "play",
    celebrateT: 0,
    actionT: 0,
    score: [0, 0],
    nextGoal: 0,
    nextEvent: 0,
    dots: [dot(1, 0, 30), dot(2, 0, 55), dot(3, 1, 96)],
    ball: {
      x: 30,
      y: 50,
      previousX: 30,
      previousY: 50,
      owner: 0,
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

function event(overrides: Partial<MatchEvent> = {}): MatchEvent {
  return {
    minute: 12,
    side: "user",
    type: "pass",
    actorId: 1,
    actor: "Player 1",
    targetId: 2,
    target: "Player 2",
    detail: "pass",
    success: true,
    x: 32,
    y: 48,
    endX: 57,
    endY: 52,
    ...overrides,
  };
}

describe("arena event projection", () => {
  test("the opening event starts with a real owner instead of a frozen loose ball", () => {
    const arena = state();
    const opening = event({
      type: "recovery",
      actorId: 2,
      actor: "Player 2",
      targetId: undefined,
      target: undefined,
    });
    expect(alignOpeningPossession(arena, opening)).toBe(true);
    expect(arena.ball.owner).toBe(1);
    expect(arena.ball.x).toBe(55);
    projectMatchEvent(arena, opening, vi.fn());
    expect(arena.ball.owner).toBe(1);
    expect(arena.scriptedRun).toBeNull();
  });

  test("events in the same minute are spread over the visual minute", () => {
    const events = [event(), event({ type: "tackle" }), event({ type: "shot" })];
    expect(eventPlaybackClock(events, 0)).toBe(11.25);
    expect(eventPlaybackClock(events, 1)).toBe(11.5);
    expect(eventPlaybackClock(events, 2)).toBe(11.75);
  });

  test("a successful pass flies to the engine-selected teammate", () => {
    const arena = state();
    projectMatchEvent(arena, event(), vi.fn());
    expect(arena.ball.owner).toBe(-1);
    expect(arena.ball.flightTo).toBe(-1);
    expect(arena.ball.flightTarget).toMatchObject({
      fromX: 30,
      fromY: 50,
      x: 55,
      y: 50,
      owner: 1,
      elapsed: 0,
    });
    expect(arena.ball.scripted).toBe(true);
  });

  test("a failed pass continues directly to the nearest opponent", () => {
    const arena = state();
    projectMatchEvent(arena, event({ success: false, endX: 61, endY: 72 }), vi.fn());
    expect(arena.ball.flightTo).toBe(-1);
    expect(arena.ball.flightTarget).toMatchObject({
      fromX: 30,
      fromY: 50,
      x: 96,
      y: 50,
      owner: 2,
      elapsed: 0,
    });
  });

  test("legacy out-of-play coordinates do not start a throw-in", () => {
    const arena = state();
    projectMatchEvent(
      arena,
      event({ success: false, endX: 61, endY: 102 }),
      vi.fn(),
    );
    expect(arena.ball.flightTarget).toMatchObject({
      fromX: 30,
      fromY: 50,
      x: 96,
      y: 50,
      owner: 2,
    });
    expect(arena.situation).toBeUndefined();
  });

  test("event lookup uses stable player ids even when display names differ", () => {
    const arena = state();
    projectMatchEvent(
      arena,
      event({ actor: "Different name", target: "Another name" }),
      vi.fn(),
    );
    expect(arena.ball.flightTarget?.owner).toBe(1);
  });

  test("a possession handoff uses ball movement without a loose-ball state", () => {
    const arena = state();
    const nextPass = event({
      actorId: 2,
      actor: "Player 2",
      targetId: 1,
      target: "Player 1",
    });
    expect(prepareEventActor(arena, nextPass)).toBe(false);
    expect(arena.ball.owner).toBe(-1);
    expect(arena.ball.x).toBe(30);
    expect(arena.ball.y).toBe(50);
    expect(arena.scriptedRun).toBeUndefined();
    expect(arena.ball.flightTarget).toMatchObject({
      fromX: 30,
      fromY: 50,
      x: 55,
      y: 50,
      owner: 1,
    });
  });

  test("a corner creates a visible restart state before normal play resumes", () => {
    const arena = state();
    projectMatchEvent(
      arena,
      event({ type: "corner", x: 98, y: 3, endX: 98, endY: 3 }),
      vi.fn(),
    );
    expect(arena.situation).toMatchObject({
      type: "corner",
      side: 0,
      actor: 0,
      x: 98,
      y: 3,
    });
    expect(arena.ball.owner).toBe(-1);
    expect(arena.ball.flightTarget).toMatchObject({ x: 98, y: 3, chaser: 0 });
  });

  test("a shooter must carry the ball to the recorded box-area position", () => {
    const arena = state();
    const shot = event({
      type: "shot",
      targetId: 3,
      x: 82,
      y: 48,
      endX: 99,
      endY: 50,
    });
    expect(prepareEventActor(arena, shot)).toBe(false);
    expect(arena.scriptedRun).toMatchObject({
      actor: 0,
      x: 82,
      y: 48,
      action: "dribble",
    });
    expect(arena.ball.owner).toBe(0);
  });

  test("legacy throw-in events continue play without a restart situation", () => {
    const arena = state();
    const nearbyOutfielder = dot(4, 1, 61);
    nearbyOutfielder.y = 91;
    nearbyOutfielder.hy = 91;
    const recordedTaker = dot(5, 1, 86);
    recordedTaker.y = 44;
    recordedTaker.hy = 44;
    arena.dots.push(nearbyOutfielder, recordedTaker);
    arena.ball.x = 64;
    arena.ball.y = 102;
    projectMatchEvent(
      arena,
      event({
        type: "throwIn",
        side: "opp",
        actorId: 5,
        actor: "Player 5",
        targetId: undefined,
        target: undefined,
        x: 64,
        y: 97,
        endX: 64,
        endY: 97,
      }),
      vi.fn(),
    );
    expect(arena.situation).toBeUndefined();
    expect(arena.ball.flightTarget).toMatchObject({
      fromX: 64,
      fromY: 102,
      x: 61,
      y: 91,
      owner: 3,
    });
  });
});
