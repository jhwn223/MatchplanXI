import { describe, expect, test } from "vitest";
import type { MatchEvent } from "../data/matchSim";
import { disciplineFromEvents } from "./playerDiscipline";

const card = (type: "yellowCard" | "redCard", actorId: number): MatchEvent => ({
  minute: 12,
  side: "user",
  type,
  actorId,
  actor: `Player ${actorId}`,
  detail: type,
  success: false,
});

describe("player discipline badges", () => {
  test("shows a red card instead of an earlier yellow card", () => {
    const cards = disciplineFromEvents([card("yellowCard", 7), card("redCard", 7)]);
    expect(cards.get(7)).toBe("red");
  });

  test("does not mix the opponent's cards into the user squad", () => {
    const opponentCard = { ...card("yellowCard", 9), side: "opp" as const };
    expect(disciplineFromEvents([opponentCard], "user").has(9)).toBe(false);
  });
});
