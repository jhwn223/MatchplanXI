import type { Position } from "./types";

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
}

export interface GoalEvent {
  minute: number;
  side: "user" | "opp";
  scorer?: string;
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
  actual: SimActual | null;
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
  userGoals: number;
  oppGoals: number;
  userXg: number;
  oppXg: number;
  goals: GoalEvent[];
  comparison: SimComparison;
}

function pickScorer(placed: PlacedPlayerLite[], rng: () => number): string {
  const weight = (p: PlacedPlayerLite) =>
    p.position === "FWD" ? 5 : p.position === "MID" ? 3 : p.position === "DEF" ? 1 : 0.2;
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

/** xG for the user side given elo gap, condition, attacking bias and home edge. */
function computeXg(input: {
  userElo: number;
  oppElo: number;
  conditionIndex: number;
  attackBias: number;
  isHome: boolean;
}): { userXg: number; oppXg: number } {
  const homeAdv = input.isHome ? 0.25 : 0.0;
  const eloDiff = (input.userElo - input.oppElo) / 400;
  const condFactor = (input.conditionIndex - 62) / 100;
  const userXg = clamp(
    1.25 + eloDiff * 0.9 + condFactor * 1.7 + input.attackBias * 0.6 + homeAdv,
    0.15,
    4.8
  );
  const oppXg = clamp(
    1.25 - eloDiff * 0.7 - condFactor * 0.9 + input.attackBias * 0.3 + (input.isHome ? 0 : 0.25),
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
  const { userXg, oppXg } = computeXg({
    userElo: eloHome,
    oppElo: eloAway,
    conditionIndex: 62,
    attackBias: 0,
    isHome: true,
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
  const used = new Set<number>();
  const randMinute = () => {
    let m = lo + Math.floor(rng() * (hi - lo));
    let guard = 0;
    while (used.has(m) && guard++ < 30) m = lo + Math.floor(rng() * (hi - lo));
    used.add(m);
    return m;
  };

  const goals: GoalEvent[] = [];
  for (let i = 0; i < userGoals; i++)
    goals.push({ minute: randMinute(), side: "user", scorer: pickScorer(input.placed, rng) });
  for (let i = 0; i < oppGoals; i++)
    goals.push({ minute: randMinute(), side: "opp" });
  goals.sort((a, b) => a.minute - b.minute);

  return { goals, userGoals, oppGoals, userXg: halfUserXg, oppXg: halfOppXg };
}

/** Combine both halves (using the final half's tactics for the verdict text) into a full-match result. */
export function combineHalves(input: SimInput, h1: HalfResult, h2: HalfResult): SimResult {
  const userGoals = h1.userGoals + h2.userGoals;
  const oppGoals = h1.oppGoals + h2.oppGoals;
  const goals = [...h1.goals, ...h2.goals].sort((a, b) => a.minute - b.minute);
  const simOutcome: "W" | "D" | "L" =
    userGoals > oppGoals ? "W" : userGoals < oppGoals ? "L" : "D";

  return {
    userGoals,
    oppGoals,
    userXg: h1.userXg + h2.userXg,
    oppXg: h1.oppXg + h2.oppXg,
    goals,
    comparison: buildComparison(input, userGoals, oppGoals, simOutcome),
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
