import { describe, expect, test } from "vitest";
import { simulatePeriod } from "./eventEngine";
import { testInput, testTactics } from "./testFixtures";
import { trackPossession } from "./world/worldTrack";
import type { PlayerRole } from "../playerRoles";
import type { SimInput } from "./types";

const SAMPLE = 40;

function run(make: (seed: number) => SimInput, sample = SAMPLE) {
  return Array.from({ length: sample }, (_, seed) => simulatePeriod(make(seed * 977 + 3), 1, 90, 0));
}

const combined = (
  results: ReturnType<typeof run>,
  pick: (stats: (typeof results)[number]["teamStats"]["user"]) => number,
) => results.reduce((total, r) => total + pick(r.teamStats.user) + pick(r.teamStats.opp), 0) / results.length;

describe("possession responds to what the manager chose", () => {
  test("two identical sides finish level, but the average is not forced there", () => {
    const results = run((seed) => testInput(seed));
    const share = results.map((r) => r.teamStats.user.possession);
    const mean = share.reduce((s, v) => s + v, 0) / share.length;
    expect(mean).toBeGreaterThan(46);
    expect(mean).toBeLessThan(54);
    // Possession used to alternate by construction, which left the spread
    // almost flat. The maximum over a sample this size is too noisy to assert
    // on, so this reads the spread itself: a forced fifty-fifty sits well under
    // one point of deviation.
    const spread = Math.sqrt(
      share.reduce((sum, value) => sum + (value - mean) ** 2, 0) / share.length,
    );
    expect(spread).toBeGreaterThan(1.2);
  });

  test("a possession plan takes the ball off a direct one", () => {
    const results = run((seed) =>
      testInput(
        seed,
        74,
        74,
        testTactics({ directnessBias: -0.8, tempoBias: -0.5, pressBias: 0.3, compactnessBias: 0.3 }),
        testTactics({ directnessBias: 0.9, tempoBias: 0.6, pressBias: -0.3, defensiveLineBias: -0.4 }),
      ),
    );
    const share = results.reduce((s, r) => s + r.teamStats.user.possession, 0) / results.length;
    expect(share).toBeGreaterThan(58);
    // The ball-time recording and the touch count are computed independently,
    // so they are a check on each other.
    const byTime = results.reduce((s, r) => s + trackPossession(r.track!).user * 100, 0) / results.length;
    expect(byTime).toBeCloseTo(share, -0.7);
  });

  test("a much stronger side keeps the ball", () => {
    const results = run((seed) => {
      const match = testInput(seed, 80, 66);
      match.userElo = 1880;
      match.oppElo = 1580;
      return match;
    });
    expect(results.reduce((s, r) => s + r.teamStats.user.possession, 0) / results.length)
      .toBeGreaterThan(60);
  });
});

describe("football's own frequencies", () => {
  const results = run((seed) => testInput(seed), 60);

  test("a failed pass is usually misplaced, not intercepted", () => {
    // Every failed pass in an attacking move was credited as an interception,
    // which put 223 of them in a match against the 40-50 a real one has.
    const interceptions = combined(results, (s) => s.interceptions);
    expect(interceptions).toBeGreaterThan(30);
    expect(interceptions).toBeLessThan(70);
    const failed = combined(results, (s) => s.passesAttempted - s.passesCompleted);
    expect(interceptions / failed).toBeLessThan(0.35);
  });

  test("corners and fouls arrive at something like a real rate", () => {
    // Corners came only from blocked and saved shots, so a match had four.
    // Most of football's come from a defender clearing his lines.
    expect(combined(results, (s) => s.corners)).toBeGreaterThan(7);
    expect(combined(results, (s) => s.corners)).toBeLessThan(14);
    expect(combined(results, (s) => s.fouls)).toBeGreaterThan(15);
    expect(combined(results, (s) => s.fouls)).toBeLessThan(26);
  });
});

describe("roles change what a player does, not only where he stands", () => {
  const withRoles = (seed: number, midfield: PlayerRole, forward: PlayerRole): SimInput => {
    const input = testInput(seed);
    input.placed = input.placed.map((player) => ({
      ...player,
      tacticalRole:
        player.position === "MID" ? midfield
          : player.position === "FWD" ? forward
            : player.tacticalRole,
    }));
    return input;
  };
  const midfieldTotals = (midfield: PlayerRole, forward: PlayerRole) => {
    const results = run((seed) => withRoles(seed, midfield, forward), 30);
    const sum = (pick: (stat: (typeof results)[number]["playerStats"][number]) => number) =>
      results.reduce(
        (total, result) =>
          total +
          result.playerStats
            .filter((stat) => stat.side === "user" && stat.position === "MID")
            .reduce((inner, stat) => inner + pick(stat), 0),
        0,
      ) / results.length;
    return {
      tackles: sum((s) => s.tacklesWon),
      dribbles: sum((s) => s.dribblesAttempted),
      fouls: sum((s) => s.foulsCommitted),
    };
  };

  const holders = midfieldTotals("anchor", "targetForward");
  const playmakers = midfieldTotals("centralPlaymaker", "falseNine");
  const ballWinners = midfieldTotals("ballWinner", "pressingForward");

  test("a ball winner really does win more balls than a playmaker", () => {
    expect(ballWinners.tackles).toBeGreaterThan(playmakers.tackles * 1.2);
    // And gives away more free kicks for it, so the role is a trade.
    expect(ballWinners.fouls).toBeGreaterThan(playmakers.fouls);
  });

  test("a playmaker takes his man on far more often than a holding player", () => {
    expect(playmakers.dribbles).toBeGreaterThan(holders.dribbles * 1.4);
  });
});

describe("sendings-off stay as rare as football's", () => {
  const reds = (results: ReturnType<typeof run>) => {
    let total = 0;
    let secondBookings = 0;
    for (const result of results) {
      const booked = new Set<string>();
      for (const event of result.events) {
        const key = `${event.side}:${event.actorId}`;
        if (event.type === "yellowCard") booked.add(key);
        if (event.type === "redCard") {
          total++;
          if (booked.has(key)) secondBookings++;
        }
      }
    }
    return { perMatch: total / results.length, secondBookingShare: secondBookings / Math.max(1, total) };
  };

  test("a normal match sees one about every ten, and mostly a straight red", () => {
    const { perMatch, secondBookingShare } = reds(run((seed) => testInput(seed), 120));
    expect(perMatch).toBeGreaterThan(0.03);
    expect(perMatch).toBeLessThan(0.22);
    // Football's sendings-off are mostly direct. While they were mostly second
    // bookings the count scaled with the square of the booking rate, and an
    // aggressive plan finished a man down in nearly half its matches.
    expect(secondBookingShare).toBeLessThan(0.5);
  });

  test("an aggressive tackling plan raises them without making them routine", () => {
    const aggressive = testTactics({ tacklingBias: 1, pressBias: 0.6 });
    const results = run((seed) => testInput(seed, 74, 74, aggressive, aggressive), 120);
    const { perMatch } = reds(results);
    expect(perMatch).toBeGreaterThan(reds(run((seed) => testInput(seed), 120)).perMatch);
    expect(perMatch).toBeLessThan(0.55);
  });
});
