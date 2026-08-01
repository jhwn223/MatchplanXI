import type { ConditionBreakdown } from "../../data/conditionEngine";
import type { FormationKey } from "../../data/formation";
import { buildTeamAbilityProfile } from "../../data/playerAbility";
import type { LiveMatchSnapshot } from "../../data/matchSim";
import { getObservedFormation } from "../../data/opponentFormations";
import type { Player, Team } from "../../data/types";
import {
  applyQuickTactic,
  DEFAULT_TEAM_TACTICS,
  type TeamTactics,
} from "../match-arena/tactics";

export interface OpponentPlan {
  formation: FormationKey;
  formationSource: "observed" | "inferred";
  formationEvidence: {
    matchId: string;
    match: string;
    sourceName: string;
    sourceUrl: string;
  } | null;
  tactics: TeamTactics;
  identity: string;
  altitudeAdaptation: number;
  strengths: string[];
  weaknesses: string[];
  slowCenterBacks: boolean;
}

export interface OpponentTacticChange {
  minute: number;
  title: string;
  detail: string;
  tactics: TeamTactics;
}

interface BuildOpponentPlanOptions {
  team: Team;
  squad: Player[];
  referencePlayers?: Player[];
  elevation: number;
  isHome: boolean;
  seed: number;
}

interface TeamScoutMetrics {
  pace: number;
  passing: number;
  defending: number;
  physical: number;
  crossing: number;
  finishing: number;
  stamina: number;
  centerBackPace: number;
  aerialAttack: number;
  aerialDefense: number;
}

type ScoutMetric = keyof TeamScoutMetrics;

interface ScoutClaim {
  metric: ScoutMetric;
  label: string;
}

function average(values: number[], fallback = 70) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : fallback;
}

function abilityAverage(players: Player[], key: keyof NonNullable<Player["ability"]>, fallback = 70) {
  return average(
    players
      .map((player) => player.ability?.[key])
      .filter((value): value is number => typeof value === "number"),
    fallback
  );
}

function percentileRank(values: number[], target: number) {
  if (!values.length) return 0.5;
  const lower = values.filter((value) => value < target).length;
  const equal = values.filter((value) => value === target).length;
  return (lower + equal * 0.5) / values.length;
}

function validHeights(players: Player[]) {
  return players
    .map((player) => player.height_cm)
    .filter((height) => Number.isFinite(height) && height >= 150 && height <= 220);
}

function aerialScore(player: Player, referenceHeights: number[]) {
  const ability = player.ability;
  const heightPercentile = Number.isFinite(player.height_cm)
    ? percentileRank(referenceHeights, player.height_cm) * 100
    : 50;
  return (
    heightPercentile * 0.3 +
    (ability?.jumping ?? 70) * 0.3 +
    (ability?.headingAccuracy ?? 70) * 0.3 +
    (ability?.strength ?? ability?.physical ?? 70) * 0.1
  );
}

function bestAverage(values: number[], count: number, fallback = 70) {
  return average([...values].sort((a, b) => b - a).slice(0, count), fallback);
}

function scoutMetricsFor(squad: Player[], referenceHeights: number[]): TeamScoutMetrics {
  const defenders = squad.filter((player) => player.position === "DEF");
  const midfielders = squad.filter((player) => player.position === "MID");
  const forwards = squad.filter((player) => player.position === "FWD");
  const outfield = squad.filter((player) => player.position !== "GK");
  const centerBackCandidates = [...defenders]
    .sort((a, b) => (b.ability?.defending ?? 0) - (a.ability?.defending ?? 0))
    .slice(0, 3);

  return {
    pace: abilityAverage(squad, "pace"),
    passing: abilityAverage(midfielders, "passing"),
    defending: abilityAverage(defenders, "defending"),
    physical: abilityAverage(squad, "physical"),
    crossing: abilityAverage([...defenders, ...midfielders], "crossing"),
    finishing: abilityAverage(forwards, "finishing"),
    stamina: abilityAverage(squad, "stamina"),
    centerBackPace: average(
      centerBackCandidates.map((player) => player.ability?.pace ?? 65),
      65,
    ),
    // 공격 제공권에는 장신 공격수뿐 아니라 세트피스에 가담하는 수비수도 포함한다.
    aerialAttack: bestAverage(
      outfield.map((player) => aerialScore(player, referenceHeights)),
      5,
    ),
    aerialDefense: bestAverage(
      defenders.map((player) => aerialScore(player, referenceHeights)),
      4,
    ),
  };
}

