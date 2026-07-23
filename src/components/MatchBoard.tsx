import { useEffect, useMemo, useRef, useState } from "react";
import { DndContext, DragOverlay } from "@dnd-kit/core";
import {
  FORMATIONS,
  detectFormationShape,
  slotsOf,
  type FormationKey,
} from "../data/formation";
import { computeTeamIndex } from "../data/conditionEngine";
import {
  autoFillBestXI,
  emptySlots,
  remapFormation,
} from "../data/tactics";
import {
  combineExtraTime,
  combineHalves,
  type HalfResult,
  type SimInput,
  type SimResult,
} from "../data/matchSim";
import { selectBestEleven } from "../data/playerAbility";
import { getTeamMatches } from "../data/tournament";
import { usePlayerConditions } from "../hooks/usePlayerConditions";
import { useDropSound } from "../hooks/useDropSound";
import type { Player } from "../data/types";
import { PlayerCardVisual } from "./PlayerCardVisual";
import { PlayerStatsModal } from "./PlayerStatsModal";
import {
  extraTimeArenaSim,
  firstHalfArenaSim,
  secondHalfArenaSim,
} from "./match-board/arenaSegments";
import { MatchArenaOverlays } from "./match-board/MatchArenaOverlays";
import { MatchBoardScreen } from "./match-board/MatchBoardScreen";
import {
  applyAltitudeAdaptation,
  buildOpponentPlan,
  tacticalMatchups,
} from "./match-board/opponentPlan";
import { buildMatchSimInput } from "./match-board/simInput";
import { useLineupDrag } from "./match-board/useLineupDrag";
import {
  MAX_SUBS,
  MAX_SUBS_ET,
  type MatchBoardProps,
  type MatchPhase,
} from "./match-board/types";
import { DEFAULT_TEAM_TACTICS, type TeamTactics } from "./match-arena/tactics";

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
  const [regSim, setRegSim] = useState<SimResult | null>(null);
  const [finalSim, setFinalSim] = useState<SimResult | null>(null);
  const [activeSimInput, setActiveSimInput] = useState<SimInput | null>(null);
  const preMatchTactics = lineup.teamTactics ?? DEFAULT_TEAM_TACTICS;
  const [liveTactics, setLiveTactics] = useState<TeamTactics>(preMatchTactics);
  const [liveOpponentTactics, setLiveOpponentTactics] = useState<TeamTactics>(
    DEFAULT_TEAM_TACTICS
  );
  const [startingXI, setStartingXI] = useState<Set<number> | null>(null);
  const [benchedOut, setBenchedOut] = useState<Set<number>>(new Set());
  const [selectedPlayer, setSelectedPlayer] = useState<Player | null>(null);
  const pitchRef = useRef<HTMLDivElement>(null);
  const playDrop = useDropSound(soundOn);

  const formation = slotsOf(lineup.formation);
  const opponent = data.teams.find((candidate) => candidate.team_name === activeMatch.opponentName);
  const opponentMatches = useMemo(
    () => opponent ? getTeamMatches(data, opponent.team_name) : [],
    [data, opponent]
  );
  const opponentActiveMatch = useMemo(
    () =>
      opponentMatches.find((candidate) => candidate.match.match_id === activeMatch.match.match_id) ??
      (opponent
        ? {
            ...activeMatch,
            isHome: !activeMatch.isHome,
            opponentName: team.team_name,
            opponentCode: team.fifa_code,
          }
        : null),
    [activeMatch, opponent, opponentMatches, team.fifa_code, team.team_name]
  );
  const conditions = usePlayerConditions(data, team.team_id, teamMatches, activeMatch);
  const rawOpponentConditions = usePlayerConditions(
    data,
    opponent?.team_id ?? null,
    opponentMatches,
    opponentActiveMatch
  );
  const squad = useMemo(
    () => data.players.filter((player) => player.team_id === team.team_id),
    [data.players, team.team_id]
  );
  const opponentSquad = useMemo(
    () => data.players.filter((player) => player.team_id === opponent?.team_id),
    [data.players, opponent?.team_id]
  );
  const opponentPlan = useMemo(
    () =>
      opponent
        ? buildOpponentPlan({
            team: opponent,
            squad: opponentSquad,
            elevation: activeMatch.elevation,
            isHome: !activeMatch.isHome,
            seed: activeMatch.match.match_id,
          })
        : null,
    [activeMatch.elevation, activeMatch.isHome, activeMatch.match.match_id, opponent, opponentSquad]
  );
  const opponentConditions = useMemo(
    () => applyAltitudeAdaptation(rawOpponentConditions, opponentPlan?.altitudeAdaptation ?? 0),
    [opponentPlan?.altitudeAdaptation, rawOpponentConditions]
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
  const opponentEleven = useMemo(
    () => {
      if (!opponentPlan) return selectBestEleven(opponentSquad);
      const selectedSlots = autoFillBestXI(opponentPlan.formation, opponentSquad, opponentConditions);
      const byId = new Map(opponentSquad.map((player) => [player.player_id, player]));
      return slotsOf(opponentPlan.formation)
        .map((slot) => {
          const playerId = selectedSlots[slot.id];
          return playerId != null ? byId.get(playerId) : undefined;
        })
        .filter((player): player is Player => player != null);
    },
    [opponentConditions, opponentPlan, opponentSquad]
  );
  const matchups = useMemo(
    () => opponentPlan ? tacticalMatchups(opponentPlan, preMatchTactics, activeMatch.elevation) : [],
    [activeMatch.elevation, opponentPlan, preMatchTactics]
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
  function selectFormation(key: FormationKey) {
    if (key === lineup.formation) return;
    onChangeLineup({
      ...lineup,
      formation: key,
      slots: remapFormation(lineup.formation, lineup.slots, key),
      positions: {},
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

  function changePreMatchTactics(next: TeamTactics) {
    onChangeLineup({
      ...lineup,
      tacticStyleKey: null,
      teamTactics: next,
    });
  }

  function resetLineup() {
    if (!startingXI) {
      onChangeLineup({
        ...lineup,
        slots: emptySlots(lineup.formation),
        positions: {},
        presetKey: null,
        tacticStyleKey: null,
        teamTactics: DEFAULT_TEAM_TACTICS,
      });
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
      opponentConditions,
      opponentTactics: opponentPlan?.tactics,
      activeMatch,
      team,
      opponent,
      effectiveAttackBias,
      isKnockout,
      teamTactics: preMatchTactics,
    });
  }

  function kickoff() {
    const input = buildSimInput();
    if (!input) return;
    setActiveSimInput(input);
    setHalf1(null);
    setRegSim(null);
    setFinalSim(null);
    setStartingXI(new Set(placedIds));
    setBenchedOut(new Set());
    setLiveTactics(preMatchTactics);
    setLiveOpponentTactics(opponentPlan?.tactics ?? DEFAULT_TEAM_TACTICS);
    setPhase("half1");
  }

  function changeLiveTactics(next: TeamTactics) {
    setLiveTactics(next);
    onChangeLineup({ ...lineup, tacticStyleKey: null, teamTactics: next });
  }

  useEffect(() => {
    if (!activeSimInput || phase === "idle") return;
    const refreshed = buildSimInput();
    if (!refreshed) return;
    setActiveSimInput((current) =>
      current
        ? {
            ...current,
            attackBias: refreshed.attackBias,
            placed: refreshed.placed,
            userAbility: refreshed.userAbility,
          }
        : current
    );
    // 경기 도중 포메이션·선수 배치가 바뀌면 다음 플레이부터 시뮬레이션 입력도 갱신한다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lineup.formation, lineup.positions, lineup.slots]);

  function startSecondHalf() {
    const input = buildSimInput();
    if (!input || !half1) return;
    setActiveSimInput(input);
    setPhase("half2");
  }

  function startExtraTime() {
    const input = buildSimInput();
    if (!input || !regSim) return;
    setActiveSimInput(input);
    setPhase("extratime");
  }

  function completeFirstHalf(period: HalfResult) {
    setHalf1(period);
    return firstHalfArenaSim(period)!;
  }

  function completeSecondHalf(period: HalfResult) {
    const input = activeSimInput;
    if (!input || !half1) return secondHalfArenaSim(period, regSim)!;
    const result = combineHalves(input, half1, period);
    setRegSim(result);
    if (!input.isKnockout || result.userGoals !== result.oppGoals) handleMatchEnd(result);
    return secondHalfArenaSim(period, result)!;
  }

  function completeExtraTime(period: HalfResult) {
    const input = activeSimInput;
    if (!input || !regSim) return extraTimeArenaSim(finalSim)!;
    const result = combineExtraTime(input, regSim, period);
    setFinalSim(result);
    handleMatchEnd(result);
    return extraTimeArenaSim(result)!;
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
    setRegSim(null);
    setFinalSim(null);
    setActiveSimInput(null);
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
        teamTactics={preMatchTactics}
        onTacticsChange={changePreMatchTactics}
        opponent={opponent}
        opponentPlayers={opponentEleven}
        opponentConditions={opponentConditions}
        opponentPlan={opponentPlan}
        matchups={matchups}
        teamIndex={teamIndex}
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
        simInput={activeSimInput}
        firstHalf={half1}
        regulation={regSim}
        tiedAfterRegulation={tiedAfterRegulation}
        team={team}
        activeMatch={activeMatch}
        lineup={lineup}
        detectedFormation={detectedFormation}
        playersById={playersById}
        opponentPlayers={opponentEleven}
        leaderboard={leaderboard}
        liveTactics={liveTactics}
        opponentTactics={liveOpponentTactics}
        opponentFormation={opponentPlan?.formation}
        onTacticChange={changeLiveTactics}
        onOpponentTacticChange={setLiveOpponentTactics}
        onFormationChange={selectFormation}
        onFirstHalfComplete={completeFirstHalf}
        onSecondHalfComplete={completeSecondHalf}
        onExtraTimeComplete={completeExtraTime}
        onPhaseChange={setPhase}
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
