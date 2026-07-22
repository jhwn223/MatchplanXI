import { useMemo, useRef, useState } from "react";
import { DndContext, DragOverlay } from "@dnd-kit/core";
import {
  FORMATIONS,
  detectFormationShape,
  slotsOf,
  type FormationKey,
} from "../data/formation";
import {
  altitudePenalty,
  computeTeamIndex,
  jetLagPenalty,
  restPenalty,
  travelPenalty,
} from "../data/conditionEngine";
import {
  autoFillBestXI,
  emptySlots,
  remapFormation,
  type TacticStyleKey,
} from "../data/tactics";
import {
  applyExtraTime,
  combineHalves,
  simulateHalf,
  type HalfResult,
  type SimResult,
} from "../data/matchSim";
import { selectBestEleven } from "../data/playerAbility";
import { usePlayerConditions } from "../hooks/usePlayerConditions";
import { useDropSound } from "../hooks/useDropSound";
import type { Player } from "../data/types";
import type { ConditionSubIndices } from "./ConditionGauge";
import { PlayerCardVisual } from "./PlayerCardVisual";
import { PlayerStatsModal } from "./PlayerStatsModal";
import {
  extraTimeArenaSim as buildExtraTimeArenaSim,
  firstHalfArenaSim,
  secondHalfArenaSim,
} from "./match-board/arenaSegments";
import { MatchArenaOverlays } from "./match-board/MatchArenaOverlays";
import { MatchBoardScreen } from "./match-board/MatchBoardScreen";
import { buildMatchSimInput } from "./match-board/simInput";
import { useLineupDrag } from "./match-board/useLineupDrag";
import {
  MAX_SUBS,
  MAX_SUBS_ET,
  type MatchBoardProps,
  type MatchPhase,
} from "./match-board/types";

