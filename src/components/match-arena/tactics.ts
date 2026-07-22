export interface LiveIntensity {
  fluidDefense: number;
  attackPress: number;
}

export type DefenseStyle = "dropBack" | "balanced" | "errorPress" | "lossPress" | "constantPress";
export type BuildUpPlay = "shortPass" | "balanced" | "longPass" | "fastBuildUp";
export type ChanceCreation = "possession" | "balanced" | "directPassing" | "forwardRuns";

export interface TeamTactics {
  defenseStyle: DefenseStyle;
  width: number;
  depth: number;
  buildUpPlay: BuildUpPlay;
  chanceCreation: ChanceCreation;
  attackWidth: number;
  boxPlayers: number;
  corners: number;
  freeKicks: number;
}

export type TacticSelectKey = "defenseStyle" | "buildUpPlay" | "chanceCreation";
export type TacticMeterKey = "width" | "depth" | "attackWidth" | "boxPlayers" | "corners" | "freeKicks";

export const DEFAULT_LIVE_INTENSITY: LiveIntensity = { fluidDefense: 35, attackPress: 30 };

export const DEFAULT_TEAM_TACTICS: TeamTactics = {
  defenseStyle: "balanced",
  width: 5,
  depth: 4,
  buildUpPlay: "balanced",
  chanceCreation: "balanced",
  attackWidth: 6,
  boxPlayers: 6,
  corners: 1,
  freeKicks: 3,
};

export const TACTIC_SELECTS: Record<
  TacticSelectKey,
  { title: string; options: Array<{ value: string; label: string }> }
> = {
  defenseStyle: {
    title: "수비 스타일",
    options: [
      { value: "dropBack", label: "후퇴" },
      { value: "balanced", label: "밸런스" },
      { value: "errorPress", label: "볼 터치 실수 시 압박" },
      { value: "lossPress", label: "공 뺏긴 직후 압박" },
      { value: "constantPress", label: "지속적인 압박" },
    ],
  },
  buildUpPlay: {
    title: "빌드업 플레이",
    options: [
      { value: "shortPass", label: "짧은 패스" },
      { value: "balanced", label: "밸런스" },
      { value: "longPass", label: "긴 패스" },
      { value: "fastBuildUp", label: "빠른 빌드업" },
    ],
  },
  chanceCreation: {
    title: "기회 만들기",
    options: [
      { value: "possession", label: "점유율" },
      { value: "balanced", label: "밸런스" },
      { value: "directPassing", label: "침투 패스" },
      { value: "forwardRuns", label: "전방 침투" },
    ],
  },
};

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

export function intensityFromTeamTactics(tactics: TeamTactics): LiveIntensity {
  const stylePress: Record<DefenseStyle, number> = {
    dropBack: 10,
    balanced: 30,
    errorPress: 48,
    lossPress: 64,
    constantPress: 84,
  };
  const buildPress: Record<BuildUpPlay, number> = {
    shortPass: -4,
    balanced: 0,
    longPass: 4,
    fastBuildUp: 12,
  };
  const chancePress: Record<ChanceCreation, number> = {
    possession: -4,
    balanced: 0,
    directPassing: 7,
    forwardRuns: 12,
  };
  return {
    fluidDefense: clamp(82 - tactics.depth * 6 + tactics.width * 2, 0, 100),
    attackPress: clamp(
      stylePress[tactics.defenseStyle] +
        tactics.depth * 2 +
        buildPress[tactics.buildUpPlay] +
        chancePress[tactics.chanceCreation],
      0,
      100
    ),
  };
}
