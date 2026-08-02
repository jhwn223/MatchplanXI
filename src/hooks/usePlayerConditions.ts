import { useMemo } from "react";
import { computePlayerCondition, type ConditionBreakdown } from "../data/conditionEngine";
import { getPlayerMinutesBeforeMatch, type TeamMatch } from "../data/tournament";
import type { TournamentData } from "../data/types";

/** Per-match conditions: altitude comes from the match venue, rest days from the
 *  gap since the team's previous match, fatigue from minutes in that previous match. */
export function usePlayerConditions(
  data: TournamentData | null,
  teamId: number | null,
  teamMatches: TeamMatch[],
  activeMatch: TeamMatch | null
): Map<number, ConditionBreakdown> {
  return useMemo(() => {
    const map = new Map<number, ConditionBreakdown>();
    if (!data || teamId == null || !activeMatch) return map;

    const squad = data.players.filter((p) => p.team_id === teamId);
    for (const player of squad) {
      const recentMinutes = getPlayerMinutesBeforeMatch(
        data,
        teamMatches,
        activeMatch.match.match_id,
        player.player_id
      );
      map.set(
        player.player_id,
        computePlayerCondition({
          elevationMeters: activeMatch.elevation,
          restDays: activeMatch.restDays,
          recentMinutes,
          caps: player.caps,
          travelKm: activeMatch.travelKm,
          tzShiftHours: activeMatch.tzShiftHours,
        })
      );
    }
    return map;
  }, [data, teamId, teamMatches, activeMatch]);
}
