import type { HalfResult, MatchSide } from "./types";

export interface MatchInvariantIssue {
  code: string;
  message: string;
}

export function validateHalfResult(result: HalfResult): MatchInvariantIssue[] {
  const issues: MatchInvariantIssue[] = [];
  const add = (code: string, message: string) => issues.push({ code, message });

  for (const side of ["user", "opp"] as MatchSide[]) {
    const team = result.teamStats[side];
    const players = result.playerStats.filter((player) => player.side === side);
    const sum = (select: (player: (typeof players)[number]) => number) =>
      players.reduce((total, player) => total + select(player), 0);

    if (team.passesCompleted > team.passesAttempted) {
      add("TEAM_PASS_OVERFLOW", `${side}: completed passes exceed attempts`);
    }
    if (team.shotsOnTarget > team.shots) {
      add("TEAM_SHOT_OVERFLOW", `${side}: shots on target exceed shots`);
    }
    if (sum((player) => player.passesAttempted) !== team.passesAttempted) {
      add("PLAYER_TEAM_PASS_ATTEMPTS", `${side}: player and team pass attempts differ`);
    }
    if (sum((player) => player.passesCompleted) !== team.passesCompleted) {
      add("PLAYER_TEAM_PASS_COMPLETED", `${side}: player and team completed passes differ`);
    }
    if (sum((player) => player.shots) !== team.shots) {
      add("PLAYER_TEAM_SHOTS", `${side}: player and team shots differ`);
    }
    if (sum((player) => player.shotsOnTarget) !== team.shotsOnTarget) {
      add("PLAYER_TEAM_SHOTS_ON_TARGET", `${side}: player and team shots on target differ`);
    }
    if (sum((player) => player.goals) !== (side === "user" ? result.userGoals : result.oppGoals)) {
      add("PLAYER_TEAM_GOALS", `${side}: player goals and score differ`);
    }
  }

  if (result.teamStats.user.possession + result.teamStats.opp.possession !== 100) {
    add("POSSESSION_TOTAL", "team possession does not total 100");
  }
  if (result.goals.length !== result.userGoals + result.oppGoals) {
    add("GOAL_EVENT_TOTAL", "goal events and score differ");
  }
  for (const event of result.events) {
    if (event.x != null && (event.x < 0 || event.x > 100)) {
      add("EVENT_X_BOUNDS", `event x coordinate outside pitch: ${event.x}`);
    }
    if (event.y != null && (event.y < 0 || event.y > 100)) {
      add("EVENT_Y_BOUNDS", `event y coordinate outside pitch: ${event.y}`);
    }
  }
  return issues;
}

export function assertValidHalfResult(result: HalfResult) {
  const issues = validateHalfResult(result);
  if (issues.length) {
    throw new Error(issues.map((issue) => `${issue.code}: ${issue.message}`).join("\n"));
  }
}
