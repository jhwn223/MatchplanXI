import type { FormationKey, SlotPositions } from "../../data/formation";
import type { Leaderboard } from "../../data/leaderboard";
import type { SimResult } from "../../data/matchSim";
import type { Slots, TacticStyleKey } from "../../data/tactics";
import type { PlayedResult, TeamMatch } from "../../data/tournament";
import type { Team, TournamentData } from "../../data/types";
import type { SlotRoleAssignments } from "../../data/playerRoles";
import type { TeamTactics } from "../match-arena/tactics";

export type MatchPhase = "idle" | "half1" | "halftime" | "half2" | "etbreak" | "extratime";

export const MAX_SUBS = 5;
export const MAX_SUBS_ET = 6;

export interface Lineup {
  formation: FormationKey;
  slots: Slots;
  positions?: SlotPositions;
  presetKey?: string | null;
  tacticStyleKey?: TacticStyleKey | null;
  teamTactics?: TeamTactics;
  /** Tactical instructions belong to formation slots, so substitutes inherit them. */
  slotRoles?: SlotRoleAssignments;
}

export interface MatchBoardProps {
  data: TournamentData;
  team: Team;
  teamMatches: TeamMatch[];
  activeMatch: TeamMatch;
  lineup: Lineup;
  onChangeLineup: (next: Lineup) => void;
  onBack: () => void;
  onPlayed: (matchId: number, result: PlayedResult) => void;
  onMatchSim: (sim: SimResult) => void;
  leaderboard: Leaderboard;
  onNextMatch: () => void;
}
