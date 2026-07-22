import { currentCondition } from "./playerRuntime";
import { clamp } from "./random";
import { combineTeamStats, finalizeStats, type RunningStats } from "./stats";
import type {
  LiveMatchSnapshot,
  MatchSide,
  PlacedPlayerLite,
  PlayerMatchStats,
  SimInput,
} from "./types";

export type PlayerStatsBySide = Record<MatchSide, Map<string, PlayerMatchStats>>;

export function createPlayerStats(input: SimInput): PlayerStatsBySide {
  return {
    user: createSidePlayerStats("user", input.placed),
    opp: createSidePlayerStats("opp", input.oppPlaced),
  };
}

function createSidePlayerStats(side: MatchSide, players: PlacedPlayerLite[]) {
  return new Map(players.map((player) => [player.name, {
    side,
    name: player.name,
    position: player.position,
    condition: player.condition,
    rating: 6,
    touches: 0,
    passesAttempted: 0,
    passesCompleted: 0,
    dribblesAttempted: 0,
    dribblesCompleted: 0,
    tacklesWon: 0,
    interceptions: 0,
    shots: 0,
    shotsOnTarget: 0,
    goals: 0,
    assists: 0,
    saves: 0,
    distanceKm: 0,
  } satisfies PlayerMatchStats]));
}

export function playerStat(stats: PlayerStatsBySide, side: MatchSide, player: PlacedPlayerLite) {
  return stats[side].get(player.name);
}

function playerRating(stat: PlayerMatchStats): number {
  const passAccuracy = stat.passesAttempted ? stat.passesCompleted / stat.passesAttempted : 0.75;
  const missedPasses = stat.passesAttempted - stat.passesCompleted;
  const missedShots = stat.shots - stat.shotsOnTarget;
  const value = 6
    + stat.goals * 1.15
    + stat.assists * 0.7
    + stat.shotsOnTarget * 0.1
    + stat.dribblesCompleted * 0.08
    + stat.tacklesWon * 0.1
    + stat.interceptions * 0.1
    + stat.saves * 0.12
    + (passAccuracy - 0.75) * Math.min(1.2, stat.passesAttempted / 10)
    - missedPasses * 0.015
    - missedShots * 0.04;
  return Math.round(clamp(value, 4, 10) * 10) / 10;
}

function distanceAtMinute(player: PlacedPlayerLite, stat: PlayerMatchStats, minute: number, elevation: number) {
  const roleRate = player.position === "MID" ? 0.122 : player.position === "FWD" ? 0.116 : player.position === "DEF" ? 0.108 : 0.052;
  const workRate = 0.9 + clamp((player.stamina - 55) / 250, -0.08, 0.14);
  const actionBonus = Math.min(0.7, (stat.touches + stat.tacklesWon + stat.interceptions) * 0.006);
  const altitudePenalty = clamp((elevation - 1200) / 12000, 0, 0.12);
  return Math.round((minute * roleRate * workRate * (1 - altitudePenalty) + actionBonus) * 10) / 10;
}

export function finalizePlayerStats(
  input: SimInput,
  stats: PlayerStatsBySide,
  minute: number
): PlayerMatchStats[] {
  const result: PlayerMatchStats[] = [];
  for (const side of ["user", "opp"] as const) {
    const players = side === "user" ? input.placed : input.oppPlaced;
    for (const player of players) {
      const stat = stats[side].get(player.name);
      if (!stat) continue;
      result.push({
        ...stat,
        condition: currentCondition(player, minute, input.elevation),
        rating: playerRating(stat),
        distanceKm: distanceAtMinute(player, stat, minute, input.elevation),
      });
    }
  }
  return result;
}

export function createLiveSnapshot(
  input: SimInput,
  minute: number,
  running: Record<MatchSide, RunningStats>,
  stats: PlayerStatsBySide,
  goals: { side: MatchSide }[]
): LiveMatchSnapshot {
  return {
    minute,
    userGoals: goals.filter((goal) => goal.side === "user").length,
    oppGoals: goals.filter((goal) => goal.side === "opp").length,
    userXg: Math.round(running.user.xg * 100) / 100,
    oppXg: Math.round(running.opp.xg * 100) / 100,
    teamStats: {
      user: finalizeStats(running.user, running.opp),
      opp: finalizeStats(running.opp, running.user),
    },
    players: finalizePlayerStats(input, stats, minute),
  };
}

export function combinePlayerStats(a: PlayerMatchStats[], b: PlayerMatchStats[]): PlayerMatchStats[] {
  const combined = new Map<string, PlayerMatchStats>();
  for (const stat of [...a, ...b]) {
    const key = `${stat.side}:${stat.name}`;
    const previous = combined.get(key);
    if (!previous) {
      combined.set(key, { ...stat });
      continue;
    }
    const merged = {
      ...stat,
      touches: previous.touches + stat.touches,
      passesAttempted: previous.passesAttempted + stat.passesAttempted,
      passesCompleted: previous.passesCompleted + stat.passesCompleted,
      dribblesAttempted: previous.dribblesAttempted + stat.dribblesAttempted,
      dribblesCompleted: previous.dribblesCompleted + stat.dribblesCompleted,
      tacklesWon: previous.tacklesWon + stat.tacklesWon,
      interceptions: previous.interceptions + stat.interceptions,
      shots: previous.shots + stat.shots,
      shotsOnTarget: previous.shotsOnTarget + stat.shotsOnTarget,
      goals: previous.goals + stat.goals,
      assists: previous.assists + stat.assists,
      saves: previous.saves + stat.saves,
      distanceKm: stat.distanceKm,
    };
    merged.rating = playerRating(merged);
    combined.set(key, merged);
  }
  return [...combined.values()];
}

export function combineLiveSnapshots(
  previous: LiveMatchSnapshot[],
  next: LiveMatchSnapshot[]
): LiveMatchSnapshot[] {
  if (!previous.length) return next;
  const base = previous[previous.length - 1];
  const cumulative = next.map((snapshot) => ({
    ...snapshot,
    userGoals: base.userGoals + snapshot.userGoals,
    oppGoals: base.oppGoals + snapshot.oppGoals,
    userXg: Math.round((base.userXg + snapshot.userXg) * 100) / 100,
    oppXg: Math.round((base.oppXg + snapshot.oppXg) * 100) / 100,
    teamStats: {
      user: combineTeamStats(base.teamStats.user, snapshot.teamStats.user),
      opp: combineTeamStats(base.teamStats.opp, snapshot.teamStats.opp),
    },
    players: combinePlayerStats(base.players, snapshot.players),
  }));
  return [...previous, ...cumulative.filter((snapshot) => snapshot.minute > base.minute)];
}

export function snapshotAtMinute(snapshots: LiveMatchSnapshot[], minute: number): LiveMatchSnapshot | null {
  let found: LiveMatchSnapshot | null = null;
  for (const snapshot of snapshots) {
    if (snapshot.minute > minute) break;
    found = snapshot;
  }
  return found ?? snapshots[0] ?? null;
}
