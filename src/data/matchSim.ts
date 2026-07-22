import type { Position } from "./types";
import type { TeamAbilityProfile } from "./playerAbility";

export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function poisson(lambda: number, rng: () => number): number {
  const L = Math.exp(-lambda);
  let k = 0;
  let p = 1;
  do {
    k++;
    p *= rng();
  } while (p > L);
  return k - 1;
}

function clamp(v: number, min: number, max: number) {
  return Math.min(max, Math.max(min, v));
}

export interface PlacedPlayerLite {
  name: string;
  position: Position;
  overall: number;
  pace: number;
  shooting: number;
  finishing: number;
  positioning: number;
  passing: number;
  vision: number;
  dribbling: number;
  condition: number;
}

export interface GoalEvent {
  minute: number;
  side: "user" | "opp";
  scorer?: string;
  assist?: string;
}

export interface TeamStats {
  /** pass completion probability for this match, 0-100 */
  passSuccessRate: number;
  /** shots faced by this team's goalkeeper */
  shotsFaced: number;
  saves: number;
  /** save probability among shots faced, 0-100 */
  saveRate: number;
}

export interface SimActual {
  userGoals: number;
  oppGoals: number;
  resultType: string;
}

export interface SimInput {
  seed: number;
  userTeamName: string;
  oppTeamName: string;
  userElo: number;
  oppElo: number;
  conditionIndex: number;
  attackBias: number;
  isHome: boolean;
  elevation: number;
  placed: PlacedPlayerLite[];
  userAbility: TeamAbilityProfile;
  oppAbility: TeamAbilityProfile;
  actual: SimActual | null;
  /** knockout ties go to extra time + penalties when level after 90'; group games never do */
  isKnockout: boolean;
}

export interface PenaltyResult {
  userGoals: number;
  oppGoals: number;
  winner: "user" | "opp";
}

export interface SimComparison {
  hasActual: boolean;
  actualUserGoals?: number;
  actualOppGoals?: number;
  simOutcome: "W" | "D" | "L";
  actualOutcome?: "W" | "D" | "L";
  outcomeMatched?: boolean;
  verdict: string;
  tacticsNote: string;
}

export interface SimResult {
  /** final score, including extra time if it was played (not the shootout) */
  userGoals: number;
  oppGoals: number;
  /** score at the 90' whistle, before any extra time */
  regulationUserGoals: number;
  regulationOppGoals: number;
  userXg: number;
  oppXg: number;
  goals: GoalEvent[];
  comparison: SimComparison;
  teamStats: { user: TeamStats; opp: TeamStats };
  wentToExtraTime: boolean;
  penalties: PenaltyResult | null;
}

function pickScorer(placed: PlacedPlayerLite[], rng: () => number): string {
  const weight = (p: PlacedPlayerLite) => {
    const positionWeight = p.position === "FWD" ? 4.8 : p.position === "MID" ? 2.3 : p.position === "DEF" ? 0.65 : 0.05;
    const scoring = p.shooting * 0.45 + p.finishing * 0.35 + p.positioning * 0.2;
    return positionWeight * Math.pow(Math.max(35, scoring) / 70, 2) * (0.65 + p.condition / 180);
  };
  const pool = placed.filter((p) => p.position !== "GK");
  if (pool.length === 0) return "미드필더";
  const total = pool.reduce((s, p) => s + weight(p), 0);
  let r = rng() * total;
  for (const p of pool) {
    r -= weight(p);
    if (r <= 0) return p.name;
  }
  return pool[pool.length - 1].name;
}

/** ~78% of goals have an assist; the rest are solo runs, set pieces, etc. */
function pickAssist(placed: PlacedPlayerLite[], scorerName: string, rng: () => number): string | undefined {
  if (rng() < 0.22) return undefined;
  const weight = (p: PlacedPlayerLite) => {
    const positionWeight = p.position === "MID" ? 3.8 : p.position === "DEF" ? 1.5 : p.position === "FWD" ? 2.1 : 0;
    const creation = p.passing * 0.45 + p.vision * 0.35 + p.dribbling * 0.2;
    return positionWeight * Math.pow(Math.max(35, creation) / 70, 2) * (0.65 + p.condition / 180);
  };
  const pool = placed.filter((p) => p.position !== "GK" && p.name !== scorerName);
  if (pool.length === 0) return undefined;
  const total = pool.reduce((s, p) => s + weight(p), 0);
  if (total <= 0) return undefined;
  let r = rng() * total;
  for (const p of pool) {
    r -= weight(p);
    if (r <= 0) return p.name;
  }
  return pool[pool.length - 1].name;
}