function groupSquads(players: Player[]) {
  const groups = new Map<number, Player[]>();
  players.forEach((player) => {
    const squad = groups.get(player.team_id) ?? [];
    squad.push(player);
    groups.set(player.team_id, squad);
  });
  return [...groups.values()].filter((squad) => squad.length > 0);
}

interface RankedScoutClaim extends ScoutClaim {
  percentile: number;
}

function rankedClaims(
  metrics: TeamScoutMetrics,
  references: TeamScoutMetrics[],
  claims: ScoutClaim[],
  side: "strength" | "weakness",
): RankedScoutClaim[] {
  return claims
    .map((claim) => ({
      ...claim,
      percentile: percentileRank(
        references.map((reference) => reference[claim.metric]),
        metrics[claim.metric],
      ),
    }))
    .sort((a, b) => side === "strength" ? b.percentile - a.percentile : a.percentile - b.percentile);
}

function selectClaims(
  ranked: RankedScoutClaim[],
  side: "strength" | "weakness",
  excludedMetrics = new Set<ScoutMetric>(),
) {
  const candidates = ranked.filter(({ metric }) => !excludedMetrics.has(metric));
  const selected = candidates.slice(0, 2);
  for (const candidate of candidates.slice(2)) {
    const isDistinctive = side === "strength"
      ? candidate.percentile >= 0.75
      : candidate.percentile <= 0.25;
    if (isDistinctive && selected.length < 5) selected.push(candidate);
  }
  return selected;
}

function altitudeAdaptationFor(team: Team, elevation: number, isHome: boolean) {
  if (elevation < 1000) return 0;
  const knownAltitudeTeams = ["Mexico", "Ecuador", "Bolivia", "Colombia", "Peru"];
  const nameBonus = knownAltitudeTeams.some((name) => team.team_name.includes(name)) ? 16 : 0;
  const confederationBonus =
    team.confederation === "CONMEBOL" || team.confederation === "CONCACAF" ? 7 : 0;
  const homeBonus = isHome ? 6 : 0;
  return Math.min(24, nameBonus + confederationBonus + homeBonus);
}

