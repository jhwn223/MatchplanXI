export interface LiveIntensity {
  fluidDefense: number;
  attackPress: number;
  teamWidth: number;
  tempo: number;
  mentality: number;
  directness: number;
  focus: -1 | 0 | 1;
  defensiveLine: number;
  counter: number;
}

import type { SimTacticProfile } from "../../data/matchSim";
import { TACTIC_STYLES, type TacticStyleKey } from "../../data/tactics";

export type DefenseStyle = "dropBack" | "balanced" | "errorPress" | "lossPress" | "constantPress";
export type BuildUpPlay = "shortPass" | "balanced" | "longPass" | "fastBuildUp";
export type ChanceCreation = "possession" | "balanced" | "directPassing" | "forwardRuns";
export type Mentality = "defensive" | "cautious" | "balanced" | "positive" | "attacking";
export type Tempo = "slow" | "balanced" | "fast";
export type Fluidity = "rigid" | "balanced" | "fluid";
export type WorkRate = "conserve" | "balanced" | "intense";
export type Creativity = "disciplined" | "balanced" | "expressive";
export type PassingStyle = "short" | "mixed" | "direct" | "long";
export type AttackFocus = "left" | "balanced" | "right" | "central";
export type ShootingInstruction = "patient" | "balanced" | "onSight";
export type WidePlay = "mixed" | "overlap" | "earlyCross";
export type DefensiveLine = "low" | "standard" | "high";
export type PressingLevel = "low" | "standard" | "high";
export type Marking = "zonal" | "man";
export type Tackling = "cautious" | "balanced" | "aggressive";
export type StrikerRole = "target" | "poacher" | "falseNine";
export type MidfieldRole = "hold" | "balanced" | "playmaker";
export type FullbackRole = "stay" | "overlap" | "inverted";
export type TeamWidth = "narrow" | "balanced" | "wide";
export type LineOfEngagement = "deep" | "middle" | "high";
export type Compactness = "compact" | "balanced" | "stretched";

export interface TeamTactics {
  defenseStyle: DefenseStyle;
  width: TeamWidth;
  depth: number;
  buildUpPlay: BuildUpPlay;
  chanceCreation: ChanceCreation;
  mentality: Mentality;
  tempo: Tempo;
  fluidity: Fluidity;
  workRate: WorkRate;
  creativity: Creativity;
  passingStyle: PassingStyle;
  attackFocus: AttackFocus;
  shooting: ShootingInstruction;
  widePlay: WidePlay;
  defensiveLine: DefensiveLine;
  pressing: PressingLevel;
  marking: Marking;
  tackling: Tackling;
  strikerRole: StrikerRole;
  midfieldRole: MidfieldRole;
  fullbackRole: FullbackRole;
  /** Where the press starts, separate from how deep the back line sits. */
  lineOfEngagement: LineOfEngagement;
  /** Distance between the defensive, midfield and attacking lines. */
  compactness: Compactness;
  /** Players held back while the team attacks (2–5). */
  restDefense: number;
  offsideTrap: boolean;
}

export type TacticSelectKey = "defenseStyle" | "buildUpPlay" | "chanceCreation";
export type TacticMeterKey = "depth";

/**
 * Frozen values for the three instructions that used to be adjustable
 * (box runners 6, corners 1 + free kicks 3, counter-attack on). Keeping their
 * old default contributions means removing the controls changed no outcome.
 */
const BOX_COMMITMENT = (6 - 5.5) / 4.5;
const SET_PIECE_COMMITMENT = ((1 + 3) / 2 - 5.5) / 4.5;
const COUNTER_ATTACK_BONUS = 0.35;

export const DEFAULT_LIVE_INTENSITY: LiveIntensity = {
  fluidDefense: 35,
  attackPress: 30,
  teamWidth: 50,
  tempo: 50,
  mentality: 50,
  directness: 50,
  focus: 0,
  defensiveLine: 50,
  counter: 50,
};

