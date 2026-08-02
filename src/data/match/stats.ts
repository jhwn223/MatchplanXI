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
  fouls: number;
  yellowCards: number;
  redCards: number;
  corners: number;
  offsides: number;
  injuries: number;
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
    fouls: 0,
    yellowCards: 0,
    redCards: 0,
    corners: 0,
    offsides: 0,
    injuries: 0,
    xg: 0,
  };
}

export function finalizeStats(running: RunningStats, other: RunningStats): TeamStats {
  const totalPossessionTouches = running.possessionTouches + other.possessionTouches;
  const shotsFaced = other.shotsOnTarget;
  return {
    passSuccessRate: running.passesAttempted
      ? Math.round((running.passesCompleted / running.passesAttempted) * 100)
      : 0,
    shotsFaced,
    saves: running.saves,
    saveRate: shotsFaced ? Math.round((running.saves / shotsFaced) * 100) : 100,
    possession: totalPossessionTouches
      ? Math.round((running.possessionTouches / totalPossessionTouches) * 100)
      : 50,
    possessionTouches: running.possessionTouches,
    totalPossessionTouches,
    passesAttempted: running.passesAttempted,
    passesCompleted: running.passesCompleted,
    shots: running.shots,
    shotsOnTarget: running.shotsOnTarget,
    tacklesWon: running.tacklesWon,
    interceptions: running.interceptions,
    fouls: running.fouls,
    yellowCards: running.yellowCards,
    redCards: running.redCards,
    corners: running.corners,
    offsides: running.offsides,
    injuries: running.injuries,
  };
}

export function combineTeamStats(a: TeamStats, b: TeamStats): TeamStats {
  const passesAttempted = a.passesAttempted + b.passesAttempted;
  const passesCompleted = a.passesCompleted + b.passesCompleted;
  const shotsFaced = a.shotsFaced + b.shotsFaced;
  const saves = a.saves + b.saves;
  const possessionTouches = a.possessionTouches + b.possessionTouches;
  const totalPossessionTouches = a.totalPossessionTouches + b.totalPossessionTouches;
  return {
    passSuccessRate: passesAttempted ? Math.round((passesCompleted / passesAttempted) * 100) : 0,
    shotsFaced,
    saves,
    saveRate: shotsFaced ? Math.round((saves / shotsFaced) * 100) : 100,
    possession: totalPossessionTouches
      ? Math.round((possessionTouches / totalPossessionTouches) * 100)
      : 50,
    possessionTouches,
    totalPossessionTouches,
    passesAttempted,
    passesCompleted,
    shots: a.shots + b.shots,
    shotsOnTarget: a.shotsOnTarget + b.shotsOnTarget,
    tacklesWon: a.tacklesWon + b.tacklesWon,
    interceptions: a.interceptions + b.interceptions,
    fouls: a.fouls + b.fouls,
    yellowCards: a.yellowCards + b.yellowCards,
    redCards: a.redCards + b.redCards,
    corners: a.corners + b.corners,
    offsides: a.offsides + b.offsides,
    injuries: a.injuries + b.injuries,
  };
}

export function finalizeTeamStatsPair(running: Record<"user" | "opp", RunningStats>) {
  const user = finalizeStats(running.user, running.opp);
  const opp = finalizeStats(running.opp, running.user);
  opp.possession = 100 - user.possession;
  return { user, opp };
}

export function combineTeamStatsPair(
  a: { user: TeamStats; opp: TeamStats },
  b: { user: TeamStats; opp: TeamStats }
) {
  const user = combineTeamStats(a.user, b.user);
  const opp = combineTeamStats(a.opp, b.opp);
  opp.possession = 100 - user.possession;
  return { user, opp };
}