export function buildOpponentPlan({
  team,
  squad,
  referencePlayers = squad,
  elevation,
  isHome,
  seed,
}: BuildOpponentPlanOptions): OpponentPlan {
  const referenceHeights = validHeights(referencePlayers);
  const metrics = scoutMetricsFor(squad, referenceHeights);
  const referenceMetrics = groupSquads(referencePlayers).map((referenceSquad) =>
    scoutMetricsFor(referenceSquad, referenceHeights)
  );
  const { pace, passing, defending, physical, finishing, centerBackPace } = metrics;
  const profile = buildTeamAbilityProfile(squad);
  const centerBackPacePercentile = percentileRank(
    referenceMetrics.map((reference) => reference.centerBackPace),
    centerBackPace,
  );
  const slowCenterBacks = referenceMetrics.length >= 4
    ? centerBackPacePercentile <= 0.25
    : centerBackPace < 68;
  const altitudeAdaptation = altitudeAdaptationFor(team, elevation, isHome);

  let formation: FormationKey = "4-3-3";
  let tactics = DEFAULT_TEAM_TACTICS;
  let identity = "균형적인 경기 운영";

  if (defending >= passing + 3 || profile.defense >= profile.attack + 4) {
    formation = seed % 2 === 0 ? "5-3-2" : "4-5-1";
    tactics = applyQuickTactic(DEFAULT_TEAM_TACTICS, "protectLead");
    identity = "낮은 블록과 역습";
  } else if (physical >= 74 && team.elo_rating >= 1700) {
    formation = seed % 2 === 0 ? "4-3-3" : "4-2-3-1";
    tactics = applyQuickTactic(DEFAULT_TEAM_TACTICS, "highPress");
    identity = "강한 전방 압박";
  } else if (passing >= 73) {
    formation = "4-2-3-1";
    tactics = applyQuickTactic(DEFAULT_TEAM_TACTICS, "control");
    identity = "점유와 짧은 패스";
  } else if (pace >= 73 || finishing >= 74) {
    formation = seed % 2 === 0 ? "4-3-3" : "4-4-2";
    tactics = {
      ...applyQuickTactic(DEFAULT_TEAM_TACTICS, "attacking"),
      passingStyle: "direct",
      chanceCreation: "forwardRuns",
    };
    identity = "빠른 침투와 직접 공격";
  }

  const strengthClaims: ScoutClaim[] = [
    { metric: "pace", label: "빠른 공격 전환과 침투 속도" },
    { metric: "passing", label: "중원의 패스와 점유 능력" },
    { metric: "defending", label: "수비 대인 대응과 박스 보호" },
    { metric: "physical", label: "압박 지속력과 몸싸움" },
    { metric: "crossing", label: "측면 크로스와 오버래핑" },
    { metric: "finishing", label: "공격진의 마무리 효율" },
    { metric: "stamina", label: "후반까지 유지되는 활동량과 압박" },
    { metric: "aerialAttack", label: "높은 타깃과 제공권을 활용한 세트피스 위협" },
    { metric: "aerialDefense", label: "수비진의 제공권과 높은 크로스 대응" },
  ];
  const weaknessClaims: ScoutClaim[] = [
    { metric: "centerBackPace", label: "센터백의 뒷공간 대응 속도" },
    { metric: "pace", label: "공격 전환과 수비 복귀 속도" },
    { metric: "stamina", label: "후반 체력과 압박 유지력" },
    { metric: "passing", label: "강한 압박을 받을 때 빌드업 안정성" },
    { metric: "finishing", label: "기회 대비 마무리 효율" },
    { metric: "defending", label: "박스 앞 중앙 수비 간격" },
    { metric: "physical", label: "몸싸움과 압박 지속력" },
    { metric: "crossing", label: "측면 크로스의 정확도" },
    { metric: "aerialAttack", label: "높은 크로스와 공중볼 공격 위력 부족" },
    { metric: "aerialDefense", label: "세트피스와 높은 크로스 수비 취약" },
  ];
  const selectedStrengths = selectClaims(
    rankedClaims(metrics, referenceMetrics, strengthClaims, "strength"),
    "strength",
  );
  const selectedWeaknesses = selectClaims(
    rankedClaims(metrics, referenceMetrics, weaknessClaims, "weakness"),
    "weakness",
    new Set(selectedStrengths.map(({ metric }) => metric)),
  );
  const strengths = selectedStrengths.map(({ label }) => label);
  const weaknesses = selectedWeaknesses.map(({ label }) => label);
  if (altitudeAdaptation >= 15) strengths.unshift("고지대 환경 적응력");

  const observedFormation = getObservedFormation(team.fifa_code);
  if (observedFormation) {
    formation = observedFormation.formation;
  }

  return {
    formation,
    formationSource: observedFormation ? "observed" : "inferred",
    formationEvidence: observedFormation
      ? {
          matchId: observedFormation.matchId,
          match: observedFormation.match,
          sourceName: observedFormation.sourceName,
          sourceUrl: observedFormation.sourceUrl,
        }
      : null,
    tactics,
    identity,
    altitudeAdaptation,
    strengths: strengths.slice(0, 5),
    weaknesses: weaknesses.slice(0, 5),
    slowCenterBacks,
  };
}