export const DEFAULT_TEAM_TACTICS: TeamTactics = {
  defenseStyle: "balanced",
  width: "balanced",
  depth: 4,
  buildUpPlay: "balanced",
  chanceCreation: "balanced",
  mentality: "balanced",
  tempo: "balanced",
  fluidity: "balanced",
  workRate: "balanced",
  creativity: "balanced",
  passingStyle: "mixed",
  attackFocus: "balanced",
  shooting: "balanced",
  widePlay: "mixed",
  defensiveLine: "standard",
  pressing: "standard",
  marking: "zonal",
  tackling: "balanced",
  strikerRole: "poacher",
  midfieldRole: "balanced",
  fullbackRole: "overlap",
  lineOfEngagement: "middle",
  compactness: "balanced",
  restDefense: 3,
  offsideTrap: false,
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
  const detailedPress = { low: -18, standard: 0, high: 24 }[tactics.pressing];
  const linePush = { low: -18, standard: 0, high: 18 }[tactics.defensiveLine];
  const effort = { conserve: -12, balanced: 0, intense: 16 }[tactics.workRate];
  const teamWidth = { narrow: 20, balanced: 50, wide: 82 }[tactics.width];
  const mentality = {
    defensive: 12,
    cautious: 30,
    balanced: 50,
    positive: 69,
    attacking: 88,
  }[tactics.mentality];
  const tempo = {
    slow: 24,
    balanced: 50,
    fast: 82,
  }[tactics.tempo];
  const passingDirectness = {
    short: 18,
    mixed: 50,
    direct: 74,
    long: 90,
  }[tactics.passingStyle];
  const buildDirectness = {
    shortPass: -14,
    balanced: 0,
    longPass: 18,
    fastBuildUp: 9,
  }[tactics.buildUpPlay];
  const focus: -1 | 0 | 1 =
    tactics.attackFocus === "left"
      ? -1
      : tactics.attackFocus === "right"
        ? 1
        : 0;
  return {
    fluidDefense: clamp(88 - tactics.depth * 6 - linePush * 0.6 - (teamWidth - 50) * 0.12, 0, 100),
    attackPress: clamp(
      stylePress[tactics.defenseStyle] +
        tactics.depth * 2 +
        buildPress[tactics.buildUpPlay] +
        chancePress[tactics.chanceCreation] +
        detailedPress +
        linePush * 0.45 +
        effort,
      0,
      100
    ),
    teamWidth,
    tempo: clamp(tempo + (tactics.buildUpPlay === "fastBuildUp" ? 10 : 0), 0, 100),
    mentality,
    directness: clamp(passingDirectness + buildDirectness, 0, 100),
    focus,
    defensiveLine: clamp(
      { low: 24, standard: 50, high: 80 }[tactics.defensiveLine] +
        (tactics.depth - 5) * 3,
      10,
      90,
    ),
    counter: COUNTER_ATTACK_BONUS > 0 ? 100 : 25,
  };
}

export function describeTeamTactics(tactics: TeamTactics) {
  const mentality = {
    defensive: "수비적",
    cautious: "신중",
    balanced: "균형",
    positive: "적극적",
    attacking: "공격적",
  }[tactics.mentality];
  const tempo = { slow: "느린 템포", balanced: "보통 템포", fast: "빠른 템포" }[tactics.tempo];
  const pressing = { low: "낮은 압박", standard: "상황별 압박", high: "강한 압박" }[tactics.pressing];
  return `${mentality} · ${tempo} · ${pressing}`;
}

