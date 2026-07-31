import type { FormationKey, SlotPositions } from "../../data/formation";
import type { Leaderboard } from "../../data/leaderboard";
import type {
  GoalEvent,
  HalfResult,
  LiveMatchSnapshot,
  MatchEvent,
  PenaltyResult,
  PositionSample,
  SimComparison,
  SimInput,
  TeamStats,
} from "../../data/matchSim";
import type { TacticStyleKey } from "../../data/tactics";
import type { Player } from "../../data/types";
import type { TeamTactics } from "./tactics";

export interface ArenaSim {
  goals: GoalEvent[];
  events?: MatchEvent[];
  positionSamples?: PositionSample[];
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
  simInput: SimInput;
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
  initialTactics?: TeamTactics;
  initialOpponentTactics?: TeamTactics;
  opponentFormation?: FormationKey;
  onTacticChange?: (tactics: TeamTactics) => void;
  onOpponentTacticChange?: (tactics: TeamTactics) => void;
  onFormationChange?: (formation: FormationKey) => void;
  onPeriodComplete: (period: HalfResult) => ArenaSim;
  onComplete: () => void;
  onClose: () => void;
  onNext?: () => void;
}