/** Pass accuracy and GK save rate, derived probabilistically from the same match quality
 *  inputs as xG (elo gap, condition, tactical directness) plus shot volume off xG. */
function computeTeamStats(
  input: SimInput,
  userXg: number,
  oppXg: number,
  userGoals: number,
  oppGoals: number,
  rng: () => number
): { user: TeamStats; opp: TeamStats } {
  const eloDiff = (input.userElo - input.oppElo) / 400;
  const condFactor = (input.conditionIndex - 62) / 100;
  const jitter = () => (rng() - 0.5) * 6;

  const userPassPct = clamp(
    69 + eloDiff * 5 + condFactor * 7 + (input.userAbility.creativity - 70) * 0.42 - input.attackBias * 3 + jitter(),
    55,
    94
  );
  const oppPassPct = clamp(
    69 - eloDiff * 4 + (input.oppAbility.creativity - 70) * 0.42 + input.attackBias * 1.5 + jitter(),
    55,
    94
  );

  // shots faced by each GK; at least as many as the goals actually conceded
  const shotsAgainstUser = Math.max(oppGoals, poisson(oppXg * 2.8, rng));
  const shotsAgainstOpp = Math.max(userGoals, poisson(userXg * 2.8, rng));
  const userSaves = Math.max(0, shotsAgainstUser - oppGoals);
  const oppSaves = Math.max(0, shotsAgainstOpp - userGoals);

  return {
    user: {
      passSuccessRate: Math.round(userPassPct),
      shotsFaced: shotsAgainstUser,
      saves: userSaves,
      saveRate: shotsAgainstUser > 0 ? Math.round((userSaves / shotsAgainstUser) * 100) : 100,
    },
    opp: {
      passSuccessRate: Math.round(oppPassPct),
      shotsFaced: shotsAgainstOpp,
      saves: oppSaves,
      saveRate: shotsAgainstOpp > 0 ? Math.round((oppSaves / shotsAgainstOpp) * 100) : 100,
    },
  };
}

/** Penalty shootout: 5 rounds each, then sudden death. Mostly luck, with a small elo lean. */
function simulatePenalties(rng: () => number, eloDiff: number): PenaltyResult {
  const successProb = (bias: number) => clamp(0.76 + bias, 0.55, 0.92);
  const uProb = successProb(eloDiff * 0.04);
  const oProb = successProb(-eloDiff * 0.04);

  let userGoals = 0;
  let oppGoals = 0;
  for (let i = 0; i < 5; i++) {
    if (rng() < uProb) userGoals++;
    if (rng() < oProb) oppGoals++;
  }
  let guard = 0;
  while (userGoals === oppGoals && guard++ < 12) {
    if (rng() < uProb) userGoals++;
    if (rng() < oProb) oppGoals++;
  }
  const winner: "user" | "opp" =
    userGoals === oppGoals ? (rng() < 0.5 ? "user" : "opp") : userGoals > oppGoals ? "user" : "opp";
  return { userGoals, oppGoals, winner };
}

/** xG for the user side given elo gap, condition, attacking bias and home edge. */
function computeXg(input: {
  userElo: number;
  oppElo: number;
  conditionIndex: number;
  attackBias: number;
  isHome: boolean;
  userAbility: TeamAbilityProfile;
  oppAbility: TeamAbilityProfile;
}): { userXg: number; oppXg: number } {
  const homeAdv = input.isHome ? 0.25 : 0.0;
  const eloDiff = (input.userElo - input.oppElo) / 400;
  const condFactor = (input.conditionIndex - 62) / 100;
  const userAttackEdge =
    (input.userAbility.attack - input.oppAbility.defense) / 22 +
    (input.userAbility.creativity - input.oppAbility.goalkeeper) / 48;
  const oppAttackEdge =
    (input.oppAbility.attack - input.userAbility.defense) / 22 +
    (input.oppAbility.creativity - input.userAbility.goalkeeper) / 48;
  const staminaEdge = (input.userAbility.stamina - input.oppAbility.stamina) / 80;
  const userXg = clamp(
    1.18 + eloDiff * 0.48 + condFactor * 1.25 + userAttackEdge + staminaEdge + input.attackBias * 0.55 + homeAdv,
    0.15,
    4.8
  );
  const oppXg = clamp(
    1.18 - eloDiff * 0.42 - condFactor * 0.7 + oppAttackEdge - staminaEdge + input.attackBias * 0.3 + (input.isHome ? 0 : 0.25),
    0.15,
    4.2
  );
  return { userXg, oppXg };
}