export function applyAltitudeAdaptation(
  conditions: Map<number, ConditionBreakdown>,
  adaptation: number
) {
  if (adaptation <= 0) return conditions;
  return new Map(
    [...conditions].map(([playerId, condition]) => [
      playerId,
      {
        ...condition,
        score: Math.min(100, condition.score + adaptation),
        altitudePenalty: Math.max(0, condition.altitudePenalty - adaptation),
      },
    ])
  );
}

interface OpponentDecisionOptions {
  minute: number;
  userGoals: number;
  oppGoals: number;
  current: TeamTactics;
  userTactics: TeamTactics;
  live: LiveMatchSnapshot | null;
}

export function decideOpponentTacticChange({
  minute,
  userGoals,
  oppGoals,
  current,
  userTactics,
  live,
}: OpponentDecisionOptions): OpponentTacticChange | null {
  if (minute < 20 || minute % 10 !== 0) return null;

  if (minute >= 60 && oppGoals < userGoals) {
    return {
      minute,
      title: "상대가 득점 총력 전술로 전환",
      detail: "공격 숫자와 템포를 높이고 수비 라인을 전진시켰습니다.",
      tactics: applyQuickTactic(current, "chaseGoal"),
    };
  }
  if (minute >= 70 && oppGoals > userGoals) {
    return {
      minute,
      title: "상대가 리드 보호로 전환",
      detail: "수비 라인을 내리고 역습 위주의 운영을 시작했습니다.",
      tactics: applyQuickTactic(current, "protectLead"),
    };
  }
  if (minute === 50 && userGoals === oppGoals) {
    const opponentNeedsMoreThreat =
      (live?.teamStats.opp.shots ?? 0) <= (live?.teamStats.user.shots ?? 0) ||
      (live?.oppXg ?? 0) <= (live?.userXg ?? 0);
    return opponentNeedsMoreThreat
      ? {
          minute,
          title: "상대가 후반 공격 전개를 빠르게 조정",
          detail: "전반의 기회 열세를 만회하기 위해 직접 패스와 전방 침투 비중을 높였습니다.",
          tactics: {
            ...applyQuickTactic(current, "attacking"),
            passingStyle: "direct",
            buildUpPlay: "fastBuildUp",
            chanceCreation: "forwardRuns",
          },
        }
      : {
          minute,
          title: "상대가 점유 중심 운영으로 조정",
          detail: "전반의 우세를 이어가기 위해 템포를 낮추고 짧은 패스로 경기 주도권을 관리합니다.",
          tactics: {
            ...applyQuickTactic(current, "control"),
            workRate: "conserve",
          },
        };
  }
  if ((live?.teamStats.user.possession ?? 50) >= 58) {
    return {
      minute,
      title: "상대가 압박 강도를 높임",
      detail: "우리의 점유를 끊기 위해 전방 압박과 활동량을 높였습니다.",
      tactics: applyQuickTactic(current, "highPress"),
    };
  }
  if (userTactics.pressing === "high" || userTactics.defenseStyle === "constantPress") {
    return {
      minute,
      title: "상대가 직접적인 빌드업으로 전환",
      detail: "우리 압박 뒤 공간을 향해 긴 패스와 빠른 공격 전환을 시도합니다.",
      tactics: {
        ...current,
        passingStyle: "direct",
        buildUpPlay: "fastBuildUp",
        chanceCreation: "forwardRuns",
      },
    };
  }
  if ((live?.teamStats.user.shots ?? 0) >= (live?.teamStats.opp.shots ?? 0) + 4) {
    return {
      minute,
      title: "상대가 수비 균형을 조정",
      detail: "박스 앞 공간을 줄이기 위해 라인과 팀 폭을 좁혔습니다.",
      tactics: applyQuickTactic(current, "defensive"),
    };
  }
  return null;
}
