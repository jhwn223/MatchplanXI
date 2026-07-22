import type { GoalEvent } from "./matchSim";

export interface LeaderboardEntry {
  name: string;
  goals: number;
  assists: number;
}

/** player name -> cumulative tournament record (your squad only; opponents aren't named). */
export type Leaderboard = Record<string, LeaderboardEntry>;

function bump(board: Leaderboard, name: string, field: "goals" | "assists") {
  const prev = board[name] ?? { name, goals: 0, assists: 0 };
  board[name] = { ...prev, [field]: prev[field] + 1 };
}

/** Fold one match's goals into the running tournament leaderboard. */
export function applyMatchToLeaderboard(prev: Leaderboard, goals: GoalEvent[]): Leaderboard {
  const next: Leaderboard = { ...prev };
  for (const g of goals) {
    if (g.side !== "user") continue;
    if (g.scorer) bump(next, g.scorer, "goals");
    if (g.assist) bump(next, g.assist, "assists");
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