/** Lightweight deterministic scoreline for AI-vs-AI matches (tournament fill). */
export function quickSimScore(
  seed: number,
  eloHome: number,
  eloAway: number
): { home: number; away: number } {
  const rng = mulberry32(seed >>> 0);
  const neutralAbility: TeamAbilityProfile = {
    overall: 70,
    attack: 70,
    creativity: 70,
    defense: 70,
    goalkeeper: 70,
    stamina: 70,
  };
  const { userXg, oppXg } = computeXg({
    userElo: eloHome,
    oppElo: eloAway,
    conditionIndex: 62,
    attackBias: 0,
    isHome: true,
    userAbility: neutralAbility,
    oppAbility: neutralAbility,
  });
  return { home: poisson(userXg, rng), away: poisson(oppXg, rng) };
}

export interface HalfResult {
  goals: GoalEvent[];
  userGoals: number;
  oppGoals: number;
  userXg: number;
  oppXg: number;
}

function makeMinutePicker(rng: () => number) {
  const used = new Set<number>();
  return (lo: number, hi: number) => {
    let m = lo + Math.floor(rng() * (hi - lo + 1));
    let guard = 0;
    while (used.has(m) && guard++ < 30) m = lo + Math.floor(rng() * (hi - lo + 1));
    used.add(m);
    return m;
  };
}

function genGoals(
  count: number,
  side: "user" | "opp",
  lo: number,
  hi: number,
  placed: PlacedPlayerLite[],
  nextMinute: (lo: number, hi: number) => number,
  rng: () => number
): GoalEvent[] {
  const goals: GoalEvent[] = [];
  for (let i = 0; i < count; i++) {
    const minute = nextMinute(lo, hi);
    if (side === "user") {
      const scorer = pickScorer(placed, rng);
      const assist = pickAssist(placed, scorer, rng);
      goals.push({ minute, side, scorer, assist });
    } else {
      goals.push({ minute, side });
    }
  }
  return goals;
}

/** Simulate one half (1 = 1'-45', 2 = 46'-90') using that half's lineup/tactics. */
export function simulateHalf(input: SimInput, half: 1 | 2): HalfResult {
  const rng = mulberry32((input.seed + half * 999983) >>> 0);
  const { userXg, oppXg } = computeXg(input);
  const halfUserXg = userXg / 2;
  const halfOppXg = oppXg / 2;

  const userGoals = poisson(halfUserXg, rng);
  const oppGoals = poisson(halfOppXg, rng);

  const lo = half === 1 ? 1 : 46;
  const hi = half === 1 ? 45 : 90;
  const nextMinute = makeMinutePicker(rng);

  const goals: GoalEvent[] = [
    ...genGoals(userGoals, "user", lo, hi, input.placed, nextMinute, rng),
    ...genGoals(oppGoals, "opp", lo, hi, input.placed, nextMinute, rng),
  ].sort((a, b) => a.minute - b.minute);

  return { goals, userGoals, oppGoals, userXg: halfUserXg, oppXg: halfOppXg };
}

/** Combine both halves into a regulation-time result. Extra time (knockouts only,
 *  when still level) is applied afterwards via `applyExtraTime`, once a lineup for
 *  the extra-time period is known. */
export function combineHalves(input: SimInput, h1: HalfResult, h2: HalfResult): SimResult {
  const userGoals = h1.userGoals + h2.userGoals;
  const oppGoals = h1.oppGoals + h2.oppGoals;
  const goals = [...h1.goals, ...h2.goals].sort((a, b) => a.minute - b.minute);
  const userXg = h1.userXg + h2.userXg;
  const oppXg = h1.oppXg + h2.oppXg;
  const simOutcome: "W" | "D" | "L" =
    userGoals > oppGoals ? "W" : userGoals < oppGoals ? "L" : "D";

  const rng = mulberry32((input.seed + 5_000003) >>> 0);
  const teamStats = computeTeamStats(input, userXg, oppXg, userGoals, oppGoals, rng);

  return {
    userGoals,
    oppGoals,
    regulationUserGoals: userGoals,
    regulationOppGoals: oppGoals,
    userXg,
    oppXg,
    goals,
    comparison: buildComparison(input, userGoals, oppGoals, simOutcome),
    teamStats,
    wentToExtraTime: false,
    penalties: null,
  };
}

/** Extend a level, regulation-time knockout result with extra time (+ penalties if still
 *  level after that). `input` should reflect whatever lineup is current when extra time
 *  kicks off, so a substitution made just before it can still affect who might score. */
