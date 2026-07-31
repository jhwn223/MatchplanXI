import type { RefObject } from "react";
import type { ConditionBreakdown } from "../../data/conditionEngine";
import type { FormationKey, SlotPositions } from "../../data/formation";
import type { Leaderboard } from "../../data/leaderboard";
import type { Team } from "../../data/types";
import type { OpponentPlan, TacticalMatchup } from "../match-board/opponentPlan";
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
  matchups: TacticalMatchup[];
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
