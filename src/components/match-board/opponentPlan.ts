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

export interface TacticalMatchup {
  id: string;
  title: string;
  detail: string;
  recommendation: string;
  status: "effective" | "warning" | "neutral";
  patch: Partial<TeamTactics>;
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
  elevation: number;
  isHome: boolean;
  seed: number;
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
  elevation,
  isHome,
  seed,
}: BuildOpponentPlanOptions): OpponentPlan {
  const defenders = squad.filter((player) => player.position === "DEF");
  const midfielders = squad.filter((player) => player.position === "MID");
  const forwards = squad.filter((player) => player.position === "FWD");
  const pace = abilityAverage(squad, "pace");
  const passing = abilityAverage(midfielders, "passing");
  const defending = abilityAverage(defenders, "defending");
  const physical = abilityAverage(squad, "physical");
  const crossing = abilityAverage([...defenders, ...midfielders], "crossing");
  const finishing = abilityAverage(forwards, "finishing");
  const centerBackPace = average(
    defenders
      .sort((a, b) => (b.ability?.defending ?? 0) - (a.ability?.defending ?? 0))
      .slice(0, 3)
      .map((player) => player.ability?.pace ?? 65),
    65
  );
  const profile = buildTeamAbilityProfile(squad);
  const slowCenterBacks = centerBackPace < 68;
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
      counterAttack: true,
    };
    identity = "빠른 침투와 직접 공격";
  }

  const strengths: string[] = [];
  const weaknesses: string[] = [];
  if (pace >= 73) strengths.push("빠른 공격 전환과 침투 속도");
  if (passing >= 73) strengths.push("중원의 패스와 점유 능력");
  if (defending >= 73) strengths.push("수비 대인 대응과 박스 보호");
  if (physical >= 74) strengths.push("압박 지속력과 몸싸움");
  if (crossing >= 72) strengths.push("측면 크로스와 오버래핑");
  if (altitudeAdaptation >= 15) strengths.push("고지대 환경 적응력");
  if (strengths.length < 2) strengths.push("조직적인 기본 대형 유지");

  if (slowCenterBacks) weaknesses.push("센터백의 뒷공간 대응 속도");
  if (profile.stamina < 70) weaknesses.push("후반 체력과 압박 유지력");
  if (passing < 68) weaknesses.push("강한 압박을 받을 때 빌드업 안정성");
  if (finishing < 69) weaknesses.push("기회 대비 마무리 효율");
  if (defending < 69) weaknesses.push("박스 앞 중앙 수비 간격");
  if (weaknesses.length < 2) weaknesses.push("공격적으로 전진한 뒤 생기는 전환 공간");

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
    strengths: strengths.slice(0, 3),
    weaknesses: weaknesses.slice(0, 3),
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

export function tacticalMatchups(
  opponent: OpponentPlan,
  user: TeamTactics,
  elevation: number
): TacticalMatchup[] {
  const matchups: TacticalMatchup[] = [];
  const highPress =
    opponent.tactics.pressing === "high" ||
    opponent.tactics.defenseStyle === "constantPress" ||
    opponent.tactics.defenseStyle === "lossPress";
  if (highPress) {
    const effective = user.passingStyle === "direct" || user.passingStyle === "long";
    matchups.push({
      id: "beat-press",
      title: "상대의 강한 압박",
      detail: "첫 압박선을 짧은 패스로만 통과하면 위험 지역에서 공을 잃을 가능성이 높습니다.",
      recommendation: "직접 패스와 빠른 전진으로 압박 뒤 공간을 노리세요.",
      status: effective ? "effective" : "warning",
      patch: { passingStyle: "direct", buildUpPlay: "fastBuildUp", tempo: "fast" },
    });
  }

  const lowBlock =
    opponent.tactics.defensiveLine === "low" ||
    opponent.tactics.defenseStyle === "dropBack" ||
    opponent.tactics.mentality === "defensive";
  if (lowBlock) {
    const effective = user.width === "wide" && user.widePlay !== "mixed";
    matchups.push({
      id: "stretch-block",
      title: "상대의 낮은 수비 블록",
      detail: "중앙 공간이 좁아 정면 침투만 반복하면 슈팅 각도를 만들기 어렵습니다.",
      recommendation: "폭을 넓히고 오버래핑과 크로스로 수비 간격을 벌리세요.",
      status: effective ? "effective" : "warning",
      patch: { width: "wide", widePlay: "overlap", fullbackRole: "overlap", attackFocus: "balanced" },
    });
  }

  if (opponent.slowCenterBacks) {
    const effective =
      user.chanceCreation === "forwardRuns" &&
      user.strikerRole === "poacher" &&
      user.tempo === "fast";
    matchups.push({
      id: "attack-slow-cb",
      title: "느린 센터백 조합",
      detail: "상대 센터백은 전진 수비 뒤 돌아서는 상황에서 속도 약점이 드러납니다.",
      recommendation: "빠른 템포와 전방 침투, 침투형 공격수 역할이 유효합니다.",
      status: effective ? "effective" : "neutral",
      patch: { chanceCreation: "forwardRuns", strikerRole: "poacher", tempo: "fast" },
    });
  }

  if (elevation >= 1500 && opponent.altitudeAdaptation >= 15) {
    const effective = user.workRate === "conserve" || user.tempo === "slow";
    matchups.push({
      id: "altitude-management",
      title: "상대의 높은 고지대 적응력",
      detail: "상대보다 체력 저하가 빠르게 올 수 있어 후반 전술 대응 여지를 남겨야 합니다.",
      recommendation: "전반 활동량과 템포를 관리하고 후반에 압박 강도를 높이세요.",
      status: effective ? "effective" : "warning",
      patch: { workRate: "conserve", tempo: "slow", pressing: "standard" },
    });
  }

  if (!matchups.length) {
    matchups.push({
      id: "balanced-scout",
      title: "뚜렷한 단일 약점 없음",
      detail: "상대는 균형적인 구조를 유지하므로 경기 초반 점유율과 슈팅 위치를 확인해야 합니다.",
      recommendation: "균형 전술로 시작한 뒤 15분 데이터에 따라 대응하세요.",
      status: "neutral",
      patch: {},
    });
  }
  return matchups;
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
            counterAttack: true,
          },
        }
      : {
          minute,
          title: "상대가 점유 중심 운영으로 조정",
          detail: "전반의 우세를 이어가기 위해 템포를 낮추고 짧은 패스로 경기 주도권을 관리합니다.",
          tactics: {
            ...applyQuickTactic(current, "control"),
            workRate: "conserve",
            counterAttack: false,
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
        counterAttack: true,
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
