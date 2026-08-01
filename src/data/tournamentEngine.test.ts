import { describe, expect, test } from "vitest";
import type { TournamentData } from "./types";
import { buildBracket, champion, type KOTeam } from "./tournamentEngine";

const data: TournamentData = {
  teams: [],
  players: [],
  matches: [],
  lineups: [],
  predictionFeatures: [],
  venues: [
    {
      venue_id: 1,
      stadium_name: "Test Stadium",
      city: "Test City",
      country: "Test",
      capacity: 50_000,
      latitude: 0,
      longitude: 0,
      elevation_meters: 0,
    },
  ],
};

const qualifiers: KOTeam[] = Array.from({ length: 32 }, (_, index) => ({
  name: `Team ${index + 1}`,
  code: `T${index + 1}`,
  elo: 1900 - index * 10,
  group: String.fromCharCode(65 + (index % 12)),
  pos: index < 12 ? 1 : index < 24 ? 2 : 3,
}));

describe("2026 tournament bracket", () => {
  test("creates a Round of 32, final, and third-place play-off", () => {
    const rounds = buildBracket(data, qualifiers, {}, "No user team");
    expect(rounds.map((round) => round.length)).toEqual([16, 8, 4, 2, 2]);
    expect(rounds[0].every((match) => match.a?.group !== match.b?.group)).toBe(true);
    expect(rounds[4].find((match) => match.placement === "final")?.played).toBe(true);
    expect(rounds[4].find((match) => match.placement === "third")?.played).toBe(true);
    expect(champion(rounds)).not.toBeNull();
  });

  test("keeps one tournament stable but varies simulated results for a new tournament seed", () => {
    const first = buildBracket(data, qualifiers, {}, "No user team", 1234);
    const replay = buildBracket(data, qualifiers, {}, "No user team", 1234);
    const nextTournament = buildBracket(data, qualifiers, {}, "No user team", 9876);
    const signature = (rounds: ReturnType<typeof buildBracket>) =>
      rounds.flat().map((match) => `${match.aGoals}-${match.bGoals}:${match.winner?.name}`).join("|");

    expect(signature(replay)).toBe(signature(first));
    expect(signature(nextTournament)).not.toBe(signature(first));
  });
});
