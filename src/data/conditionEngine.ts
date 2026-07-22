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

function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/** Rough club-league UTC offset buckets, picked deterministically per player so the
 *  same player always "lives" in the same timezone across renders. */
const CLUB_LEAGUE_TZ = [1, 0, -3, -6, 3, 9, 3];

/** Deterministic (but arbitrary) club timezone offset for a player, keyed by a stable string. */
export function clubTimezoneOffset(seedKey: string): number {
  return CLUB_LEAGUE_TZ[hashStr(seedKey) % CLUB_LEAGUE_TZ.length];
}

/** Rough host-city UTC offset estimated from longitude (~15° per hour). */
export function estimateTimezoneOffset(longitude: number): number {
  return Math.round(longitude / 15);
}

/** Estimated flight hours for the trip: base + jetlag-scaled distance + a per-player noise term. */
export function estimateFlightHours(jetlagHours: number, seedKey: string): number {
  const noise = (hashStr(seedKey + ":flight") % 100) / 100;
  return clamp(2 + jetlagHours * 1.3 + noise * 2, 2, 16);
}

/** Penalty from crossing timezones to reach the host city. */
export function jetlagPenalty(jetlagHours: number): number {
  return clamp(jetlagHours * 2.2, 0, 20);
}

/** Penalty from time spent travelling, beyond what jetlag already accounts for. */
export function flightPenalty(flightHours: number): number {
  return clamp((flightHours - 2) * 1.1, 0, 14);
}

/** Rest⇄training slider effect: 0 = full rest (+10), 50 = neutral, 100 = full training (-10). */
export function restBiasAdjust(restBias: number): number {
  return ((50 - restBias) / 50) * 10;
}

export interface ConditionInputs {
  elevationMeters: number;
  restDays: number;
  recentMinutes: number;
  caps: number;
  jetlagHours: number;
  flightHours: number;
  /** 0-100 rest⇄training slider, defaults to 50 (neutral) if omitted. */
  restBias?: number;
}

export interface ConditionBreakdown {
  score: number;
  altitudePenalty: number;
  restPenalty: number;
  fatiguePenalty: number;
  experienceOffset: number;
  jetlagPenalty: number;
  flightPenalty: number;
  jetlagHours: number;
  flightHours: number;
  restBiasAdjust: number;
}

export function computePlayerCondition(inputs: ConditionInputs): ConditionBreakdown {
  const alt = altitudePenalty(inputs.elevationMeters);
  const rest = restPenalty(inputs.restDays);
  const fatigue = fatiguePenalty(inputs.recentMinutes);
  const offset = experienceOffset(inputs.caps, alt);
  const jetlag = jetlagPenalty(inputs.jetlagHours);
  const flight = flightPenalty(inputs.flightHours);
  const biasAdjust = restBiasAdjust(inputs.restBias ?? 50);
  const score = clamp(100 - alt - rest - fatigue - jetlag - flight + offset + biasAdjust, 0, 100);

  return {
    score,
    altitudePenalty: alt,
    restPenalty: rest,
    fatiguePenalty: fatigue,
    experienceOffset: offset,
    jetlagPenalty: jetlag,
    flightPenalty: flight,
    jetlagHours: inputs.jetlagHours,
    flightHours: inputs.flightHours,
    restBiasAdjust: biasAdjust,
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