export function simProfileFromTeamTactics(tactics: TeamTactics): SimTacticProfile {
  const defensePress: Record<DefenseStyle, number> = {
    dropBack: -0.75,
    balanced: 0,
    errorPress: 0.35,
    lossPress: 0.65,
    constantPress: 1,
  };
  const buildDirectness: Record<BuildUpPlay, number> = {
    shortPass: -0.8,
    balanced: 0,
    longPass: 0.72,
    fastBuildUp: 0.45,
  };
  const chanceAttack: Record<ChanceCreation, number> = {
    possession: -0.35,
    balanced: 0,
    directPassing: 0.48,
    forwardRuns: 0.78,
  };
  const centered = (value: number) => (value - 5.5) / 4.5;
  const depth = centered(tactics.depth);
  // Box runners, set-piece numbers and the counter-attack switch are no longer
  // manager-adjustable. They are pinned to what their old defaults produced so
  // dropping the controls does not quietly rebalance every match.
  const boxCommitment = BOX_COMMITMENT;
  const setPieceCommitment = SET_PIECE_COMMITMENT;
  const mentality = { defensive: -1, cautious: -0.5, balanced: 0, positive: 0.5, attacking: 1 }[tactics.mentality];
  const tempo = { slow: -1, balanced: 0, fast: 1 }[tactics.tempo];
  const fluidity = { rigid: -1, balanced: 0, fluid: 1 }[tactics.fluidity];
  const workRate = { conserve: -1, balanced: 0, intense: 1 }[tactics.workRate];
  const creativity = { disciplined: -1, balanced: 0, expressive: 1 }[tactics.creativity];
  const passing = { short: -1, mixed: 0, direct: 0.55, long: 1 }[tactics.passingStyle];
  const shooting = { patient: -1, balanced: 0, onSight: 1 }[tactics.shooting];
  const defensiveLine = { low: -1, standard: 0, high: 1 }[tactics.defensiveLine];
  const pressing = { low: -1, standard: 0, high: 1 }[tactics.pressing];
  const tackling = { cautious: -1, balanced: 0, aggressive: 1 }[tactics.tackling];
  const focus = { left: -1, balanced: 0, right: 1, central: 0 }[tactics.attackFocus];
  const focusWidth = tactics.attackFocus === "central" ? -0.8 : tactics.attackFocus === "balanced" ? 0 : 0.65;
  const widePlay = { mixed: 0, overlap: 0.8, earlyCross: 0.45 }[tactics.widePlay];
  const strikerAttack = { target: 0.1, poacher: 0.4, falseNine: -0.18 }[tactics.strikerRole];
  const strikerDirectness = { target: 0.55, poacher: 0.15, falseNine: -0.35 }[tactics.strikerRole];
  const midfieldCreativity = { hold: -0.4, balanced: 0, playmaker: 0.55 }[tactics.midfieldRole];
  const fullbackOverlap = { stay: -0.65, overlap: 0.65, inverted: 0.15 }[tactics.fullbackRole];
  const teamWidth = { narrow: -1, balanced: 0, wide: 1 }[tactics.width];

  return {
    attackBias: clamp(chanceAttack[tactics.chanceCreation] + boxCommitment * 0.3 + mentality * 0.5 + strikerAttack, -1, 1),
    pressBias: clamp(defensePress[tactics.defenseStyle] * 0.45 + depth * 0.2 + pressing * 0.55 + workRate * 0.2, -1, 1),
    overlapBias: clamp(teamWidth * 0.3 + boxCommitment * 0.2 + setPieceCommitment * 0.1 + widePlay * 0.35 + fullbackOverlap * 0.7, -1, 1),
    directnessBias: clamp(buildDirectness[tactics.buildUpPlay] * 0.4 + passing * 0.55 + strikerDirectness * 0.35, -1, 1),
    counterBias: clamp(
      (tactics.buildUpPlay === "fastBuildUp" ? 0.72 : tactics.buildUpPlay === "longPass" ? 0.4 : 0) +
        (tactics.chanceCreation === "forwardRuns" ? 0.28 : tactics.chanceCreation === "possession" ? -0.35 : 0) +
        COUNTER_ATTACK_BONUS,
      -1,
      1
    ),
    tempoBias: clamp(tempo * 0.75 + workRate * 0.25, -1, 1),
    creativityBias: clamp(creativity * 0.55 + fluidity * 0.25 + midfieldCreativity * 0.45, -1, 1),
    shootingBias: shooting,
    defensiveLineBias: clamp(defensiveLine * 0.75 + depth * 0.25, -1, 1),
    tacklingBias: clamp(tackling * 0.8 + (tactics.marking === "man" ? 0.2 : -0.05), -1, 1),
    widthBias: clamp(teamWidth * 0.6 + focusWidth * 0.25 + widePlay * 0.25, -1, 1),
    focusBias: focus,
    setPieceBias: clamp(setPieceCommitment, -1, 1),
    engagementBias: { deep: -1, middle: 0, high: 1 }[tactics.lineOfEngagement],
    compactnessBias: { compact: 1, balanced: 0, stretched: -1 }[tactics.compactness],
    // Committing bodies forward is what makes an attacking plan risky, so the
    // held-back count is combined with the instructions that pull players up
    // the pitch.
    restDefenseBias: clamp(
      (tactics.restDefense - 3) / 2 -
        mentality * 0.25 -
        Math.max(0, fullbackOverlap) * 0.2 -
        (tactics.chanceCreation === "forwardRuns" ? 0.2 : 0),
      -1,
      1,
    ),
    offsideTrapBias: tactics.offsideTrap ? 1 : 0,
  };
}

export type QuickTacticKey =
  | "defensive"
  | "protectLead"
  | "balanced"
  | "control"
  | "attacking"
  | "highPress"
  | "overload"
  | "chaseGoal"
  | TacticStyleKey;

/**
 * Shown in the "빠른 지시" tab as two groups: a basic 3-way orientation, and
 * the same 6 tactic styles used pre-match (src/data/tactics.ts) so the label
 * a manager picks before kickoff stays recognisable during the match too.
 * "protectLead"/"control"/"highPress"/"overload"/"chaseGoal" still exist as
 * applyQuickTactic() cases below — the opponent AI (match-board/opponentPlan.ts)
 * calls them by key directly — they're just not surfaced as buttons anymore.
 */