export function MatchBoard({
  data,
  team,
  teamMatches,
  activeMatch,
  lineup,
  onChangeLineup,
  onBack,
  onPlayed,
  onMatchSim,
  leaderboard,
  onNextMatch,
}: MatchBoardProps) {
  const [activeDragId, setActiveDragId] = useState<number | null>(null);
  const [soundOn, setSoundOn] = useState(false);
  const [phase, setPhase] = useState<MatchPhase>("idle");
  const [half1, setHalf1] = useState<HalfResult | null>(null);
  const [half2, setHalf2] = useState<HalfResult | null>(null);
  const [regSim, setRegSim] = useState<SimResult | null>(null);
  const [finalSim, setFinalSim] = useState<SimResult | null>(null);
  const [startingXI, setStartingXI] = useState<Set<number> | null>(null);
  const [benchedOut, setBenchedOut] = useState<Set<number>>(new Set());
  const [selectedPlayer, setSelectedPlayer] = useState<Player | null>(null);
  const pitchRef = useRef<HTMLDivElement>(null);
  const playDrop = useDropSound(soundOn);

  const formation = slotsOf(lineup.formation);
  const conditions = usePlayerConditions(data, team.team_id, teamMatches, activeMatch);
  const squad = useMemo(
    () => data.players.filter((player) => player.team_id === team.team_id),
    [data.players, team.team_id]
  );
  const playersById = useMemo(
    () => new Map(squad.map((player) => [player.player_id, player])),
    [squad]
  );
  const placedIds = useMemo(
    () => new Set(Object.values(lineup.slots).filter((id): id is number => id != null)),
    [lineup.slots]
  );
  const benchPlayers = useMemo(
    () => squad.filter((player) => !placedIds.has(player.player_id)),
    [squad, placedIds]
  );
  const teamIndex = useMemo(() => {
    const scores = [...placedIds]
      .map((id) => conditions.get(id)?.score)
      .filter((score): score is number => score != null);
    return computeTeamIndex(scores);
  }, [placedIds, conditions]);
  const detectedFormation = useMemo(
    () => detectFormationShape(lineup.formation, lineup.slots, lineup.positions),
    [lineup.formation, lineup.slots, lineup.positions]
  );
  const effectiveAttackBias = useMemo(() => {
    const positionedOutfield = formation.filter(
      (slot) => slot.position !== "GK" && lineup.slots[slot.id] != null
    );
    const averageAdvance = positionedOutfield.length
      ? positionedOutfield.reduce((sum, slot) => {
          const current = lineup.positions?.[slot.id] ?? slot;
          return sum + (slot.y - current.y);
        }, 0) / positionedOutfield.length
      : 0;
    return Math.min(1.2, Math.max(-1.2, FORMATIONS[lineup.formation].attackBias + averageAdvance / 25));
  }, [formation, lineup.formation, lineup.positions, lineup.slots]);

  const match = activeMatch.match;
  const opponent = data.teams.find((candidate) => candidate.team_name === activeMatch.opponentName);
  const opponentEleven = useMemo(
    () => selectBestEleven(data.players.filter((player) => player.team_id === opponent?.team_id)),
    [data.players, opponent?.team_id]
  );
  const isKnockout = match.stage_name !== "Group Stage";
  const tiedAfterRegulation = regSim != null && isKnockout && regSim.userGoals === regSim.oppGoals;
  const maxSubs = tiedAfterRegulation || phase === "etbreak" || phase === "extratime" ? MAX_SUBS_ET : MAX_SUBS;
  const subsUsed = useMemo(
    () => startingXI ? [...placedIds].filter((id) => !startingXI.has(id)).length : 0,
    [startingXI, placedIds]
  );
  const subsRemaining = Math.max(0, maxSubs - subsUsed);
  const winEstimate = Math.max(
    8,
    Math.min(
      92,
      Math.round(
        (1 / (1 + Math.pow(10, ((opponent?.elo_rating ?? 1600) - team.elo_rating) / 400))) * 100 +
          ((teamIndex ?? 62) - 62) * 0.22
      )
    )
  );
  const conditionSubIndices: ConditionSubIndices = {
    altitude: 100 - altitudePenalty(activeMatch.elevation),
    rest: 100 - restPenalty(activeMatch.restDays),
    travel: 100 - travelPenalty(activeMatch.travelKm),
    jetlag: 100 - jetLagPenalty(activeMatch.tzShiftHours),
  };
  const { sensors, handleDragStart, handleDragEnd } = useLineupDrag({
    formation,
    lineup,
    onChangeLineup,
    playersById,
    pitchRef,
    benchedOut,
    startingXI,
    maxSubs,
    playDrop,
    setBenchedOut,
    setActiveDragId,
  });
  const firstArena = useMemo(() => firstHalfArenaSim(half1), [half1]);
  const secondArena = useMemo(() => secondHalfArenaSim(half2, regSim), [half2, regSim]);
  const extraArena = useMemo(() => buildExtraTimeArenaSim(finalSim), [finalSim]);

  function selectFormation(key: FormationKey) {
    if (key === lineup.formation) return;
    onChangeLineup({
      formation: key,
      slots: remapFormation(lineup.formation, lineup.slots, key),
      presetKey: null,
    });
  }

  function autoFill() {
    onChangeLineup({
      ...lineup,
      slots: autoFillBestXI(lineup.formation, squad, conditions),
      presetKey: null,
    });
  }

  function selectTacticStyle(key: TacticStyleKey) {
    onChangeLineup({ ...lineup, tacticStyleKey: key });
  }

  function resetLineup() {
    if (!startingXI) {
      onChangeLineup({ formation: lineup.formation, slots: emptySlots(lineup.formation), presetKey: null });
    }
  }

  function buildSimInput() {
    return buildMatchSimInput({
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
    });
  }

  function kickoff() {
    const input = buildSimInput();
    if (!input) return;
    setHalf1(simulateHalf(input, 1));
    setHalf2(null);
    setRegSim(null);
    setFinalSim(null);
    setStartingXI(new Set(placedIds));
    setBenchedOut(new Set());
    setPhase("half1");
  }

  function startSecondHalf() {
    const input = buildSimInput();
    if (!input || !half1) return;
    const result = simulateHalf(input, 2);
    setHalf2(result);
    setRegSim(combineHalves(input, half1, result));
    setPhase("half2");
  }

  function startExtraTime() {
    const input = buildSimInput();
    if (!input || !regSim) return;
    setFinalSim(applyExtraTime(input, regSim));
    setPhase("extratime");
  }

  function handleMatchEnd(result: SimResult) {
    onPlayed(match.match_id, {
      homeGoals: activeMatch.isHome ? result.userGoals : result.oppGoals,
      awayGoals: activeMatch.isHome ? result.oppGoals : result.userGoals,
      wentToPenalties: result.penalties != null,
      homePenGoals: result.penalties
        ? activeMatch.isHome ? result.penalties.userGoals : result.penalties.oppGoals
        : undefined,
      awayPenGoals: result.penalties
        ? activeMatch.isHome ? result.penalties.oppGoals : result.penalties.userGoals
        : undefined,
    });
    onMatchSim(result);
  }

  function closeArena() {
    setPhase("idle");
    setHalf1(null);
    setHalf2(null);
    setRegSim(null);
    setFinalSim(null);
    setStartingXI(null);
    setBenchedOut(new Set());
  }

  const activePlayer = activeDragId != null ? playersById.get(activeDragId) : null;
  const ready = placedIds.size === 11;
  const primaryAction = phase === "halftime" ? startSecondHalf : phase === "etbreak" ? startExtraTime : kickoff;
  const primaryLabel = !ready
    ? `선발 ${placedIds.size}/11 배치 필요`
    : phase === "halftime"
      ? "🔄 후반전 시작"
      : phase === "etbreak"
        ? "🔥 연장전 시작"
        : "▶ 킥오프 (경기 실행)";

  return (
    <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <MatchBoardScreen
        team={team}
        activeMatch={activeMatch}
        phase={phase}
        lineup={lineup}
        formation={formation}
        detectedFormation={detectedFormation}
        effectiveAttackBias={effectiveAttackBias}
        tacticStyleKey={lineup.tacticStyleKey ?? null}
        onSelectTacticStyle={selectTacticStyle}
        teamIndex={teamIndex}
        conditionSubIndices={conditionSubIndices}
        conditions={conditions}
        playersById={playersById}
        benchPlayers={benchPlayers}
        benchedOut={benchedOut}
        placedCount={placedIds.size}
        startingXI={startingXI}
        maxSubs={maxSubs}
        subsUsed={subsUsed}
        subsRemaining={subsRemaining}
        firstHalf={half1}
        regulation={regSim}
        winEstimate={winEstimate}
        soundOn={soundOn}
        primaryLabel={primaryLabel}
        ready={ready}
        pitchRef={pitchRef}
        onBack={onBack}
        onSoundChange={setSoundOn}
        onSelectFormation={selectFormation}
        onAutoFill={autoFill}
        onResetPositions={() => onChangeLineup({ ...lineup, positions: {} })}
        onResetLineup={resetLineup}
        onPrimaryAction={primaryAction}
        onSelectPlayer={setSelectedPlayer}
      />

      <DragOverlay dropAnimation={null}>
        {activePlayer && (
          <PlayerCardVisual
            player={activePlayer}
            condition={conditions.get(activePlayer.player_id)}
            variant="slot"
            state="floating"
            useLayoutId={false}
          />
        )}
      </DragOverlay>

      <MatchArenaOverlays
        phase={phase}
        firstHalfSim={firstArena}
        secondHalfSim={secondArena}
        extraTimeSim={extraArena}
        firstHalf={half1}
        regulation={regSim}
        finalResult={finalSim}
        tiedAfterRegulation={tiedAfterRegulation}
        team={team}
        activeMatch={activeMatch}
        lineup={lineup}
        detectedFormation={detectedFormation}
        playersById={playersById}
        opponentPlayers={opponentEleven}
        leaderboard={leaderboard}
        onPhaseChange={setPhase}
        onMatchEnd={handleMatchEnd}
        onClose={closeArena}
        onNextMatch={() => {
          closeArena();
          onNextMatch();
        }}
      />

      {selectedPlayer && (
        <PlayerStatsModal
          player={selectedPlayer}
          condition={conditions.get(selectedPlayer.player_id)}
          onClose={() => setSelectedPlayer(null)}
        />
      )}
    </DndContext>
  );
}
