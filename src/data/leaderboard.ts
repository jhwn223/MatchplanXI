import type { GoalEvent, SimResult } from "./matchSim";

export interface LeaderboardEntry {
  playerId?: number;
  name: string;
  goals: number;
  assists: number;
  appearances: number;
  goalsConceded: number;
  saves: number;
  cleanSheets: number;
}

/** Stable player id (legacy saves may still use a name) -> cumulative record. */
export type Leaderboard = Record<string, LeaderboardEntry>;

function emptyEntry(name: string, playerId?: number): LeaderboardEntry {
  return {
    playerId,
    name,
    goals: 0,
    assists: 0,
    appearances: 0,
    goalsConceded: 0,
    saves: 0,
    cleanSheets: 0,
  };
}

function keyOf(name: string, playerId?: number) {
  return playerId == null ? name : String(playerId);
}

function bump(
  board: Leaderboard,
  name: string,
  playerId: number | undefined,
  field: "goals" | "assists",
) {
  const key = keyOf(name, playerId);
  const prev = board[key] ?? emptyEntry(name, playerId);
  board[key] = { ...prev, [field]: prev[field] + 1 };
}

function addGoalEvents(next: Leaderboard, goals: GoalEvent[]) {
  for (const goal of goals) {
    if (goal.side !== "user") continue;
    if (goal.scorer) bump(next, goal.scorer, goal.scorerId, "goals");
    if (goal.assist) bump(next, goal.assist, goal.assistId, "assists");
  }
}

/** Fold one match into the running tournament player records. */
export function applyMatchToLeaderboard(prev: Leaderboard, sim: SimResult): Leaderboard {
  const next: Leaderboard = { ...prev };
  addGoalEvents(next, sim.goals);
  for (const player of sim.playerStats) {
    if (player.side !== "user" || player.position !== "GK" || player.minutesPlayed <= 0) continue;
    const key = keyOf(player.name, player.playerId);
    const previous = next[key] ?? emptyEntry(player.name, player.playerId);
    next[key] = {
      ...previous,
      appearances: previous.appearances + 1,
      goalsConceded: previous.goalsConceded + sim.oppGoals,
      saves: previous.saves + player.saves,
      cleanSheets: previous.cleanSheets + (sim.oppGoals === 0 ? 1 : 0),
    };
  }
  return next;
}

export function topScorers(board: Leaderboard, limit = 5): LeaderboardEntry[] {
  return Object.values(board)
    .filter((e) => e.goals > 0)
    .sort((a, b) => b.goals - a.goals || b.assists - a.assists)
    .slice(0, limit);
}

export function topAssists(board: Leaderboard, limit = 5): LeaderboardEntry[] {
  return Object.values(board)
    .filter((e) => e.assists > 0)
    .sort((a, b) => b.assists - a.assists || b.goals - a.goals)
    .slice(0, limit);
}
