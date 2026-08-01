import type { MatchEvent, MatchSide } from "../data/matchSim";

export type PlayerDiscipline = "yellow" | "red";

/** Red always wins over yellow, including a second-yellow dismissal event. */
export function disciplineFromEvents(
  events: MatchEvent[] | undefined,
  side: MatchSide = "user",
): Map<number, PlayerDiscipline> {
  const cards = new Map<number, PlayerDiscipline>();
  for (const event of events ?? []) {
    if (event.side !== side || (event.type !== "yellowCard" && event.type !== "redCard")) continue;
    if (event.type === "redCard" || cards.get(event.actorId) !== "red") {
      cards.set(event.actorId, event.type === "redCard" ? "red" : "yellow");
    }
  }
  return cards;
}