export const QUICK_TACTICS: Array<{
  key: QuickTacticKey;
  label: string;
  description: string;
  group: "orientation" | "style";
}> = [
  { key: "defensive", label: "수비 지향", description: "낮은 블록과 안정적인 간격", group: "orientation" },
  { key: "balanced", label: "밸런스", description: "공수 균형을 유지하는 기본형", group: "orientation" },
  { key: "attacking", label: "공격 지향", description: "적극적인 전진과 박스 침투", group: "orientation" },
  ...TACTIC_STYLES.map((style) => ({
    key: style.key,
    label: `${style.emoji} ${style.label}`,
    description: style.description,
    group: "style" as const,
  })),
];

export function applyQuickTactic(base: TeamTactics, key: QuickTacticKey): TeamTactics {
  if (key === "defensive") return {
    ...base, mentality: "defensive", tempo: "balanced", width: "narrow", defensiveLine: "low",
    pressing: "low", tackling: "balanced", defenseStyle: "dropBack", depth: 3,
  };
  if (key === "protectLead") return {
    ...base, mentality: "defensive", tempo: "slow", workRate: "conserve", defensiveLine: "low", width: "narrow",
    pressing: "low", tackling: "cautious", shooting: "patient", depth: 2,
  };
  if (key === "balanced") return {
    ...DEFAULT_TEAM_TACTICS,
  };
  if (key === "control") return {
    ...base, mentality: "positive", tempo: "slow", creativity: "disciplined", passingStyle: "short", width: "balanced",
    buildUpPlay: "shortPass", chanceCreation: "possession", pressing: "standard", shooting: "patient",
  };
  if (key === "attacking") return {
    ...base, mentality: "attacking", tempo: "fast", width: "balanced", chanceCreation: "forwardRuns",
    shooting: "balanced", defensiveLine: "high", pressing: "standard",
  };
  if (key === "highPress") return {
    ...base, mentality: "positive", tempo: "fast", workRate: "intense", defenseStyle: "constantPress", width: "wide",
    defensiveLine: "high", pressing: "high", tackling: "aggressive", depth: 8,
  };
  if (key === "overload") return {
    ...base, mentality: "positive", tempo: "fast", width: "wide", widePlay: "overlap",
    fullbackRole: "overlap", attackFocus: "balanced",
  };
  if (key === "chaseGoal") return {
    ...base, mentality: "attacking", tempo: "fast", fluidity: "fluid", creativity: "expressive", width: "wide",
    passingStyle: "direct", chanceCreation: "forwardRuns", shooting: "onSight", widePlay: "overlap",
    defensiveLine: "high", pressing: "high", workRate: "intense",
  };
  // The 6 pre-match tactic styles (src/data/tactics.ts), translated into the
  // richer in-match TeamTactics fields so picking a style mid-match keeps the
  // same footballing identity as picking it before kickoff.
  if (key === "possession") return {
    ...base, mentality: "positive", tempo: "slow", passingStyle: "short", buildUpPlay: "shortPass",
    chanceCreation: "possession", pressing: "low", defensiveLine: "standard", width: "balanced",
    tackling: "cautious", creativity: "disciplined", fluidity: "balanced",
  };
  if (key === "counter") return {
    ...base, mentality: "cautious", tempo: "fast", passingStyle: "direct", buildUpPlay: "longPass",
    chanceCreation: "directPassing", pressing: "low", defensiveLine: "low", width: "narrow",
    tackling: "balanced", workRate: "intense", strikerRole: "poacher",
  };
  if (key === "wing") return {
    ...base, mentality: "positive", tempo: "balanced", width: "wide", widePlay: "overlap",
    fullbackRole: "overlap", chanceCreation: "balanced", passingStyle: "mixed", pressing: "standard",
    defensiveLine: "standard",
  };
  if (key === "halfspace") return {
    ...base, mentality: "positive", tempo: "balanced", passingStyle: "mixed", chanceCreation: "directPassing",
    attackFocus: "central", midfieldRole: "playmaker", creativity: "expressive", fluidity: "fluid", widePlay: "mixed",
  };
  if (key === "longball") return {
    ...base, mentality: "positive", tempo: "fast", passingStyle: "long", buildUpPlay: "longPass",
    chanceCreation: "directPassing", strikerRole: "target", defensiveLine: "standard", workRate: "balanced",
  };
  return {
    ...base, mentality: "attacking", tempo: "fast", defenseStyle: "constantPress", pressing: "high",
    defensiveLine: "high", tackling: "aggressive", workRate: "intense", width: "wide",
    marking: "man",
  };
}
