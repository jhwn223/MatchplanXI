import type { RefObject } from "react";
import type { ConditionBreakdown } from "../../data/conditionEngine";
import type { FormationKey, SlotPositions } from "../../data/formation";
import type { Leaderboard } from "../../data/leaderboard";
import type { Team } from "../../data/types";
import type { OpponentPlan } from "../match-board/opponentPlan";
import type {
  GoalEvent,
  HalfResult,
  LiveMatchSnapshot,
  MatchEvent,
  MatchSide,
  PenaltyResult,
  PositionSample,
  SimComparison,
  SimInput,
  TeamStats,
} from "../../data/matchSim";
import type { TacticStyleKey } from "../../data/tactics";
import type { PlayerRole, SlotRoleAssignments } from "../../data/playerRoles";
import type { Player } from "../../data/types";
import type { TeamTactics } from "./tactics";

/**
 * Everything the in-match squad and opponent tabs need. Grouped into one
 * optional prop so the arena still works standalone (replays, tests) without
 * a dozen extra parameters, and so the board can hand its own lineup state
 * straight through.
 */
export interface ArenaSquadControls {
  conditions: Map<number, ConditionBreakdown>;
  benchPlayers: Player[];
  benchedOut: Set<number>;
  pitchRef: RefObject<HTMLDivElement | null>;
  subsUsed: number;
  maxSubs: number;
  onSelectPlayer: (player: Player) => void;
  onResetPositions: () => void;
  opponent?: Team;
  opponentConditions: Map<number, ConditionBreakdown>;
  opponentPlan?: OpponentPlan | null;
}

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
  /**
   * Events from the periods already played. Each period mounts its own arena,
   * so the running booking list needs the earlier halves handed to it or it
   * would restart empty after the interval.
   */
  priorEvents?: MatchEvent[];
  /** Enables the in-match squad and opponent tabs when supplied. */
  squadControls?: ArenaSquadControls;
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
  slotRoles?: SlotRoleAssignments;
  playersById: Map<number, Player>;
  opponentPlayers: Player[];
  opponentBench: Player[];
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
  onRoleChange?: (slotId: string, role: PlayerRole) => void;
  onOpponentTacticChange?: (tactics: TeamTactics) => void;
  onFormationChange?: (formation: FormationKey) => void;
  onPlayerDismissed?: (side: MatchSide, playerId: number) => void;
  /** Reports the clock so a substitution can be stamped with the minute it happened. */
  onMinuteChange?: (minute: number) => void;
  onPeriodComplete: (period: HalfResult) => ArenaSim;
  onComplete: () => void;
  /**
   * Call when the user resumes the match from the paused squad-edit screen
   * ("경기 재개") — this is the point where any bench swaps made while paused
   * become permanent. Optional since not every MatchArena usage exposes the
   * squad tab.
   */
  onCommitSubstitutions?: () => void;
  onClose: () => void;
  /** Leave the finished match and return to the schedule/bracket screen. */
  onSchedule?: () => void;
  onNext?: () => void;
}
