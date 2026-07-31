import { describe, expect, test, vi } from "vitest";
import type { MatchEvent } from "../../data/matchSim";
import {
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
    vision: 70,
    positioning: 70,
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
    dots: [dot(1, 0, 30), dot(2, 0, 55), dot(3, 1, 96), dot(4, 1, 65)],
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
  test("an opening recovery by the other side flies the kickoff ball instead of teleporting it", () => {
    const arena = state();
    const opening = event({
      type: "recovery",
      side: "opp",
      actorId: 4,
      actor: "Player 4",
      targetId: undefined,
      target: undefined,
    });
    expect(prepareEventActor(arena, opening)).toBe(true);
    projectMatchEvent(arena, opening, vi.fn());
    expect(arena.ball.flightTarget).toMatchObject({
      fromX: 30,
      fromY: 50,
      x: 65,
      y: 50,
      owner: 3,
    });
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

  test("an extreme receiver velocity cannot launch the pass across the pitch", () => {
    const arena = state();
    arena.dots[1].vx = 900;
    arena.dots[1].vy = -900;
    projectMatchEvent(arena, event({ passType: "through" }), vi.fn());
    expect(arena.ball.flightTarget?.x).toBe(60);
    expect(arena.ball.flightTarget?.y).toBe(45);
  });

  test("a failed pass travels to the recorded end coordinates without guessing a recoverer", () => {
    const arena = state();
    projectMatchEvent(arena, event({ success: false, endX: 61, endY: 72 }), vi.fn());
    expect(arena.ball.flightTo).toBe(-1);
    // No side ever "invents" who wins the loose ball here — the ball just
    // travels to the engine's recorded endX/endY. Whichever event comes next
    // (an interception, a recovery) claims it using its own real actorId.
    expect(arena.ball.flightTarget).toMatchObject({
      fromX: 30,
      fromY: 50,
      x: 59,
      y: 74,
      owner: null,
      elapsed: 0,
    });
  });

  test("out-of-play end coordinates are still projected as recorded, without a throw-in restart", () => {
    const arena = state();
    projectMatchEvent(
      arena,
      event({ success: false, endX: 61, endY: 102 }),
      vi.fn(),
    );
    expect(arena.ball.flightTarget).toMatchObject({
      fromX: 30,
      fromY: 50,
      x: 59,
      y: 102,
      owner: null,
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

  test("an offside restart is taken by the nearest defending outfielder, never the goalkeeper", () => {
    const arena = state();
    projectMatchEvent(
      arena,
      event({ type: "offside", x: 68, y: 52, endX: 68, endY: 52 }),
      vi.fn(),
    );
    expect(arena.situation).toMatchObject({
      type: "offside",
      side: 1,
      actor: 3,
      elapsed: 0,
    });
    expect(arena.situation?.actor).not.toBe(2);
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
});
