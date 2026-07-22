import type { FormationKey, SlotPositions } from "../../data/formation";
import type { Leaderboard } from "../../data/leaderboard";
import type { GoalEvent, LiveMatchSnapshot, MatchEvent, PenaltyResult, SimComparison, TeamStats } from "../../data/matchSim";
import type { TacticStyleKey } from "../../data/tactics";
import type { Player } from "../../data/types";
import type { TeamTactics } from "./tactics";

export interface ArenaSim {
  goals: GoalEvent[];
  events?: MatchEvent[];
  userGoals: number;
  oppGoals: number;
  userXg?: number;
  oppXg?: number;
  comparison?: SimComparison;
  teamStats?: { user: TeamStats; opp: TeamStats };
  liveSnapshots?: LiveMatchSnapshot[];
  wentToExtraTime?: boolean;
  penalties?: PenaltyResult | null;
  regulationUserGoals?: number;
  regulationOppGoals?: number;
}

export interface MatchArenaProps {
  sim: ArenaSim;
  userTeamName: string;
  userCode: string;
  oppTeamName: string;
  oppCode: string;
  userColor: string;
  formation: FormationKey;
  formationLabel?: string;
  tacticStyleKey?: TacticStyleKey | null;
  slots: Record<string, number | null>;
  positions?: SlotPositions;
  playersById: Map<number, Player>;
  opponentPlayers: Player[];
  leaderboard: Leaderboard;
  startMinute?: number;
  endMinute?: number;
  startScore?: [number, number];
  final?: boolean;
  interimLabel?: string;
  interimCta?: string;
  onInterimContinue?: () => void;
  onTacticChange?: (tactics: TeamTactics) => void;
  onComplete: () => void;
  onClose: () => void;
  onNext?: () => void;
}
