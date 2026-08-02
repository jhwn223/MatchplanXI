import { describe, expect, it } from "vitest";
import { simulatePeriod } from "../eventEngine";
import { combinePeriods } from "../result";
import { testInput } from "../testFixtures";
import {
  BALL_DEAD,
  BALL_OPP,
  BALL_USER,
  ballDwell,
  playerDwell,
  sliceTrack,
  trackPossession,
} from "./worldTrack";

describe("world track", () => {
  const input = testInput(11);
  const half = simulatePeriod(input, 1, 45, 1);
  const track = half.track!;

  it("samples the ball twice a second and the players once a second", () => {
    expect(track.ballInterval).toBe(0.5);
    expect(track.playerInterval).toBe(1);
    // A 45-minute period, allowing for the action that runs past the whistle.
    expect(track.ballFrames).toBeGreaterThan(5_300);
    expect(track.ballFrames).toBeLessThan(5_800);
    expect(track.playerFrames * 2).toBeCloseTo(track.ballFrames, -1);
    expect(track.players).toHaveLength(22);
    expect(track.positions).toHaveLength(track.playerFrames * 22 * 2);
  });

  it("keeps every sample on the pitch", () => {
    for (let frame = 0; frame < track.ballFrames; frame++) {
      expect(track.ball[frame * 2]).toBeGreaterThanOrEqual(0);
      expect(track.ball[frame * 2]).toBeLessThanOrEqual(100);
      expect(track.ball[frame * 2 + 1]).toBeGreaterThanOrEqual(0);
      expect(track.ball[frame * 2 + 1]).toBeLessThanOrEqual(100);
    }
  });

  it("marks stoppages so dead time stays out of the heat maps", () => {
    let dead = 0;
    for (let frame = 0; frame < track.ballFrames; frame++) {
      if (track.ballOwner[frame] === BALL_DEAD) dead++;
    }
    // Restarts, goal kicks and celebrations cost real minutes, but most of a
    // half is still played.
    expect(dead / track.ballFrames).toBeGreaterThan(0.05);
    expect(dead / track.ballFrames).toBeLessThan(0.4);
    expect(ballDwell(track)).toHaveLength(track.ballFrames - dead);
  });

  it("agrees with the possession the match stats report", () => {
    const fromTrack = trackPossession(track);
    expect(fromTrack.user * 100).toBeCloseTo(half.teamStats.user.possession, -0.6);
  });

  it("attributes ball time to the side and player holding it", () => {
    const user = ballDwell(track, { side: "user" });
    const opp = ballDwell(track, { side: "opp" });
    expect(user.length).toBeGreaterThan(1_000);
    expect(opp.length).toBeGreaterThan(1_000);
    for (let frame = 0; frame < track.ballFrames; frame++) {
      const owner = track.ballOwner[frame];
      if (owner === BALL_USER || owner === BALL_OPP) {
        expect(track.ballOwnerId[frame]).toBeGreaterThan(0);
      } else {
        expect(track.ballOwnerId[frame]).toBe(-1);
      }
    }
    const carrier = track.ballOwnerId[track.ballOwner.indexOf(BALL_USER)];
    const forCarrier = ballDwell(track, { side: "user", playerId: carrier });
    expect(forCarrier.length).toBeGreaterThan(0);
    expect(forCarrier.length).toBeLessThan(user.length);
  });

  it("weighs every point by the match time it stands for", () => {
    const points = ballDwell(track);
    const seconds = points.reduce((total, point) => total + point.seconds, 0);
    expect(seconds).toBeCloseTo(points.length * 0.5, 5);
    // Ten, not eleven: a whole-team map leaves the keeper out.
    const perPlayer = playerDwell(track, { side: "user" });
    expect(perPlayer).toHaveLength(track.playerFrames * 10);
    expect(perPlayer[0].seconds).toBe(1);
  });

  it("windows by minute and joins consecutive periods", () => {
    const early = ballDwell(track, { toMinute: 10 });
    expect(early.length).toBeGreaterThan(0);
    expect(early.length).toBeLessThan(ballDwell(track).length);

    const second = simulatePeriod(input, 46, 90, 2);
    const full = combinePeriods(half, second)!.track!;
    expect(full.ballFrames).toBe(track.ballFrames + second.track!.ballFrames);
    expect(full.startSecond).toBe(track.startSecond);

    const sliced = sliceTrack(full, 46)!;
    expect(sliced.startSecond).toBeGreaterThanOrEqual(45 * 60);
    expect(sliced.ballFrames).toBeLessThan(full.ballFrames);
    expect(ballDwell(sliced, { toMinute: 45 })).toHaveLength(0);
  });
});
