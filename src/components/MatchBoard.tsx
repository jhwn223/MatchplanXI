import { useEffect, useMemo, useRef, useState } from "react";
import {
  DndContext,
  DragOverlay,
  closestCenter,
  pointerWithin,
  type CollisionDetection,
  type Modifier,
} from "@dnd-kit/core";
import { getEventCoordinates } from "@dnd-kit/utilities";
import {
  BENCH_ZONE_ID,
  FORMATIONS,
  detectFormationShape,
  slotsOf,
  type FormationKey,
} from "../data/formation";
import { computeTeamIndex } from "../data/conditionEngine";
import {
  autoFillBestXI,
  remapFormation,
} from "../data/tactics";
import {
  combineExtraTime,
  combineHalves,
  type HalfResult,
  type MatchSide,
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
import { disciplineFromEvents } from "./playerDiscipline";

/**
 * On the pitch a drop lands only where the cursor actually is. Rectangle
 * intersection — the library default — treated any overlap of the dragged
 * card with a neighbouring slot as a drop on it, so nudging a player slightly
 * sideways swapped him with whoever stood there.
 *
 * Bringing a player on from the bench stays forgiving: that gesture aims at a
 * slot rather than at a coordinate, so it falls back to the geometrically
 * nearest slot when the cursor lands just outside one. Rectangle intersection
 * used to be that fallback, but with cards packed tightly it could match
 * whichever neighbour the drag card's box happened to overlap most — not
 * necessarily the slot closest to the cursor (e.g. dropping near a defender
 * could land on a midfielder two slots over). closestCenter picks by actual
 * distance instead, so it always lands on the nearest slot.
 */
const lineupCollisionDetection: CollisionDetection = (args) => {
  const underPointer = pointerWithin(args);
  if (underPointer.length) return underPointer;
  const from = (args.active.data.current as { from?: string } | undefined)?.from;
  return from === BENCH_ZONE_ID ? closestCenter(args) : [];
};

/**
 * Pin the floating drag card's centre to the cursor. The overlay normally
 * starts from the source card's measured rect, and anything transforming
 * that card at measure time (hover lift, an in-flight spring) bakes a
 * constant offset into the whole drag — the ghost trails the cursor by a
 * fixed distance, intermittently. Deriving the position from the cursor
 * itself sidesteps the measurement entirely.
 */
const snapDragToCursor: Modifier = ({ activatorEvent, draggingNodeRect, transform }) => {
  if (!draggingNodeRect || !activatorEvent) return transform;
  const activatorCoordinates = getEventCoordinates(activatorEvent);
  if (!activatorCoordinates) return transform;
  return {
    ...transform,
    x: transform.x + (activatorCoordinates.x - draggingNodeRect.left) - draggingNodeRect.width / 2,
    y: transform.y + (activatorCoordinates.y - draggingNodeRect.top) - draggingNodeRect.height / 2,
  };
};

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
  // Single source of truth. A separate `liveTactics` state used to shadow this
  // one, and the half-time screen only wrote to the lineup, so tactics set at
  // the interval never reached the second half.
  const teamTactics = lineup.teamTactics ?? DEFAULT_TEAM_TACTICS;
  const [liveOpponentTactics, setLiveOpponentTactics] = useState<TeamTactics>(
    DEFAULT_TEAM_TACTICS
  );
  const [startingXI, setStartingXI] = useState<Set<number> | null>(null);
  const [benchedOut, setBenchedOut] = useState<Set<number>>(new Set());
  const [dismissedUserIds, setDismissedUserIds] = useState<Set<number>>(new Set());
  const [selectedPlayer, setSelectedPlayer] = useState<Player | null>(null);
  const pitchRef = useRef<HTMLDivElement>(null);
  const entryMinutesRef = useRef<Map<number, number>>(new Map());
  const liveMinuteRef = useRef(0);
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
            referencePlayers: data.players,
            elevation: activeMatch.elevation,
            isHome: !activeMatch.isHome,
            seed: activeMatch.match.match_id,
          })
        : null,
    [activeMatch.elevation, activeMatch.isHome, activeMatch.match.match_id, data.players, opponent, opponentSquad]
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
  const opponentBench = useMemo(() => {
    const starters = new Set(opponentEleven.map((player) => player.player_id));
    return opponentSquad.filter((player) => !starters.has(player.player_id));
  }, [opponentEleven, opponentSquad]);
  const isKnockout = match.stage_name !== "Group Stage";
  const tiedAfterRegulation = regSim != null && isKnockout && regSim.userGoals === regSim.oppGoals;
  const maxSubs = tiedAfterRegulation || phase === "etbreak" || phase === "extratime" ? MAX_SUBS_ET : MAX_SUBS;
  const subsUsed = useMemo(
    () => startingXI ? [...placedIds].filter((id) => !startingXI.has(id)).length : 0,
    [startingXI, placedIds]
  );
  const subsRemaining = Math.max(0, maxSubs - subsUsed);
  const requiredPlayers = startingXI ? Math.max(7, 11 - dismissedUserIds.size) : 11;
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
    maxOnPitch: requiredPlayers,
    playDrop,
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
      slots: autoFillBestXI(lineup.formation, autoFillPool(), conditions),
      presetKey: null,
    });
  }

  /**
   * Before kickoff the whole squad is eligible. Afterwards auto-fill would
   * otherwise bring on unlimited new faces, so the pool is capped at the
   * players already involved plus as many bench players as there are
   * substitutions left. Picking eleven from that pool can never exceed the
   * substitution allowance, and players already taken off cannot return.
   */
  function autoFillPool(): Player[] {
    if (!startingXI) return squad;
    const onPitch = new Set(
      Object.values(lineup.slots).filter((id): id is number => id != null),
    );
    const involved = squad.filter(
      (player) =>
        !benchedOut.has(player.player_id) &&
        (startingXI.has(player.player_id) || onPitch.has(player.player_id)),
    );
    const bench = squad
      .filter(
        (player) =>
          !benchedOut.has(player.player_id) &&
          !startingXI.has(player.player_id) &&
          !onPitch.has(player.player_id),
      )
      .sort((a, b) => (b.ability?.overall ?? 0) - (a.ability?.overall ?? 0))
      .slice(0, subsRemaining);
    return [...involved, ...bench];
  }

  function changePreMatchTactics(next: TeamTactics) {
    onChangeLineup({
      ...lineup,
      tacticStyleKey: null,
      teamTactics: next,
    });
  }

  /**
   * When each player currently on the pitch came on, so fatigue is charged for
   * time played rather than time on the clock. Kickoff stamps the whole XI with
   * zero; anyone who appears later is stamped with the minute he arrived.
   */
  function stampEntryMinutes(minute: number) {
    entryMinutesRef.current = new Map(entryMinutesRef.current);
    for (const id of placedIds) {
      if (!entryMinutesRef.current.has(id)) entryMinutesRef.current.set(id, minute);
    }
    return entryMinutesRef.current;
  }

  function buildSimInput() {
    return buildMatchSimInput({
      placedIds,
      teamIndex,
      formation,
      lineup,
      playersById,
      conditions,
      entryMinutes: entryMinutesRef.current,
      opponentEleven,
      opponentConditions,
      opponentTactics: opponentPlan?.tactics,
      opponentFormation: opponentPlan?.formation,
      activeMatch,
      team,
      opponent,
      effectiveAttackBias,
      isKnockout,
      teamTactics,
      minimumPlayers: requiredPlayers,
    });
  }

  function kickoff() {
    entryMinutesRef.current = new Map();
    stampEntryMinutes(0);
    const input = buildSimInput();
    if (!input) return;
    setActiveSimInput(input);
    setHalf1(null);
    setRegSim(null);
    setFinalSim(null);
    setStartingXI(new Set(placedIds));
    setBenchedOut(new Set());
    setDismissedUserIds(new Set());
    setLiveOpponentTactics(opponentPlan?.tactics ?? DEFAULT_TEAM_TACTICS);
    setPhase("half1");
  }

  function changeLiveTactics(next: TeamTactics) {
    onChangeLineup({ ...lineup, tacticStyleKey: null, teamTactics: next });
  }

  // Swaps made while editing the lineup (half-time, or the live squad panel)
  // are a draft — dragging a player to the bench doesn't lock them out, so a
  // wrong drag can still be undone. This is the actual "sub" moment: whoever
  // from the original XI is off the pitch right now gets permanently benched.
  // Called when leaving that editing screen (starting the next segment, or
  // resuming a paused live match), never on every drag.
  function commitBenchedOut() {
    if (!startingXI) return;
    const justBenched = [...startingXI].filter((id) => !placedIds.has(id));
    if (justBenched.length === 0) return;
    setBenchedOut((previous) => {
      const next = new Set(previous);
      for (const id of justBenched) next.add(id);
      return next;
    });
  }

  useEffect(() => {
    if (!activeSimInput || phase === "idle") return;
    // Anyone newly on the pitch has just been brought on, so his fatigue
    // starts from now rather than from kickoff.
    stampEntryMinutes(liveMinuteRef.current);
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
    commitBenchedOut();
    setActiveSimInput(input);
    setPhase("half2");
  }

  function startExtraTime() {
    const input = buildSimInput();
    if (!input || !regSim) return;
    commitBenchedOut();
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
    setDismissedUserIds(new Set());
  }

  function handlePlayerDismissed(side: MatchSide, playerId: number) {
    if (side !== "user" || dismissedUserIds.has(playerId)) return;
    setDismissedUserIds((current) => new Set(current).add(playerId));
    setBenchedOut((current) => new Set(current).add(playerId));
    onChangeLineup({
      ...lineup,
      slots: Object.fromEntries(
        Object.entries(lineup.slots).map(([slotId, id]) => [slotId, id === playerId ? null : id]),
      ),
      presetKey: null,
    });
  }

  const activePlayer = activeDragId != null ? playersById.get(activeDragId) : null;
  const ready = placedIds.size === requiredPlayers;
  const discipline = useMemo(
    () => disciplineFromEvents(regSim?.events ?? half1?.events, "user"),
    [half1?.events, regSim?.events],
  );
  // The arena overlay owns the pitch and bench while it is open. Rendering the
  // board's copies at the same time would register duplicate drop targets in
  // the shared DndContext, and they are hidden behind the modal anyway.
  const arenaOpen = phase === "half1" || phase === "half2" || phase === "extratime";
  const squadControls = {
    conditions,
    benchPlayers,
    benchedOut,
    pitchRef,
    subsUsed,
    maxSubs,
    onSelectPlayer: setSelectedPlayer,
    onResetPositions: () => onChangeLineup({ ...lineup, positions: {} }),
    opponent,
    opponentConditions,
    opponentPlan,
  };
  const primaryAction = phase === "halftime" ? startSecondHalf : phase === "etbreak" ? startExtraTime : kickoff;
  const primaryLabel = !ready
    ? `선발 ${placedIds.size}/${requiredPlayers} 배치 필요`
    : phase === "halftime"
      ? "🔄 후반전 시작"
      : phase === "etbreak"
        ? "🔥 연장전 시작"
        : "▶ 킥오프 (경기 실행)";

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={lineupCollisionDetection}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <MatchBoardScreen
        team={team}
        activeMatch={activeMatch}
        phase={phase}
        lineup={lineup}
        formation={formation}
        detectedFormation={detectedFormation}
        effectiveAttackBias={effectiveAttackBias}
        teamTactics={teamTactics}
        onTacticsChange={changePreMatchTactics}
        opponent={opponent}
        opponentPlayers={opponentEleven}
        opponentBench={opponentBench}
        opponentConditions={opponentConditions}
        opponentPlan={opponentPlan}
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
        requiredPlayers={requiredPlayers}
        discipline={discipline}
        lineupInteractive={!arenaOpen}
        pitchRef={pitchRef}
        onBack={onBack}
        onSoundChange={setSoundOn}
        onSelectFormation={selectFormation}
        onAutoFill={autoFill}
        onResetPositions={() => onChangeLineup({ ...lineup, positions: {} })}
        onPrimaryAction={primaryAction}
        onSelectPlayer={setSelectedPlayer}
      />

      <DragOverlay dropAnimation={null} modifiers={[snapDragToCursor]}>
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
        opponentBench={opponentBench}
        leaderboard={leaderboard}
        liveTactics={teamTactics}
        opponentTactics={liveOpponentTactics}
        opponentFormation={opponentPlan?.formation}
        squadControls={squadControls}
        onTacticChange={changeLiveTactics}
        onOpponentTacticChange={setLiveOpponentTactics}
        onFormationChange={selectFormation}
        onPlayerDismissed={handlePlayerDismissed}
        onMinuteChange={(minute) => {
          liveMinuteRef.current = minute;
        }}
        onFirstHalfComplete={completeFirstHalf}
        onSecondHalfComplete={completeSecondHalf}
        onExtraTimeComplete={completeExtraTime}
        onPhaseChange={setPhase}
        onCommitSubstitutions={commitBenchedOut}
        onClose={closeArena}
        onSchedule={() => {
          closeArena();
          onBack();
        }}
        onNextMatch={() => {
          closeArena();
          onNextMatch();
        }}
      />

      {selectedPlayer && (
        <PlayerStatsModal
          player={selectedPlayer}
          /* The same modal serves both squads, so fall back to the opposition
             map when the pick came from the scouting panel. */
          condition={
            conditions.get(selectedPlayer.player_id) ??
            opponentConditions.get(selectedPlayer.player_id)
          }
          onClose={() => setSelectedPlayer(null)}
        />
      )}
    </DndContext>
  );
}
