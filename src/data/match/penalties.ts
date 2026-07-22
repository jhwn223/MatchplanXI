import { goalkeeper, outfield } from "./playerRuntime";
import { clamp } from "./random";
import type { PenaltyResult, PlacedPlayerLite, SimInput } from "./types";

export function simulatePenalties(rng: () => number, input: SimInput): PenaltyResult {
  const userTakers = outfield(input.placed).sort(
    (a, b) => b.penalties + b.composure - (a.penalties + a.composure)
  );
  const oppTakers = outfield(input.oppPlaced).sort(
    (a, b) => b.penalties + b.composure - (a.penalties + a.composure)
  );
  const userKeeper = goalkeeper(input.placed);
  const oppKeeper = goalkeeper(input.oppPlaced);
  const kick = (taker: PlacedPlayerLite, keeperPlayer: PlacedPlayerLite) => {
    const takerSkill = taker.penalties * 0.55 + taker.composure * 0.3 + taker.finishing * 0.15;
    const keeperSkill =
      keeperPlayer.gkDiving * 0.25 +
      keeperPlayer.gkReflexes * 0.35 +
      keeperPlayer.gkPositioning * 0.25 +
      keeperPlayer.reactions * 0.15;
    return rng() < clamp(0.74 + (takerSkill - keeperSkill) / 190, 0.52, 0.93);
  };
  let userGoals = 0;
  let oppGoals = 0;
  for (let index = 0; index < 5; index++) {
    if (kick(userTakers[index % userTakers.length], oppKeeper)) userGoals++;
    if (kick(oppTakers[index % oppTakers.length], userKeeper)) oppGoals++;
  }
  let guard = 0;
  while (userGoals === oppGoals && guard++ < 12) {
    if (kick(userTakers[guard % userTakers.length], oppKeeper)) userGoals++;
    if (kick(oppTakers[guard % oppTakers.length], userKeeper)) oppGoals++;
  }
  const winner = userGoals === oppGoals ? (rng() < 0.5 ? "user" : "opp") : userGoals > oppGoals ? "user" : "opp";
  return { userGoals, oppGoals, winner };
}
