import { useMemo } from "react";
import {
  clubTimezoneOffset,
  computePlayerCondition,
  estimateFlightHours,
  estimateTimezoneOffset,
  type ConditionBreakdown,
} from "../data/conditionEngine";
import { getPlayerMinutesBeforeMatch, type TeamMatch } from "../data/tournament";
import type { TournamentData } from "../data/types";

/** Per-match conditions: altitude comes from the match venue, rest days from the
 *  gap since the team's previous match, fatigue from minutes in that previous match,
 *  jetlag/flight time from the player's (deterministic) club timezone vs. the host city,
 *  and an optional per-player rest⇄training slider bias. */
export function usePlayerConditions(
  data: TournamentData | null,
  teamId: number | null,
  teamMatches: TeamMatch[],
  activeMatch: TeamMatch | null,
  restBias?: Map<number, number>
): Map<number, ConditionBreakdown> {
  return useMemo(() => {
    const map = new Map<number, ConditionBreakdown>();
    if (!data || teamId == null || !activeMatch) return map;

    const hostTz = activeMatch.venue ? estimateTimezoneOffset(activeMatch.venue.longitude) : 0;
    const squad = data.players.filter((p) => p.team_id === teamId);
    for (const player of squad) {
      const recentMinutes = getPlayerMinutesBeforeMatch(
        data,
        teamMatches,
        activeMatch.match.match_id,
        player.player_id
      );
      const clubTz = clubTimezoneOffset(`${player.player_id}:${player.club_team}`);
      const jetlagHours = Math.abs(clubTz - hostTz);
      const flightHours = estimateFlightHours(jetlagHours, String(player.player_id));
      map.set(
        player.player_id,
        computePlayerCondition({
          elevationMeters: activeMatch.elevation,
          restDays: activeMatch.restDays,
          recentMinutes,
          caps: player.caps,
          jetlagHours,
          flightHours,
          restBias: restBias?.get(player.player_id) ?? 50,
        })
      );
    }
    return map;
  }, [data, teamId, teamMatches, activeMatch, restBias]);
}
