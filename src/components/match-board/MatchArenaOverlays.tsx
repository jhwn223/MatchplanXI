import { AnimatePresence } from "framer-motion";
import type { Leaderboard } from "../../data/leaderboard";
import type { HalfResult, SimResult } from "../../data/matchSim";
import type { TeamMatch } from "../../data/tournament";
import type { Player, Team } from "../../data/types";
import { MatchArena, type ArenaSim } from "../MatchArena";
import type { Lineup, MatchPhase } from "./types";

interface Props {
  phase: MatchPhase;
  firstHalfSim: ArenaSim | null;
  secondHalfSim: ArenaSim | null;
  extraTimeSim: ArenaSim | null;
  firstHalf: HalfResult | null;
  regulation: SimResult | null;
  finalResult: SimResult | null;
  tiedAfterRegulation: boolean;
  team: Team;
  activeMatch: TeamMatch;
  lineup: Lineup;
  detectedFormation: string;
  playersById: Map<number, Player>;
  opponentPlayers: Player[];
  leaderboard: Leaderboard;
  onPhaseChange: (phase: MatchPhase) => void;
  onMatchEnd: (result: SimResult) => void;
  onClose: () => void;
  onNextMatch: () => void;
}

export function MatchArenaOverlays({
  phase,
  firstHalfSim,
  secondHalfSim,
  extraTimeSim,
  firstHalf,
  regulation,
  finalResult,
  tiedAfterRegulation,
  team,
  activeMatch,
  lineup,
  detectedFormation,
  playersById,
  opponentPlayers,
  leaderboard,
  onPhaseChange,
  onMatchEnd,
  onClose,
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
    onClose,
  } as const;

  return (
    <AnimatePresence>
      {phase === "half1" && firstHalfSim && (
        <MatchArena
          key="half1"
          {...shared}
          sim={firstHalfSim}
          startMinute={0}
          endMinute={45}
          final={false}
          interimLabel="전반전 종료"
          interimCta="후반전 준비하기 →"
          onInterimContinue={() => onPhaseChange("halftime")}
          onComplete={() => {}}
        />
      )}
      {phase === "half2" && secondHalfSim && (
        <MatchArena
          key="half2"
          {...shared}
          sim={secondHalfSim}
          startMinute={45}
          endMinute={90}
          startScore={[firstHalf?.userGoals ?? 0, firstHalf?.oppGoals ?? 0]}
          final={!tiedAfterRegulation}
          interimLabel="정규시간 종료"
          interimCta="연장전 준비하기 →"
          onInterimContinue={() => onPhaseChange("etbreak")}
          onComplete={() => regulation && onMatchEnd(regulation)}
          onNext={tiedAfterRegulation ? undefined : onNextMatch}
        />
      )}
      {phase === "extratime" && extraTimeSim && finalResult && (
        <MatchArena
          key="extratime"
          {...shared}
          sim={extraTimeSim}
          startMinute={90}
          endMinute={120}
          startScore={[finalResult.regulationUserGoals, finalResult.regulationOppGoals]}
          final
          onComplete={() => onMatchEnd(finalResult)}
          onNext={onNextMatch}
        />
      )}
    </AnimatePresence>
  );
}
