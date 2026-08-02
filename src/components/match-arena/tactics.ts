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

export type DefenseStyle = "dropBack" | "balanced" | "errorPress" | "lossPress" | "constantPress";
export type ChanceCreation = "possession" | "balanced" | "directPassing" | "forwardRuns";
export type Mentality = "defensive" | "cautious" | "balanced" | "positive" | "attacking";
export type Tempo = "slow" | "balanced" | "fast";
export type Fluidity = "rigid" | "balanced" | "fluid";
export type WorkRate = "conserve" | "balanced" | "intense";
export type Creativity = "disciplined" | "balanced" | "expressive";
export type PassingStyle = "short" | "mixed" | "direct" | "long";
export type AttackFocus = "left" | "balanced" | "right" | "central";
export type ShootingInstruction = "patient" | "balanced" | "onSight";
export type DefensiveLine = "low" | "standard" | "high";
export type PressingLevel = "low" | "standard" | "high";
export type Marking = "zonal" | "man";
export type Tackling = "cautious" | "balanced" | "aggressive";
export type StrikerRole = "target" | "poacher" | "falseNine";
export type MidfieldRole = "hold" | "balanced" | "playmaker";
export type FullbackRole = "stay" | "overlap" | "inverted";
export type TeamWidth = "narrow" | "balanced" | "wide";
export type LineOfEngagement = "deep" | "middle" | "high";

export interface TeamTactics {
  defenseStyle: DefenseStyle;
  width: TeamWidth;
  chanceCreation: ChanceCreation;
  mentality: Mentality;
  tempo: Tempo;
  fluidity: Fluidity;
  workRate: WorkRate;
  creativity: Creativity;
  passingStyle: PassingStyle;
  attackFocus: AttackFocus;
  shooting: ShootingInstruction;
  defensiveLine: DefensiveLine;
  pressing: PressingLevel;
  marking: Marking;
  tackling: Tackling;
  strikerRole: StrikerRole;
  midfieldRole: MidfieldRole;
  fullbackRole: FullbackRole;
  /** Where the press starts, separate from how deep the back line sits. */
  lineOfEngagement: LineOfEngagement;
}

