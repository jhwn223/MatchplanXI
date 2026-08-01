import { describe, expect, test } from "vitest";
import type { PositionSample } from "../../data/matchSim";
import {
  indexPositionSamples,
  interpolatePositionTargets,
  updateArenaMovement,
} from "./arenaMovement";
import type { ArenaDot, ArenaState } from "./runtimeTypes";

function dot(
  playerId: number,
  team: 0 | 1,
  x: number,
  y = 50,
  role: ArenaDot["role"] = "MID",
): ArenaDot {
  return {
    playerId,
    team,
    x,
    y,
    vx: 0,
    vy: 0,
    facing: 0,
    hx: x,
    hy: y,
    num: playerId,
    name: `Player ${playerId}`,
    role,
    react: 1,
    pace: 75,
    passing: 72,
    vision: 72,
    positioning: 72,
    dribbling: 72,
    shooting: 70,
    defending: 70,
    goalkeeping: 10,
    stamina: 78,
    condition: 100,
    nz: 1,
    ph: 0,
    action: "idle",
    actionT: 0,
  };
}

function state(): ArenaState {
  return {
    clock: 10.5,
    phase: "play",
    celebrateT: 0,
    actionT: 0,
    score: [0, 0],
    nextGoal: 0,
    nextEvent: 0,
    dots: [dot(1, 0, 30), dot(2, 0, 60), dot(3, 1, 70, 60)],
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

describe("arena movement", () => {
  test("interpolates engine samples into tactical targets", () => {
    const samples: PositionSample[] = [
      { playerId: 1, playerName: "Player 1", side: "user", minute: 10, x: 30, y: 40 },
      { playerId: 1, playerName: "Player 1", side: "user", minute: 11, x: 50, y: 60 },
    ];
    const targets = interpolatePositionTargets(indexPositionSamples(samples), 10.5);
    expect(targets.get(1)).toEqual({ x: 40, y: 50 });
  });

  test("moves toward a sample without teleporting or producing impossible velocity", () => {
    const arena = state();
    const targets = new Map([[1, { x: 90, y: 80 }]]);
    updateArenaMovement(arena, targets, 1 / 60);
    expect(arena.dots[0].x).toBeGreaterThan(30);
    expect(arena.dots[0].x).toBeLessThan(31);
    expect(Math.hypot(arena.dots[0].vx, arena.dots[0].vy)).toBeLessThanOrEqual(18);
  });

  test("scripted receivers override the tactical sample and reach the ball", () => {
    const arena = state();
    arena.scriptedRun = {
      actor: 1,
      x: 44,
      y: 50,
      action: "receive",
      claimBall: true,
      elapsed: 0,
    };
    const misleadingSample = new Map([[2, { x: 85, y: 80 }]]);
    for (let frame = 0; frame < 240; frame++) {
      updateArenaMovement(arena, misleadingSample, 1 / 60);
    }
    expect(Math.abs(arena.dots[1].x - 44)).toBeLessThan(1);
    expect(Math.abs(arena.dots[1].y - 50)).toBeLessThan(1);
  });

  test("keeps support runners and defenders moving after reaching static samples", () => {
    const arena = state();
    const staticTargets = new Map([
      [1, { x: 30, y: 50 }],
      [2, { x: 60, y: 50 }],
      [3, { x: 70, y: 60 }],
    ]);
    const initialSupportX = arena.dots[1].x;
    const initialDefenderX = arena.dots[2].x;
    for (let frame = 0; frame < 120; frame++) {
      arena.time += 1 / 60;
      updateArenaMovement(arena, staticTargets, 1 / 60);
    }
    expect(Math.abs(arena.dots[1].x - initialSupportX)).toBeGreaterThan(1);
    expect(arena.dots[2].x).toBeLessThan(initialDefenderX - 2);
    expect(arena.dots[1].action).toBe("move");
    expect(arena.dots[2].action).toBe("press");
  });

  test("moves three compact lines with the ball and overlaps both teams", () => {
    const arena = state();
    arena.dots = [
      dot(10, 0, 8, 50, "GK"),
      dot(11, 0, 26, 35, "DEF"),
      dot(12, 0, 26, 65, "DEF"),
      dot(13, 0, 47, 35, "MID"),
      dot(14, 0, 47, 65, "MID"),
      dot(15, 0, 73, 50, "FWD"),
      dot(20, 1, 92, 50, "GK"),
      dot(21, 1, 74, 35, "DEF"),
      dot(22, 1, 74, 65, "DEF"),
      dot(23, 1, 53, 35, "MID"),
      dot(24, 1, 53, 65, "MID"),
      dot(25, 1, 27, 50, "FWD"),
    ];
    arena.ball.owner = 3;
    arena.ball.lastTeam = 0;
    arena.dots[3].x = 75;
    arena.ball.x = 75;
    const targets = new Map(arena.dots.map((player) => [player.playerId, { x: player.hx, y: player.hy }]));
    for (let frame = 0; frame < 240; frame++) {
      arena.time += 1 / 60;
      updateArenaMovement(arena, targets, 1 / 60);
    }
    const mean = (team: 0 | 1, role: ArenaDot["role"]) => {
      const line = arena.dots.filter((player) => player.team === team && player.role === role);
      return line.reduce((sum, player) => sum + player.x, 0) / line.length;
    };
    const userDefense = mean(0, "DEF");
    const userMidfield = mean(0, "MID");
    const userAttack = mean(0, "FWD");
    expect(userDefense).toBeGreaterThan(34);
    expect(userMidfield - userDefense).toBeLessThan(30);
    expect(userAttack - userMidfield).toBeLessThan(30);
    expect(Math.abs(userAttack - mean(1, "DEF"))).toBeLessThan(14);
    expect(arena.dots.find((player) => player.playerId === 10)?.x).toBeLessThanOrEqual(16);
    expect(arena.movement?.phaseByTeam).toEqual(["finalThird", "defensiveBlock"]);
  });

  test("keeps wide players in lane order while only presser and cover leave the block", () => {
    const arena = state();
    arena.dots = [
      dot(10, 0, 7, 50, "GK"),
      dot(11, 0, 25, 18, "DEF"),
      dot(12, 0, 25, 39, "DEF"),
      dot(13, 0, 25, 61, "DEF"),
      dot(14, 0, 25, 82, "DEF"),
      dot(15, 0, 48, 25, "MID"),
      dot(16, 0, 45, 50, "MID"),
      dot(17, 0, 48, 75, "MID"),
      dot(18, 0, 72, 20, "FWD"),
      dot(19, 0, 78, 50, "FWD"),
      dot(20, 0, 72, 80, "FWD"),
      dot(30, 1, 93, 50, "GK"),
      dot(31, 1, 75, 18, "DEF"),
      dot(32, 1, 75, 39, "DEF"),
      dot(33, 1, 75, 61, "DEF"),
      dot(34, 1, 75, 82, "DEF"),
      dot(35, 1, 52, 25, "MID"),
      dot(36, 1, 55, 50, "MID"),
      dot(37, 1, 52, 75, "MID"),
      dot(38, 1, 28, 20, "FWD"),
      dot(39, 1, 22, 50, "FWD"),
      dot(40, 1, 28, 80, "FWD"),
    ];
    arena.ball.owner = 6;
    arena.ball.lastTeam = 0;
    arena.ball.x = arena.dots[6].x = 58;
    arena.ball.y = arena.dots[6].y = 46;

    for (let frame = 0; frame < 210; frame++) {
      arena.time += 1 / 60;
      updateArenaMovement(arena, new Map(), 1 / 60);
    }

    const opponentOutfield = arena.dots.filter((player) => player.team === 1 && player.role !== "GK");
    expect(opponentOutfield.filter((player) => player.defensiveRole === "marker").length).toBeLessThanOrEqual(3);
    expect(opponentOutfield.filter((player) =>
      player.defensiveRole === "presser" || player.defensiveRole === "cover"
    )).toHaveLength(2);
    const lanes = opponentOutfield
      .filter((player) => player.role === "DEF")
      .sort((a, b) => a.hy - b.hy)
      .map((player) => player.y);
    expect(lanes).toEqual([...lanes].sort((a, b) => a - b));
    expect(arena.dots.filter((player) =>
      player.role !== "GK" && Math.hypot(player.x - arena.ball.x, player.y - arena.ball.y) < 9
    ).length).toBeLessThanOrEqual(6);
  });

  test("an offside restart moves only its taker to the ball instead of clustering both teams", () => {
    const arena = state();
    arena.dots = [
      dot(10, 0, 6, 50, "GK"),
      dot(11, 0, 40, 25, "DEF"),
      dot(12, 0, 55, 50, "MID"),
      dot(13, 0, 64, 74, "FWD"),
      dot(20, 1, 94, 50, "GK"),
      dot(21, 1, 66, 50, "MID"),
      dot(22, 1, 86, 25, "DEF"),
      dot(23, 1, 78, 76, "MID"),
    ];
    arena.ball.owner = -1;
    arena.ball.x = 60;
    arena.ball.y = 50;
    arena.ball.lastTeam = 1;
    arena.situation = {
      type: "offside",
      side: 1,
      actor: 5,
      x: 60,
      y: 50,
      remaining: 0.5,
      elapsed: 0,
    };

    for (let frame = 0; frame < 60; frame++) {
      arena.time += 1 / 60;
      updateArenaMovement(arena, new Map(), 1 / 60);
    }

    expect(Math.hypot(arena.dots[5].x - 60, arena.dots[5].y - 50)).toBeLessThan(1);
    expect(Math.hypot(arena.dots[6].x - 60, arena.dots[6].y - 50)).toBeGreaterThan(18);
    expect(Math.hypot(arena.dots[7].x - 60, arena.dots[7].y - 50)).toBeGreaterThan(18);
  });
});
