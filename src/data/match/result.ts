import { simulatePeriod } from "./eventEngine";
import { combineLiveSnapshots, combinePlayerStats, selectPlayerOfMatch } from "./liveStats";
import { simulatePenalties } from "./penalties";
import { mulberry32 } from "./random";
import { combineTeamStatsPair } from "./stats";
import { tacticsForSide } from "./tactics";
import { combineTracks } from "./world/worldTrack";
import type {
  HalfResult,
  MatchSide,
  PlayerMatchStats,
  SimComparison,
  SimInput,
  SimResult,
} from "./types";

function continuationInput(
  input: SimInput,
  playerStats: PlayerMatchStats[],
  minute: number,
): SimInput {
  const statsByPlayer = new Map(
    playerStats.map((stat) => [`${stat.side}:${stat.playerId}`, stat]),
  );
  const prepareSide = (side: MatchSide, players: SimInput["placed"]) => players
    .filter((player) => {
      const stat = statsByPlayer.get(`${side}:${player.playerId}`);
      return !stat || (stat.redCards === 0 && stat.injuries === 0);
    })
    .map((player) => {
      const stat = statsByPlayer.get(`${side}:${player.playerId}`);
      return {
        ...player,
        condition: stat?.condition ?? player.condition,
        enteredAtMinute: minute,
      };
    });
  const inheritedCautions = (side: MatchSide) => Object.fromEntries(
    playerStats
      .filter((stat) => stat.side === side && stat.yellowCards > 0 && stat.redCards === 0)
      .map((stat) => [stat.playerId, stat.yellowCards]),
  );

  return {
    ...input,
    placed: prepareSide("user", input.placed),
    oppPlaced: prepareSide("opp", input.oppPlaced),
    initialYellowCards: {
      user: inheritedCautions("user"),
      opp: inheritedCautions("opp"),
    },
  };
}

export function combineHalves(input: SimInput, firstHalf: HalfResult, secondHalf: HalfResult): SimResult {
  const userGoals = firstHalf.userGoals + secondHalf.userGoals;
  const oppGoals = firstHalf.oppGoals + secondHalf.oppGoals;
  const goals = [...firstHalf.goals, ...secondHalf.goals].sort((a, b) => a.minute - b.minute);
  const events = [...firstHalf.events, ...secondHalf.events].sort((a, b) => a.minute - b.minute);
  const positionSamples = [...firstHalf.positionSamples, ...secondHalf.positionSamples].sort((a, b) => a.minute - b.minute);
  const track = combineTracks(firstHalf.track, secondHalf.track);
  const userXg = firstHalf.userXg + secondHalf.userXg;
  const oppXg = firstHalf.oppXg + secondHalf.oppXg;
  const outcome = userGoals > oppGoals ? "W" : userGoals < oppGoals ? "L" : "D";
  const playerStats = combinePlayerStats(firstHalf.playerStats, secondHalf.playerStats);

  return {
    userGoals,
    oppGoals,
    regulationUserGoals: userGoals,
    regulationOppGoals: oppGoals,
    userXg,
    oppXg,
    goals,
    events,
    positionSamples,
    track,
    comparison: buildComparison(input, userGoals, oppGoals, outcome),
    teamStats: combineTeamStatsPair(firstHalf.teamStats, secondHalf.teamStats),
    playerStats,
    playerOfMatch: selectPlayerOfMatch(playerStats),
    liveSnapshots: combineLiveSnapshots(firstHalf.liveSnapshots, secondHalf.liveSnapshots),
    wentToExtraTime: false,
    penalties: null,
  };
}

export function combinePeriods(previous: HalfResult | null, next: HalfResult): HalfResult {
  if (!previous) return next;
  return {
    goals: [...previous.goals, ...next.goals].sort((a, b) => a.minute - b.minute),
    events: [...previous.events, ...next.events].sort(
      (a, b) =>
        (a.timestamp ?? a.minute) - (b.timestamp ?? b.minute),
    ),
    positionSamples: [...previous.positionSamples, ...next.positionSamples].sort((a, b) => a.minute - b.minute),
    track: combineTracks(previous.track, next.track),
    userGoals: previous.userGoals + next.userGoals,
    oppGoals: previous.oppGoals + next.oppGoals,
    userXg: previous.userXg + next.userXg,
    oppXg: previous.oppXg + next.oppXg,
    teamStats: combineTeamStatsPair(previous.teamStats, next.teamStats),
    playerStats: combinePlayerStats(previous.playerStats, next.playerStats),
    liveSnapshots: combineLiveSnapshots(previous.liveSnapshots, next.liveSnapshots),
  };
}

export function combineExtraTime(input: SimInput, base: SimResult, extraTime: HalfResult): SimResult {
  const userGoals = base.userGoals + extraTime.userGoals;
  const oppGoals = base.oppGoals + extraTime.oppGoals;
  const goals = [...base.goals, ...extraTime.goals].sort((a, b) => a.minute - b.minute);
  const events = [...base.events, ...extraTime.events].sort((a, b) => a.minute - b.minute);
  const positionSamples = [...base.positionSamples, ...extraTime.positionSamples].sort((a, b) => a.minute - b.minute);
  const track = combineTracks(base.track, extraTime.track);
  const outcome = userGoals > oppGoals ? "W" : userGoals < oppGoals ? "L" : "D";
  const playerStats = combinePlayerStats(base.playerStats, extraTime.playerStats);
  const penalties = userGoals === oppGoals
    ? simulatePenalties(
        mulberry32((input.seed + 9_000029) >>> 0),
        continuationInput(input, playerStats, 120),
      )
    : null;

  return {
    ...base,
    userGoals,
    oppGoals,
    userXg: base.userXg + extraTime.userXg,
    oppXg: base.oppXg + extraTime.oppXg,
    goals,
    events,
    positionSamples,
    track,
    comparison: buildComparison(input, userGoals, oppGoals, outcome),
    teamStats: combineTeamStatsPair(base.teamStats, extraTime.teamStats),
    playerStats,
    playerOfMatch: selectPlayerOfMatch(playerStats),
    liveSnapshots: combineLiveSnapshots(base.liveSnapshots, extraTime.liveSnapshots),
    wentToExtraTime: true,
    penalties,
  };
}

export function applyExtraTime(input: SimInput, base: SimResult): SimResult {
  if (!input.isKnockout || base.userGoals !== base.oppGoals) return base;

  const extraTimeInput = continuationInput(input, base.playerStats, 90);
  return combineExtraTime(
    input,
    base,
    simulatePeriod(extraTimeInput, 91, 120, 9_000029),
  );
}

function buildComparison(
  input: SimInput,
  simulatedUserGoals: number,
  simulatedOppGoals: number,
  simulatedOutcome: "W" | "D" | "L"
): SimComparison {
  const effectiveAttackBias = input.attackBias + tacticsForSide(input, "user").attackBias;
  const biasWord =
    effectiveAttackBias >= 0.7
      ? "초공격적"
      : effectiveAttackBias >= 0.3
        ? "공격적"
        : effectiveAttackBias <= -0.5
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
