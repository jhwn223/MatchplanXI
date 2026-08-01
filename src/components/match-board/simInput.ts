import type { ConditionBreakdown } from "../../data/conditionEngine";
import { FORMATIONS, slotsOf, type FormationKey, type FormationSlot } from "../../data/formation";
import type { PlacedPlayerLite, SimInput } from "../../data/matchSim";
import { buildTeamAbilityProfile } from "../../data/playerAbility";
import type { TeamMatch } from "../../data/tournament";
import type { Player, Team } from "../../data/types";
import {
  simProfileFromTeamTactics,
  type TeamTactics,
} from "../match-arena/tactics";
import type { Lineup } from "./types";

export function toSimPlayer(
  player: Player,
  slot: Pick<FormationSlot, "id" | "label" | "position" | "x" | "y">,
  condition: number,
  enteredAtMinute = 0,
): PlacedPlayerLite {
  const ability = player.ability;
  const base = ability?.overall ?? 65;
  const gkBase = player.position === "GK" ? base : 12;
  return {
    playerId: player.player_id,
    teamId: player.team_id,
    name: player.player_name,
    slotId: slot.id,
    slotLabel: slot.label,
    naturalPosition: player.position,
    position: slot.position,
    baseX: 100 - slot.y,
    baseY: slot.x,
    enteredAtMinute,
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
  /** Match minute each player came on, keyed by player id; absent means a starter. */
  entryMinutes?: Map<number, number>;
  opponentEleven: Player[];
  opponentConditions: Map<number, ConditionBreakdown>;
  activeMatch: TeamMatch;
  team: Team;
  opponent?: Team;
  effectiveAttackBias: number;
  isKnockout: boolean;
  teamTactics: TeamTactics;
  opponentTactics?: TeamTactics;
  opponentFormation?: FormationKey;
  minimumPlayers?: number;
}

export function buildMatchSimInput(options: BuildSimInputOptions): SimInput | null {
  const {
    placedIds,
    teamIndex,
    formation,
    lineup,
    playersById,
    conditions,
    entryMinutes,
    opponentEleven,
    opponentConditions,
    activeMatch,
    team,
    opponent,
    effectiveAttackBias,
    isKnockout,
    teamTactics,
    opponentTactics,
    opponentFormation = "4-3-3",
    minimumPlayers = 11,
  } = options;
  if (placedIds.size < minimumPlayers || teamIndex == null) return null;

  const placed = formation
    .map((slot) => {
      const playerId = lineup.slots[slot.id];
      const player = playerId != null ? playersById.get(playerId) : null;
      if (!player) return null;
      const coordinate = lineup.positions?.[slot.id] ?? slot;
      return toSimPlayer(
        player,
        { ...slot, x: coordinate.x, y: coordinate.y },
        conditions.get(player.player_id)?.score ?? 65,
        entryMinutes?.get(player.player_id) ?? 0,
      );
    })
    .filter((player): player is PlacedPlayerLite => player != null);
  const selectedPlayers = [...placedIds]
    .map((id) => playersById.get(id))
    .filter((player): player is Player => player != null);
  const match = activeMatch.match;
  const opponentSlots = slotsOf(opponentFormation);

  return {
    // Decisions change probabilities, not the random stream itself. This makes
    // before/after tactical comparisons reproducible instead of rerolling a match.
    seed: match.match_id * 100003,
    userTeamName: team.team_name,
    oppTeamName: activeMatch.opponentName,
    userElo: team.elo_rating,
    oppElo: opponent?.elo_rating ?? 1600,
    conditionIndex: teamIndex,
    attackBias: effectiveAttackBias,
    oppAttackBias: FORMATIONS[opponentFormation].attackBias,
    isHome: activeMatch.isHome,
    elevation: activeMatch.elevation,
    placed,
    oppPlaced: opponentEleven.map((player, index) =>
      toSimPlayer(
        player,
        opponentSlots[index] ?? {
          id: `opp-${index}`,
          label: player.position,
          position: player.position,
          x: 50,
          y: player.position === "GK" ? 92 : player.position === "DEF" ? 75 : player.position === "MID" ? 50 : 20,
        },
        opponentConditions.get(player.player_id)?.score ?? 72,
      ),
    ),
    userAbility: buildTeamAbilityProfile(selectedPlayers, conditions),
    oppAbility: buildTeamAbilityProfile(opponentEleven, opponentConditions),
    actual: null,
    isKnockout,
    userTactics: simProfileFromTeamTactics(teamTactics),
    oppTactics: opponentTactics
      ? simProfileFromTeamTactics(opponentTactics)
      : undefined,
  };
}
