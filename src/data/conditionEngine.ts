function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Nonlinear penalty starting at 1000m elevation, maxing out around 2200m (Azteca). */
export function altitudePenalty(elevationMeters: number): number {
  const t = clamp((elevationMeters - 1000) / 1200, 0, 1);
  return 45 * Math.pow(t, 1.5);
}

/** Penalty for insufficient rest since the team's last match. */
export function restPenalty(restDays: number): number {
  return clamp(25 - (restDays - 2) * 10, 0, 25);
}

/** Penalty for heavy recent minutes load (up to 90 min = full penalty). */
export function fatiguePenalty(minutesPlayed: number): number {
  return clamp((minutesPlayed / 90) * 15, 0, 15);
}

/** Experienced players (high caps) partially offset the altitude penalty. */
export function experienceOffset(caps: number, altPenalty: number): number {
  const capFactor = clamp((caps - 20) / 80, 0, 1) * 20;
  return Math.min(altPenalty, capFactor);
}

/** Travel fatigue from the flight distance since the team's previous match. */
export function travelPenalty(travelKm: number): number {
  return clamp((travelKm / 4200) * 12, 0, 12);
}

/** Jet lag from the timezone shift since the team's previous match. */
export function jetLagPenalty(tzShiftHours: number): number {
  return clamp(Math.abs(tzShiftHours) * 5, 0, 15);
}

export interface ConditionInputs {
  elevationMeters: number;
  restDays: number;
  recentMinutes: number;
  caps: number;
  travelKm: number;
  tzShiftHours: number;
}

export interface ConditionBreakdown {
  score: number;
  altitudePenalty: number;
  restPenalty: number;
  fatiguePenalty: number;
  experienceOffset: number;
  travelPenalty: number;
  jetLagPenalty: number;
}

export function computePlayerCondition(inputs: ConditionInputs): ConditionBreakdown {
  const alt = altitudePenalty(inputs.elevationMeters);
  const rest = restPenalty(inputs.restDays);
  const fatigue = fatiguePenalty(inputs.recentMinutes);
  const travel = travelPenalty(inputs.travelKm);
  const jetLag = jetLagPenalty(inputs.tzShiftHours);
  const offset = experienceOffset(inputs.caps, alt);
  const score = clamp(100 - alt - rest - fatigue - travel - jetLag + offset, 0, 100);

  return {
    score,
    altitudePenalty: alt,
    restPenalty: rest,
    fatiguePenalty: fatigue,
    experienceOffset: offset,
    travelPenalty: travel,
    jetLagPenalty: jetLag,
  };
}

export function computeTeamIndex(scores: number[]): number | null {
  if (scores.length === 0) return null;
  return scores.reduce((sum, s) => sum + s, 0) / scores.length;
}

/** score 0 -> red (hue 0), score 100 -> green (hue 120), passing through yellow. */
export function conditionColor(score: number, opts?: { s?: number; l?: number }): string {
  const hue = clamp(score, 0, 100) * 1.2;
  const s = opts?.s ?? 72;
  const l = opts?.l ?? 46;
  return `hsl(${hue.toFixed(1)}, ${s}%, ${l}%)`;
}
