import { sliceTrack } from "../../data/matchSim";
import type { HalfResult, SimResult } from "../../data/matchSim";
import type { ArenaSim } from "../match-arena/types";

export function firstHalfArenaSim(half: HalfResult | null): ArenaSim | null {
  if (!half) return null;
  return {
    goals: half.goals,
    events: half.events,
    positionSamples: half.positionSamples,
    track: half.track,
    userGoals: half.userGoals,
    oppGoals: half.oppGoals,
    userXg: half.userXg,
    oppXg: half.oppXg,
    teamStats: half.teamStats,
    liveSnapshots: half.liveSnapshots,
    playerStats: half.playerStats,
  };
}

export function secondHalfArenaSim(half: HalfResult | null, regulation: SimResult | null): ArenaSim | null {
  if (!half || !regulation) return null;
  return {
    goals: half.goals,
    events: half.events,
    positionSamples: regulation.positionSamples,
    track: regulation.track,
    userGoals: regulation.userGoals,
    oppGoals: regulation.oppGoals,
    userXg: regulation.userXg,
    oppXg: regulation.oppXg,
    comparison: regulation.comparison,
    teamStats: regulation.teamStats,
    liveSnapshots: regulation.liveSnapshots,
    playerStats: regulation.playerStats,
    wentToExtraTime: regulation.wentToExtraTime,
    penalties: regulation.penalties,
    regulationUserGoals: regulation.regulationUserGoals,
    regulationOppGoals: regulation.regulationOppGoals,
  };
}

export function extraTimeArenaSim(result: SimResult | null): ArenaSim | null {
  if (!result) return null;
  return {
    goals: result.goals.filter((goal) => goal.minute > 90),
    events: result.events.filter((event) => event.minute > 90),
    positionSamples: result.positionSamples.filter((sample) => sample.minute > 90),
    track: sliceTrack(result.track, 91),
    userGoals: result.userGoals,
    oppGoals: result.oppGoals,
    userXg: result.userXg,
    oppXg: result.oppXg,
    comparison: result.comparison,
    teamStats: result.teamStats,
    liveSnapshots: result.liveSnapshots,
    playerStats: result.playerStats,
    wentToExtraTime: result.wentToExtraTime,
    penalties: result.penalties,
    regulationUserGoals: result.regulationUserGoals,
    regulationOppGoals: result.regulationOppGoals,
  };
}