export type TacticSelectKey = "defenseStyle" | "chanceCreation";

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
  chanceCreation: "balanced",
  mentality: "balanced",
  tempo: "balanced",
  fluidity: "balanced",
  workRate: "balanced",
  creativity: "balanced",
  passingStyle: "mixed",
  attackFocus: "balanced",
  shooting: "balanced",
  defensiveLine: "standard",
  pressing: "standard",
  marking: "zonal",
  tackling: "balanced",
  strikerRole: "poacher",
  midfieldRole: "balanced",
  fullbackRole: "overlap",
  lineOfEngagement: "middle",
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
  const focus: -1 | 0 | 1 =
    tactics.attackFocus === "left"
      ? -1
      : tactics.attackFocus === "right"
        ? 1
        : 0;
  return {
    fluidDefense: clamp(64 - linePush * 0.6 - (teamWidth - 50) * 0.12, 0, 100),
    attackPress: clamp(
      stylePress[tactics.defenseStyle] +
        chancePress[tactics.chanceCreation] +
        detailedPress +
        linePush * 0.45 +
        effort,
      0,
      100
    ),
    teamWidth,
    tempo: clamp(tempo, 0, 100),
    mentality,
    directness: clamp(passingDirectness, 0, 100),
    focus,
    defensiveLine: { low: 24, standard: 50, high: 80 }[tactics.defensiveLine],
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
  const chanceAttack: Record<ChanceCreation, number> = {
    possession: -0.35,
    balanced: 0,
    directPassing: 0.48,
    forwardRuns: 0.78,
  };
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
  const strikerAttack = { target: 0.1, poacher: 0.4, falseNine: -0.18 }[tactics.strikerRole];
  const strikerDirectness = { target: 0.55, poacher: 0.15, falseNine: -0.35 }[tactics.strikerRole];
  const midfieldCreativity = { hold: -0.4, balanced: 0, playmaker: 0.55 }[tactics.midfieldRole];
  const fullbackOverlap = { stay: -0.65, overlap: 0.65, inverted: 0.15 }[tactics.fullbackRole];
  const teamWidth = { narrow: -1, balanced: 0, wide: 1 }[tactics.width];

  return {
    // Individual roles mostly shape that player's movement. They should only
    // nudge team-wide risk; otherwise the default poacher silently turns the
    // visible "balanced" preset into an attacking one.
    attackBias: clamp(
      chanceAttack[tactics.chanceCreation] +
        boxCommitment * 0.3 +
        mentality * 0.5 +
        strikerAttack * 0.25,
      -1,
      1,
    ),
    pressBias: clamp(defensePress[tactics.defenseStyle] * 0.45 + pressing * 0.68 + workRate * 0.2, -1, 1),
    // Kept separate from `overlapBias`, which blends in team width and set
    // pieces and so never got near its extremes. How far a full-back runs is
    // decided by his own instruction, and it has to be able to reach the top
    // of the scale or the run never happens.
    fullbackPushBias: clamp(
      fullbackOverlap * 1.4 + teamWidth * 0.14,
      -1,
      1,
    ),
    overlapBias: clamp(
      teamWidth * 0.4 +
        boxCommitment * 0.2 +
        setPieceCommitment * 0.1 +
        fullbackOverlap * 0.5,
      -1,
      1,
    ),
    directnessBias: clamp(passing * 0.8 + strikerDirectness * 0.35, -1, 1),
    counterBias: clamp(
      // Direct and long passing is what springs a counter now that build-up
      // play is no longer a separate control.
      Math.max(0, passing) * 0.6 +
        (tactics.chanceCreation === "forwardRuns" ? 0.28 : tactics.chanceCreation === "possession" ? -0.35 : 0) +
        COUNTER_ATTACK_BONUS,
      -1,
      1
    ),
    tempoBias: clamp(tempo * 0.75 + workRate * 0.25, -1, 1),
    creativityBias: clamp(creativity * 0.55 + fluidity * 0.25 + midfieldCreativity * 0.45, -1, 1),
    shootingBias: shooting,
    defensiveLineBias: clamp(defensiveLine, -1, 1),
    tacklingBias: clamp(tackling * 0.8 + (tactics.marking === "man" ? 0.2 : -0.05), -1, 1),
    widthBias: clamp(teamWidth * 0.78 + focusWidth * 0.25, -1, 1),
    centralFocusBias: tactics.attackFocus === "central" ? 1 : 0,
    focusBias: focus,
    setPieceBias: clamp(setPieceCommitment, -1, 1),
    engagementBias: { deep: -1, middle: 0, high: 1 }[tactics.lineOfEngagement],
    // Team width is now the only control over how the block is spread, so how
    // far the lines sit apart follows from the instructions that push players
    // up the pitch rather than from a second, overlapping dial.
    compactnessBias: clamp(-mentality * 0.4 - Math.max(0, passing) * 0.3, -1, 1),
    // Committing bodies forward is what makes an attacking plan risky. Without
    // a rest-defence dial it follows entirely from those instructions.
    restDefenseBias: clamp(
      -mentality * 0.45 -
        Math.max(0, fullbackOverlap) * 0.35 -
        (tactics.chanceCreation === "forwardRuns" ? 0.3 : 0),
      -1,
      1,
    ),
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
  | "chaseGoal";

/**
 * Shown as buttons in the "빠른 지시" tab. "protectLead"/"control"/
 * "highPress"/"overload"/"chaseGoal" still exist as applyQuickTactic() cases
 * below — the opponent AI (match-board/opponentPlan.ts) calls them by key
 * directly — they're just not surfaced as buttons here.
 */
export const QUICK_TACTICS: Array<{ key: QuickTacticKey; label: string; description: string }> = [
  { key: "defensive", label: "수비 지향", description: "낮은 블록으로 물러서서 역습" },
  { key: "balanced", label: "밸런스", description: "공수 균형을 유지하는 기본형" },
  { key: "attacking", label: "공격 지향", description: "높은 라인과 압박으로 주도" },
];

export function applyQuickTactic(base: TeamTactics, key: QuickTacticKey): TeamTactics {
  // The three orientations are whole plans, not patches. Layering a handful of
  // overrides on whatever was set before left "수비 지향" still carrying an
  // attacking side's roles and press, so the presets barely differed once the
  // overlapping controls were removed.
  if (key === "defensive") return {
    defenseStyle: "dropBack",
    width: "narrow",
    chanceCreation: "balanced",
    mentality: "defensive",
    tempo: "balanced",
    fluidity: "rigid",
    workRate: "balanced",
    creativity: "disciplined",
    passingStyle: "direct",
    attackFocus: "balanced",
    shooting: "patient",
    defensiveLine: "low",
    pressing: "low",
    marking: "zonal",
    tackling: "balanced",
    strikerRole: "target",
    midfieldRole: "hold",
    fullbackRole: "stay",
    lineOfEngagement: "deep",
  };
  if (key === "protectLead") return {
    ...base, mentality: "defensive", tempo: "slow", workRate: "conserve", defensiveLine: "low", width: "narrow",
    pressing: "low", tackling: "cautious", shooting: "patient",
  };
  if (key === "balanced") return {
    ...DEFAULT_TEAM_TACTICS,
  };
  if (key === "control") return {
    ...base, mentality: "positive", tempo: "slow", creativity: "disciplined", passingStyle: "short", width: "balanced", chanceCreation: "possession", pressing: "standard", shooting: "patient",
  };
  if (key === "attacking") return {
    defenseStyle: "lossPress",
    width: "wide",
    chanceCreation: "forwardRuns",
    mentality: "attacking",
    tempo: "fast",
    fluidity: "fluid",
    workRate: "intense",
    creativity: "expressive",
    passingStyle: "mixed",
    attackFocus: "balanced",
    shooting: "onSight",
    defensiveLine: "high",
    pressing: "high",
    marking: "zonal",
    tackling: "aggressive",
    strikerRole: "poacher",
    midfieldRole: "playmaker",
    fullbackRole: "overlap",
    lineOfEngagement: "high",
  };
  if (key === "highPress") return {
    ...base, mentality: "positive", tempo: "fast", workRate: "intense", defenseStyle: "constantPress", width: "wide",
    defensiveLine: "high", pressing: "high", tackling: "aggressive",
  };
  if (key === "overload") return {
    ...base, mentality: "positive", tempo: "fast", width: "wide",
    fullbackRole: "overlap", attackFocus: "balanced",
  };
  return {
    ...base, mentality: "attacking", tempo: "fast", fluidity: "fluid", creativity: "expressive", width: "wide",
    passingStyle: "direct", chanceCreation: "forwardRuns", shooting: "onSight",
    defensiveLine: "high", pressing: "high", workRate: "intense",
  };
}
