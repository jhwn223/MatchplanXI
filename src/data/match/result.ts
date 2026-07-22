import { simulatePeriod } from "./eventEngine";
import { combineLiveSnapshots, combinePlayerStats } from "./liveStats";
import { simulatePenalties } from "./penalties";
import { mulberry32 } from "./random";
import { combineTeamStats } from "./stats";
import type { HalfResult, SimComparison, SimInput, SimResult } from "./types";

export function combineHalves(input: SimInput, firstHalf: HalfResult, secondHalf: HalfResult): SimResult {
  const userGoals = firstHalf.userGoals + secondHalf.userGoals;
  const oppGoals = firstHalf.oppGoals + secondHalf.oppGoals;
  const goals = [...firstHalf.goals, ...secondHalf.goals].sort((a, b) => a.minute - b.minute);
  const events = [...firstHalf.events, ...secondHalf.events].sort((a, b) => a.minute - b.minute);
  const userXg = firstHalf.userXg + secondHalf.userXg;
  const oppXg = firstHalf.oppXg + secondHalf.oppXg;
  const outcome = userGoals > oppGoals ? "W" : userGoals < oppGoals ? "L" : "D";

  return {
    userGoals,
    oppGoals,
    regulationUserGoals: userGoals,
    regulationOppGoals: oppGoals,
    userXg,
    oppXg,
    goals,
    events,
    comparison: buildComparison(input, userGoals, oppGoals, outcome),
    teamStats: {
      user: combineTeamStats(firstHalf.teamStats.user, secondHalf.teamStats.user),
      opp: combineTeamStats(firstHalf.teamStats.opp, secondHalf.teamStats.opp),
    },
    playerStats: combinePlayerStats(firstHalf.playerStats, secondHalf.playerStats),
    liveSnapshots: combineLiveSnapshots(firstHalf.liveSnapshots, secondHalf.liveSnapshots),
    wentToExtraTime: false,
    penalties: null,
  };
}

export function applyExtraTime(input: SimInput, base: SimResult): SimResult {
  if (!input.isKnockout || base.userGoals !== base.oppGoals) return base;

  const extraTime = simulatePeriod(input, 91, 120, 9_000029);
  const userGoals = base.userGoals + extraTime.userGoals;
  const oppGoals = base.oppGoals + extraTime.oppGoals;
  const goals = [...base.goals, ...extraTime.goals].sort((a, b) => a.minute - b.minute);
  const events = [...base.events, ...extraTime.events].sort((a, b) => a.minute - b.minute);
  const penalties = userGoals === oppGoals
    ? simulatePenalties(mulberry32((input.seed + 9_000029) >>> 0), input)
    : null;
  const outcome = userGoals > oppGoals ? "W" : userGoals < oppGoals ? "L" : "D";
  const userXg = base.userXg + extraTime.userXg;
  const oppXg = base.oppXg + extraTime.oppXg;

  return {
    ...base,
    userGoals,
    oppGoals,
    userXg,
    oppXg,
    goals,
    events,
    comparison: buildComparison(input, userGoals, oppGoals, outcome),
    teamStats: {
      user: combineTeamStats(base.teamStats.user, extraTime.teamStats.user, 3, 1),
      opp: combineTeamStats(base.teamStats.opp, extraTime.teamStats.opp, 3, 1),
    },
    playerStats: combinePlayerStats(base.playerStats, extraTime.playerStats),
    liveSnapshots: combineLiveSnapshots(base.liveSnapshots, extraTime.liveSnapshots),
    wentToExtraTime: true,
    penalties,
  };
}

function buildComparison(
  input: SimInput,
  simulatedUserGoals: number,
  simulatedOppGoals: number,
  simulatedOutcome: "W" | "D" | "L"
): SimComparison {
  const biasWord =
    input.attackBias >= 0.7
      ? "초공격적"
      : input.attackBias >= 0.3
        ? "공격적"
        : input.attackBias <= -0.5
          ? "수비적"
          : "균형잡힌";
  const conditionWord =
    input.conditionIndex >= 75
      ? "최상의 컨디션"
      : input.conditionIndex >= 60
        ? "양호한 컨디션"
        : input.conditionIndex >= 45
          ? "주의가 필요한 컨디션"
          : "위험한 컨디션";
  const tacticsNote = `${biasWord} 전술 · 평균 ${conditionWord}(${Math.round(input.conditionIndex)})${
    input.elevation >= 1500 ? ` · 해발 ${input.elevation}m 고지대` : ""
  }`;

  if (!input.actual) {
    return {
      hasActual: false,
      simOutcome: simulatedOutcome,
      verdict: "이 경기는 실제 결과가 없습니다 (예정된 경기).",
      tacticsNote,
    };
  }

  const actualUserGoals = input.actual.userGoals;
  const actualOppGoals = input.actual.oppGoals;
  const actualOutcome = actualUserGoals > actualOppGoals ? "W" : actualUserGoals < actualOppGoals ? "L" : "D";
  const outcomeMatched = simulatedOutcome === actualOutcome;
  const outcomeKo = (outcome: "W" | "D" | "L") =>
    outcome === "W" ? "승리" : outcome === "D" ? "무승부" : "패배";

  let verdict: string;
  if (simulatedUserGoals === actualUserGoals && simulatedOppGoals === actualOppGoals) {
    verdict = "🎯 스코어까지 정확히 일치! 당신의 전술은 실제 경기를 그대로 재현했습니다.";
  } else if (outcomeMatched) {
    verdict = `✅ 결과 일치 — 실제도 ${outcomeKo(actualOutcome)}였습니다. 스코어는 시뮬 ${simulatedUserGoals}-${simulatedOppGoals} / 실제 ${actualUserGoals}-${actualOppGoals}.`;
  } else {
    const simulatedGoalDifference = simulatedUserGoals - simulatedOppGoals;
    const actualGoalDifference = actualUserGoals - actualOppGoals;
    verdict = simulatedGoalDifference > actualGoalDifference
      ? `📈 당신의 전술이 실제보다 더 좋은 결과를 냈습니다 (시뮬 ${simulatedUserGoals}-${simulatedOppGoals} / 실제 ${actualUserGoals}-${actualOppGoals}).`
      : `📉 실제 경기가 더 좋았습니다 (시뮬 ${simulatedUserGoals}-${simulatedOppGoals} / 실제 ${actualUserGoals}-${actualOppGoals}). 전술을 조정해 보세요.`;
  }

  return {
    hasActual: true,
    actualUserGoals,
    actualOppGoals,
    simOutcome: simulatedOutcome,
    actualOutcome,
    outcomeMatched,
    verdict,
    tacticsNote,
  };
}
