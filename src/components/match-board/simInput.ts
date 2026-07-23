import type { ConditionBreakdown } from "../../data/conditionEngine";
import type { FormationSlot } from "../../data/formation";
import type { PlacedPlayerLite, SimInput } from "../../data/matchSim";
import { buildTeamAbilityProfile } from "../../data/playerAbility";
import type { TeamMatch } from "../../data/tournament";
import type { Player, Team } from "../../data/types";
import {
  simProfileFromTeamTactics,
  type TeamTactics,
} from "../match-arena/tactics";
import type { Lineup } from "./types";

export function toSimPlayer(player: Player, assignedPosition: Player["position"], condition: number): PlacedPlayerLite {
  const ability = player.ability;
  const base = ability?.overall ?? 65;
  const gkBase = player.position === "GK" ? base : 12;
  return {
    name: player.player_name,
    naturalPosition: player.position,
    position: assignedPosition,
    overall: base,
    pace: ability?.pace ?? base,
    acceleration: ability?.acceleration ?? ability?.pace ?? base,
    shooting: ability?.shooting ?? 58,
    finishing: ability?.finishing ?? 58,
    positioning: ability?.positioning ?? 60,
    shotPower: ability?.shotPower ?? ability?.shooting ?? 58,
    longShots: ability?.longShots ?? ability?.shooting ?? 55,
    passing: ability?.passing ?? 62,
    vision: ability?.vision ?? ability?.passing ?? 62,
    shortPassing: ability?.shortPassing ?? ability?.passing ?? 62,
    longPassing: ability?.longPassing ?? ability?.passing ?? 60,
    dribbling: ability?.dribbling ?? 62,
    ballControl: ability?.ballControl ?? ability?.dribbling ?? 62,
    agility: ability?.agility ?? ability?.pace ?? 62,
    composure: ability?.composure ?? base,
    reactions: ability?.reactions ?? base,
    defending: ability?.defending ?? 58,
    interceptions: ability?.interceptions ?? ability?.defending ?? 58,
    defensiveAwareness: ability?.defensiveAwareness ?? ability?.defending ?? 58,
    standingTackle: ability?.standingTackle ?? ability?.defending ?? 58,
    physical: ability?.physical ?? 65,
    strength: ability?.strength ?? ability?.physical ?? 65,
    aggression: ability?.aggression ?? ability?.physical ?? 62,
    stamina: ability?.stamina ?? ability?.physical ?? 65,
    penalties: ability?.penalties ?? ability?.finishing ?? 60,
    gkDiving: ability?.gkDiving ?? gkBase,
    gkHandling: ability?.gkHandling ?? gkBase,
    gkPositioning: ability?.gkPositioning ?? gkBase,
    gkReflexes: ability?.gkReflexes ?? gkBase,
    condition,
  };
}

interface BuildSimInputOptions {
  placedIds: Set<number>;
  teamIndex: number | null;
  formation: FormationSlot[];
  lineup: Lineup;
  playersById: Map<number, Player>;
  conditions: Map<number, ConditionBreakdown>;
  opponentEleven: Player[];
  activeMatch: TeamMatch;
  team: Team;
  opponent?: Team;
  effectiveAttackBias: number;
  isKnockout: boolean;
  teamTactics: TeamTactics;
}

export function buildMatchSimInput(options: BuildSimInputOptions): SimInput | null {
  const {
    placedIds,
    teamIndex,
    formation,
    lineup,
    playersById,
    conditions,
    opponentEleven,
    activeMatch,
    team,
    opponent,
    effectiveAttackBias,
    isKnockout,
    teamTactics,
  } = options;
  if (placedIds.size < 11 || teamIndex == null) return null;

  const placed = formation
    .map((slot) => {
      const playerId = lineup.slots[slot.id];
      const player = playerId != null ? playersById.get(playerId) : null;
      return player ? toSimPlayer(player, slot.position, conditions.get(player.player_id)?.score ?? 65) : null;
    })
    .filter((player): player is PlacedPlayerLite => player != null);
  const selectedPlayers = [...placedIds]
    .map((id) => playersById.get(id))
    .filter((player): player is Player => player != null);
  const positionSeed = formation.reduce((sum, slot, index) => {
    const current = lineup.positions?.[slot.id] ?? slot;
    return sum + Math.round(current.x * 7 + current.y * 13) * (index + 1);
  }, 0);
  const match = activeMatch.match;

  return {
    seed:
      match.match_id * 100003 +
      [...placedIds].reduce((sum, id) => sum + id, 0) * 31 +
      lineup.formation.length * 7 +
      positionSeed,
    userTeamName: team.team_name,
    oppTeamName: activeMatch.opponentName,
    userElo: team.elo_rating,
    oppElo: opponent?.elo_rating ?? 1600,
    conditionIndex: teamIndex,
    attackBias: effectiveAttackBias,
    isHome: activeMatch.isHome,
    elevation: activeMatch.elevation,
    placed,
    oppPlaced: opponentEleven.map((player) => toSimPlayer(player, player.position, 72)),
    userAbility: buildTeamAbilityProfile(selectedPlayers, conditions),
    oppAbility: buildTeamAbilityProfile(opponentEleven),
    actual: null,
    isKnockout,
    userTactics: simProfileFromTeamTactics(teamTactics),
  };
}