export function applyExtraTime(input: SimInput, base: SimResult): SimResult {
  if (!input.isKnockout || base.userGoals !== base.oppGoals) return base;

  const rng = mulberry32((input.seed + 9_000029) >>> 0);
  const { userXg, oppXg } = computeXg(input);
  const etScale = 30 / 90; // two 15' extra-time periods
  const etUserXg = userXg * etScale;
  const etOppXg = oppXg * etScale;
  const etUserGoals = poisson(etUserXg, rng);
  const etOppGoals = poisson(etOppXg, rng);
  const nextMinute = makeMinutePicker(rng);

  const etGoals = [
    ...genGoals(etUserGoals, "user", 91, 120, input.placed, nextMinute, rng),
    ...genGoals(etOppGoals, "opp", 91, 120, input.placed, nextMinute, rng),
  ];

  const userGoals = base.userGoals + etUserGoals;
  const oppGoals = base.oppGoals + etOppGoals;
  const goals = [...base.goals, ...etGoals].sort((a, b) => a.minute - b.minute);

  let penalties: PenaltyResult | null = null;
  if (userGoals === oppGoals) {
    const eloDiff = (input.userElo - input.oppElo) / 400;
    penalties = simulatePenalties(rng, eloDiff);
  }

  const simOutcome: "W" | "D" | "L" =
    userGoals > oppGoals ? "W" : userGoals < oppGoals ? "L" : "D";
  const totalUserXg = base.userXg + etUserXg;
  const totalOppXg = base.oppXg + etOppXg;
  const teamStats = computeTeamStats(input, totalUserXg, totalOppXg, userGoals, oppGoals, rng);

  return {
    ...base,
    userGoals,
    oppGoals,
    userXg: totalUserXg,
    oppXg: totalOppXg,
    goals,
    comparison: buildComparison(input, userGoals, oppGoals, simOutcome),
    teamStats,
    wentToExtraTime: true,
    penalties,
  };
}

function buildComparison(
  input: SimInput,
  simU: number,
  simO: number,
  simOutcome: "W" | "D" | "L"
): SimComparison {
  const biasWord =
    input.attackBias >= 0.7
      ? "초공격적"
      : input.attackBias >= 0.3
        ? "공격적"
        : input.attackBias <= -0.5
          ? "수비적"
          : "균형잡힌";
  const condWord =
    input.conditionIndex >= 75
      ? "최상의 컨디션"
      : input.conditionIndex >= 60
        ? "양호한 컨디션"
        : input.conditionIndex >= 45
          ? "주의가 필요한 컨디션"
          : "위험한 컨디션";

  const tacticsNote = `${biasWord} 전술 · 평균 ${condWord}(${Math.round(input.conditionIndex)})${
    input.elevation >= 1500 ? ` · 해발 ${input.elevation}m 고지대` : ""
  }`;

  if (!input.actual) {
    return {
      hasActual: false,
      simOutcome,
      verdict: "이 경기는 실제 결과가 없습니다 (예정된 경기).",
      tacticsNote,
    };
  }

  const aU = input.actual.userGoals;
  const aO = input.actual.oppGoals;
  const actualOutcome: "W" | "D" | "L" = aU > aO ? "W" : aU < aO ? "L" : "D";
  const outcomeMatched = simOutcome === actualOutcome;
  const outcomeKo = (o: "W" | "D" | "L") => (o === "W" ? "승리" : o === "D" ? "무승부" : "패배");

  let verdict: string;
  if (simU === aU && simO === aO) {
    verdict = `🎯 스코어까지 정확히 일치! 당신의 전술은 실제 경기를 그대로 재현했습니다.`;
  } else if (outcomeMatched) {
    verdict = `✅ 결과 일치 — 실제도 ${outcomeKo(actualOutcome)}였습니다. 스코어는 시뮬 ${simU}-${simO} / 실제 ${aU}-${aO}.`;
  } else {
    const simGD = simU - simO;
    const actGD = aU - aO;
    verdict =
      simGD > actGD
        ? `📈 당신의 전술이 실제보다 더 좋은 결과를 냈습니다 (시뮬 ${simU}-${simO} / 실제 ${aU}-${aO}).`
        : `📉 실제 경기가 더 좋았습니다 (시뮬 ${simU}-${simO} / 실제 ${aU}-${aO}). 전술을 조정해 보세요.`;
  }

  return {
    hasActual: true,
    actualUserGoals: aU,
    actualOppGoals: aO,
    simOutcome,
    actualOutcome,
    outcomeMatched,
    verdict,
    tacticsNote,
  };
}
