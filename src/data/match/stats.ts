import type { TeamStats } from "./types";

export interface RunningStats {
  possessionTouches: number;
  passesAttempted: number;
  passesCompleted: number;
  shots: number;
  shotsOnTarget: number;
  saves: number;
  tacklesWon: number;
  interceptions: number;
  xg: number;
}

export function emptyRunningStats(): RunningStats {
  return {
    possessionTouches: 0,
    passesAttempted: 0,
    passesCompleted: 0,
    shots: 0,
    shotsOnTarget: 0,
    saves: 0,
    tacklesWon: 0,
    interceptions: 0,
    xg: 0,
  };
}

export function finalizeStats(running: RunningStats, other: RunningStats): TeamStats {
  const totalTouches = Math.max(1, running.possessionTouches + other.possessionTouches);
  const shotsFaced = other.shotsOnTarget;
  return {
    passSuccessRate: running.passesAttempted
      ? Math.round((running.passesCompleted / running.passesAttempted) * 100)
      : 0,
    shotsFaced,
    saves: running.saves,
    saveRate: shotsFaced ? Math.round((running.saves / shotsFaced) * 100) : 100,
    possession: Math.round((running.possessionTouches / totalTouches) * 100),
    passesAttempted: running.passesAttempted,
    passesCompleted: running.passesCompleted,
    shots: running.shots,
    shotsOnTarget: running.shotsOnTarget,
    tacklesWon: running.tacklesWon,
    interceptions: running.interceptions,
  };
}

export function combineTeamStats(a: TeamStats, b: TeamStats, aWeight = 1, bWeight = 1): TeamStats {
  const passesAttempted = a.passesAttempted + b.passesAttempted;
  const passesCompleted = a.passesCompleted + b.passesCompleted;
  const shotsFaced = a.shotsFaced + b.shotsFaced;
  const saves = a.saves + b.saves;
  return {
    passSuccessRate: passesAttempted ? Math.round((passesCompleted / passesAttempted) * 100) : 0,
    shotsFaced,
    saves,
    saveRate: shotsFaced ? Math.round((saves / shotsFaced) * 100) : 100,
    possession: Math.round((a.possession * aWeight + b.possession * bWeight) / (aWeight + bWeight)),
    passesAttempted,
    passesCompleted,
    shots: a.shots + b.shots,
    shotsOnTarget: a.shotsOnTarget + b.shotsOnTarget,
    tacklesWon: a.tacklesWon + b.tacklesWon,
    interceptions: a.interceptions + b.interceptions,
  };
}
