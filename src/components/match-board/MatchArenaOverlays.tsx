import { AnimatePresence } from "framer-motion";
import type { Leaderboard } from "../../data/leaderboard";
import type { HalfResult, MatchSide, SimInput, SimResult } from "../../data/matchSim";
import type { TeamMatch } from "../../data/tournament";
import type { Player, Team } from "../../data/types";
import type { FormationKey } from "../../data/formation";
import { MatchArena, type ArenaSim } from "../MatchArena";
import type { ArenaSquadControls } from "../match-arena/types";
import type { TeamTactics } from "../match-arena/tactics";
import type { Lineup, MatchPhase } from "./types";

interface Props {
  phase: MatchPhase;
  simInput: SimInput | null;
  firstHalf: HalfResult | null;
  regulation: SimResult | null;
  tiedAfterRegulation: boolean;
  team: Team;
  activeMatch: TeamMatch;
  lineup: Lineup;
  detectedFormation: string;
  playersById: Map<number, Player>;
  opponentPlayers: Player[];
  leaderboard: Leaderboard;
  liveTactics: TeamTactics;
  opponentTactics?: TeamTactics;
  opponentFormation?: FormationKey;
  squadControls: ArenaSquadControls;
  onTacticChange: (tactics: TeamTactics) => void;
  onOpponentTacticChange: (tactics: TeamTactics) => void;
  onFormationChange: (formation: FormationKey) => void;
  onPlayerDismissed: (side: MatchSide, playerId: number) => void;
  onFirstHalfComplete: (period: HalfResult) => ArenaSim;
  onSecondHalfComplete: (period: HalfResult) => ArenaSim;
  onExtraTimeComplete: (period: HalfResult) => ArenaSim;
  onPhaseChange: (phase: MatchPhase) => void;
  onClose: () => void;
  onSchedule: () => void;
  onNextMatch: () => void;
}

export function MatchArenaOverlays({
  phase,
  simInput,
  firstHalf,
  regulation,
  tiedAfterRegulation,
  team,
  activeMatch,
  lineup,
  detectedFormation,
  playersById,
  opponentPlayers,
  leaderboard,
  liveTactics,
  opponentTactics,
  opponentFormation,
  squadControls,
  onTacticChange,
  onOpponentTacticChange,
  onFormationChange,
  onPlayerDismissed,
  onFirstHalfComplete,
  onSecondHalfComplete,
  onExtraTimeComplete,
  onPhaseChange,
  onClose,
  onSchedule,
  onNextMatch,
}: Props) {
  const shared = {
    userTeamName: team.team_name,
    userCode: team.fifa_code,
    oppTeamName: activeMatch.opponentName,
    oppCode: activeMatch.opponentCode,
    userColor: "#7adb8c",
    formation: lineup.formation,
    formationLabel: detectedFormation,
    slots: lineup.slots,
    positions: lineup.positions,
    playersById,
    opponentPlayers,
    leaderboard,
    initialTactics: liveTactics,
    initialOpponentTactics: opponentTactics,
    opponentFormation,
    squadControls,
    onTacticChange,
    onOpponentTacticChange,
    onFormationChange,
    onPlayerDismissed,
    onClose,
    onSchedule,
  } as const;

  return (
    <AnimatePresence>
      {phase === "half1" && simInput && (
        <MatchArena
          key="half1"
          {...shared}
          simInput={simInput}
          startMinute={0}
          endMinute={45}
          final={false}
          interimLabel="전반전 종료"
          interimCta="후반전 준비하기 →"
          onInterimContinue={() => onPhaseChange("halftime")}
          onPeriodComplete={onFirstHalfComplete}
          onComplete={() => {}}
        />
      )}
      {phase === "half2" && simInput && (
        <MatchArena
          key="half2"
          {...shared}
          simInput={simInput}
          priorEvents={firstHalf?.events}
          startMinute={45}
          endMinute={90}
          startScore={[firstHalf?.userGoals ?? 0, firstHalf?.oppGoals ?? 0]}
          final={!tiedAfterRegulation}
          interimLabel="정규시간 종료"
          interimCta="연장전 준비하기 →"
          onInterimContinue={() => onPhaseChange("etbreak")}
          onPeriodComplete={onSecondHalfComplete}
          onComplete={() => {}}
          onNext={tiedAfterRegulation ? undefined : onNextMatch}
        />
      )}
      {phase === "extratime" && simInput && (
        <MatchArena
          key="extratime"
          {...shared}
          simInput={simInput}
          priorEvents={regulation?.events}
          startMinute={90}
          endMinute={120}
          startScore={[regulation?.userGoals ?? 0, regulation?.oppGoals ?? 0]}
          final
          onPeriodComplete={onExtraTimeComplete}
          onComplete={() => {}}
          onNext={onNextMatch}
        />
      )}
    </AnimatePresence>
  );
}
