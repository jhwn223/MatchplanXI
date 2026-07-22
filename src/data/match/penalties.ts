import { goalkeeper, outfield } from "./playerRuntime";
import { clamp } from "./random";
import type { PenaltyResult, PlacedPlayerLite, SimInput } from "./types";

export function simulatePenalties(rng: () => number, input: SimInput): PenaltyResult {
  const userTakers = [...outfield(input.placed)].sort(
    (a, b) => b.penalties + b.composure - (a.penalties + a.composure)
  );
  const oppTakers = [...outfield(input.oppPlaced)].sort(
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
    const userKicksRemaining = 4 - index;
    const oppKicksRemainingBeforeKick = 5 - index;
    if (userGoals > oppGoals + oppKicksRemainingBeforeKick) {
      return { userGoals, oppGoals, winner: "user" };
    }
    if (oppGoals > userGoals + userKicksRemaining) {
      return { userGoals, oppGoals, winner: "opp" };
    }

    if (kick(oppTakers[index % oppTakers.length], userKeeper)) oppGoals++;
    const oppKicksRemaining = 4 - index;
    if (userGoals > oppGoals + oppKicksRemaining) {
      return { userGoals, oppGoals, winner: "user" };
    }
    if (oppGoals > userGoals + userKicksRemaining) {
      return { userGoals, oppGoals, winner: "opp" };
    }
  }

  if (userGoals !== oppGoals) {
    return { userGoals, oppGoals, winner: userGoals > oppGoals ? "user" : "opp" };
  }

  for (let round = 5; round < 105; round++) {
    if (kick(userTakers[round % userTakers.length], oppKeeper)) userGoals++;
    if (kick(oppTakers[round % oppTakers.length], userKeeper)) oppGoals++;
    if (userGoals !== oppGoals) {
      return { userGoals, oppGoals, winner: userGoals > oppGoals ? "user" : "opp" };
    }
  }

  // A seeded RNG will practically never reach this guard. Keep the public helper
  // total for deterministic test RNGs while preserving a score that matches the winner.
  if (rng() < 0.5) {
    return { userGoals: userGoals + 1, oppGoals, winner: "user" };
  }
  return { userGoals, oppGoals: oppGoals + 1, winner: "opp" };
}
