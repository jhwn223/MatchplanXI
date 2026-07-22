import type { PenaltyResult } from "../../data/matchSim";
import type { PenaltyKick } from "./runtimeTypes";

/**
 * Builds a plausible kick-by-kick sequence (user, opp, user, opp, ...) that lands
 * on the already-decided final penalty score. Purely for animation — the outcome
 * itself comes from data/match/penalties.ts.
 */
export function buildPenaltySequence(result: PenaltyResult, rng: () => number): PenaltyKick[] {
  const rounds = Math.max(5, result.userGoals, result.oppGoals);
  const sequence: PenaltyKick[] = [];
  let userScored = 0;
  let oppScored = 0;
  for (let round = 0; round < rounds; round++) {
    const remaining = rounds - round;
    const userNeeds = result.userGoals - userScored;
    const userScores = userNeeds > 0 && (userNeeds >= remaining || rng() < userNeeds / remaining);
    sequence.push({ team: 0, scored: userScores });
    if (userScores) userScored++;

    const oppNeeds = result.oppGoals - oppScored;
    const oppScores = oppNeeds > 0 && (oppNeeds >= remaining || rng() < oppNeeds / remaining);
    sequence.push({ team: 1, scored: oppScores });
    if (oppScores) oppScored++;
  }
  return sequence;
}
