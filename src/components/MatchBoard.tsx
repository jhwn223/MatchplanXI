import { useMemo, useState } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { AnimatePresence } from "framer-motion";
import { FORMATIONS, slotsOf, BENCH_ZONE_ID, type FormationKey } from "../data/formation";
import {
  altitudePenalty,
  computeTeamIndex,
  jetLagPenalty,
  restPenalty,
  travelPenalty,
} from "../data/conditionEngine";
import { stageLabelKo, type TeamMatch } from "../data/tournament";
import {
  autoFillBestXI,
  remapFormation,
  type Slots,
  type TacticalPreset,
} from "../data/tactics";
import { simulateHalf, combineHalves, type HalfResult, type SimInput, type SimResult } from "../data/matchSim";
import type { PlayedResult } from "../data/tournament";
import { usePlayerConditions } from "../hooks/usePlayerConditions";
import { useDropSound } from "../hooks/useDropSound";
import type { Player, Team, TournamentData } from "../data/types";
import { Pitch } from "./Pitch";
import { Bench } from "./Bench";
import { ConditionGauge, type ConditionSubIndices } from "./ConditionGauge";
import { TacticsPanel } from "./TacticsPanel";
import { MatchArena } from "./MatchArena";
import { PlayerCardVisual } from "./PlayerCardVisual";

type MatchPhase = "idle" | "half1" | "halftime" | "half2";

const MAX_SUBS = 5;

export type { Slots } from "../data/tactics";

export interface Lineup {
  formation: FormationKey;
  slots: Slots;
  presetKey?: string | null;
}

export { emptySlots } from "../data/tactics";

interface Props {
  data: TournamentData;
  team: Team;
  teamMatches: TeamMatch[];
  activeMatch: TeamMatch;
  lineup: Lineup;
  onChangeLineup: (next: Lineup) => void;
  onBack: () => void;
  onPlayed: (matchId: number, result: PlayedResult) => void;
  onNextMatch: () => void;
}

export function MatchBoard({
  data,
  team,
  teamMatches,
  activeMatch,
  lineup,
  onChangeLineup,
  onBack,
  onPlayed,
  onNextMatch,
}: Props) {
  const [activeDragId, setActiveDragId] = useState<number | null>(null);
  const [soundOn, setSoundOn] = useState(false);
  const [phase, setPhase] = useState<MatchPhase>("idle");
  const [half1, setHalf1] = useState<HalfResult | null>(null);
  const [half2, setHalf2] = useState<HalfResult | null>(null);
  const [finalSim, setFinalSim] = useState<SimResult | null>(null);
  const [startingXI, setStartingXI] = useState<Set<number> | null>(null);
  const [benchedOut, setBenchedOut] = useState<Set<number>>(new Set());
  const playDrop = useDropSound(soundOn);

  const formationDef = slotsOf(lineup.formation);
  const conditions = usePlayerConditions(data, team.team_id, teamMatches, activeMatch);

  const squad = useMemo(
    () => data.players.filter((p) => p.team_id === team.team_id),
    [data, team.team_id]
  );

  const playersById = useMemo(() => {
    const m = new Map<number, Player>();
    for (const p of squad) m.set(p.player_id, p);
    return m;
  }, [squad]);

  const placedIds = useMemo(
    () => new Set(Object.values(lineup.slots).filter((v): v is number => v != null)),
    [lineup.slots]
  );

  const benchPlayers = useMemo(
    () => squad.filter((p) => !placedIds.has(p.player_id)),
    [squad, placedIds]
  );

  const teamIndex = useMemo(() => {
    const scores = [...placedIds]
      .map((id) => conditions.get(id)?.score)
      .filter((s): s is number => s != null);
    return computeTeamIndex(scores);
  }, [placedIds, conditions]);

  // a "substitution" is a player on the pitch who wasn't part of the kickoff XI
  const subsUsed = useMemo(() => {
    if (!startingXI) return 0;
    return [...placedIds].filter((id) => !startingXI.has(id)).length;
  }, [startingXI, placedIds]);
  const subsRemaining = Math.max(0, MAX_SUBS - subsUsed);

  const conditionSubIndices: ConditionSubIndices = {
    altitude: 100 - altitudePenalty(activeMatch.elevation),
    rest: 100 - restPenalty(activeMatch.restDays),
    travel: 100 - travelPenalty(activeMatch.travelKm),
    jetlag: 100 - jetLagPenalty(activeMatch.tzShiftHours),
  };

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } })
  );

  // memoized so MatchArena's effect (keyed on `sim`) doesn't reset mid-animation
  // just because MatchBoard re-renders for an unrelated reason
  const half1ArenaSim = useMemo(
    () => (half1 ? { goals: half1.goals, userGoals: half1.userGoals, oppGoals: half1.oppGoals } : null),
    [half1]
  );
  const half2ArenaSim = useMemo(
    () =>
      half2 && finalSim
        ? { goals: half2.goals, userGoals: finalSim.userGoals, oppGoals: finalSim.oppGoals, comparison: finalSim.comparison }
        : null,
    [half2, finalSim]
  );

  // --- tactics actions ---
  function selectFormation(key: FormationKey) {
    if (key === lineup.formation) return;
    onChangeLineup({
      formation: key,
      slots: remapFormation(lineup.formation, lineup.slots, key), // keep players
      presetKey: null,
    });
  }

  function applyPreset(preset: TacticalPreset) {
    onChangeLineup({
      formation: preset.formation,
      slots: autoFillBestXI(preset.formation, squad, conditions),
      presetKey: preset.key,
    });
  }

  function autoFill() {
    onChangeLineup({
      ...lineup,
      slots: autoFillBestXI(lineup.formation, squad, conditions),
      presetKey: null,
    });
  }

  // --- drag/drop ---
  function handleDragStart(event: DragStartEvent) {
    const d = event.active.data.current as { playerId: number } | undefined;
    setActiveDragId(d?.playerId ?? null);
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveDragId(null);
    const { active, over } = event;
    if (!over) return;

    const d = active.data.current as { playerId: number; from: string };
    const player = playersById.get(d.playerId);
    if (!player) return;
    const targetId = String(over.id);
    if (targetId === d.from) return;
    if (benchedOut.has(d.playerId)) return; // already substituted off, can't return

    if (targetId === BENCH_ZONE_ID) {
      if (d.from !== BENCH_ZONE_ID) {
        onChangeLineup({ ...lineup, slots: { ...lineup.slots, [d.from]: null }, presetKey: null });
        if (startingXI) {
          setBenchedOut((prev) => new Set(prev).add(d.playerId));
        }
      }
      return;
    }

    const targetSlot = formationDef.find((s) => s.id === targetId);
    if (!targetSlot) return;
    if (targetSlot.position !== player.position) return; // gate

    const prevOccupant = lineup.slots[targetSlot.id];
    const next = { ...lineup.slots };
    if (d.from !== BENCH_ZONE_ID) next[d.from] = null;
    next[targetSlot.id] = d.playerId;

    if (startingXI) {
      const nextPlaced = new Set(Object.values(next).filter((v): v is number => v != null));
      const nextSubsUsed = [...nextPlaced].filter((id) => !startingXI.has(id)).length;
      if (nextSubsUsed > MAX_SUBS) return; // no substitution cards left
    }

    onChangeLineup({ ...lineup, slots: next, presetKey: null });
    playDrop();

    // bringing on a bench player is a real substitution: whoever they replaced is done for the match
    if (startingXI && d.from === BENCH_ZONE_ID && prevOccupant != null) {
      setBenchedOut((prev) => new Set(prev).add(prevOccupant));
    }
  }

  // --- kickoff / simulation ---
  const m = activeMatch.match;
  const opponent = data.teams.find((t) => t.team_name === activeMatch.opponentName);
  const hasActual = m.status === "Completed" && m.home_score != null && m.away_score != null;

  function buildSimInput(): SimInput | null {
    if (placedIds.size < 11 || teamIndex == null) return null;
    const placed = [...placedIds]
      .map((id) => playersById.get(id))
      .filter((p): p is Player => !!p)
      .map((p) => ({ name: p.player_name, position: p.position }));

    const seed =
      m.match_id * 100003 +
      [...placedIds].reduce((s, id) => s + id, 0) * 31 +
      lineup.formation.length * 7;

    const actualUserGoals = activeMatch.isHome ? m.home_score! : m.away_score!;
    const actualOppGoals = activeMatch.isHome ? m.away_score! : m.home_score!;

    return {
      seed,
      userTeamName: team.team_name,
      oppTeamName: activeMatch.opponentName,
      userElo: team.elo_rating,
      oppElo: opponent?.elo_rating ?? 1600,
      conditionIndex: teamIndex,
      attackBias: FORMATIONS[lineup.formation].attackBias,
      isHome: activeMatch.isHome,
      elevation: activeMatch.elevation,
      placed,
      actual: hasActual
        ? { userGoals: actualUserGoals, oppGoals: actualOppGoals, resultType: m.result_type }
        : null,
    };
  }

  function kickoff() {
    const input = buildSimInput();
    if (!input) return;
    setHalf1(simulateHalf(input, 1));
    setHalf2(null);
    setFinalSim(null);
    setStartingXI(new Set(placedIds));
    setBenchedOut(new Set());
    setPhase("half1");
  }

  function startSecondHalf() {
    const input = buildSimInput();
    if (!input || !half1) return;
    const h2 = simulateHalf(input, 2);
    setHalf2(h2);
    setFinalSim(combineHalves(input, half1, h2));
    setPhase("half2");
  }

  function handleMatchEnd() {
    if (!finalSim) return;
    const homeGoals = activeMatch.isHome ? finalSim.userGoals : finalSim.oppGoals;
    const awayGoals = activeMatch.isHome ? finalSim.oppGoals : finalSim.userGoals;
    onPlayed(m.match_id, { homeGoals, awayGoals });
  }

  function closeArena() {
    setPhase("idle");
    setHalf1(null);
    setHalf2(null);
    setFinalSim(null);
    setStartingXI(null);
    setBenchedOut(new Set());
  }

  const activePlayer = activeDragId != null ? playersById.get(activeDragId) : null;
  const ready = placedIds.size === 11;

  return (
    <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <div className="board">
        <header className="board__header">
          <button type="button" className="btn-back" onClick={onBack}>
            ← 일정
          </button>
          <div className="board__match">
            <span className="board__stage">{stageLabelKo(m.stage_name)}</span>
            <span className="board__teams">
              {team.team_name} <span className="board__vs">{activeMatch.isHome ? "vs" : "@"}</span>{" "}
              {activeMatch.opponentName}
            </span>
            <span className="board__stadium">
              {m.stadium_name.replace(/\s*\(.*\)/, "")} · {m.city} · {m.date}
            </span>
          </div>
          <div className="board__controls">
            <span
              className={`elev-badge elev-badge--${
                activeMatch.elevation >= 2000 ? "high" : activeMatch.elevation >= 1000 ? "mid" : "low"
              }`}
            >
              ⛰ 고도 {activeMatch.elevation}m
            </span>
            <span className="board__rest">휴식 {activeMatch.restDays}일</span>
            {activeMatch.travelKm > 0 && (
              <span className="travel-badge">
                ✈ 이동 {activeMatch.travelKm}km
                {activeMatch.tzShiftHours !== 0 ? ` · 시차 ${Math.abs(activeMatch.tzShiftHours)}h` : ""}
              </span>
            )}
            <label className="sound-toggle">
              <input type="checkbox" checked={soundOn} onChange={(e) => setSoundOn(e.target.checked)} />
              사운드
            </label>
          </div>
        </header>

        <div className="board__body">
          <aside className="board__sidebar">
            <TacticsPanel
              formation={lineup.formation}
              onSelectFormation={selectFormation}
              onApplyPreset={applyPreset}
              onAutoFill={autoFill}
              activePresetKey={lineup.presetKey ?? null}
              subsLocked={startingXI != null}
            />
            <ConditionGauge value={teamIndex} filledCount={placedIds.size} subIndices={conditionSubIndices} />
            <div className="sub-tracker">
              <span className="sub-tracker__label">🔄 교체 카드</span>
              <div className="sub-tracker__cards">
                {Array.from({ length: MAX_SUBS }).map((_, i) => (
                  <span key={i} className="sub-card" data-used={i < subsUsed || undefined} />
                ))}
              </div>
              <span className="sub-tracker__count">{subsRemaining}장 남음</span>
            </div>
            {phase === "halftime" && half1 && (
              <div className="halftime-banner">
                ⏱ 하프타임 · 전반 {half1.userGoals} - {half1.oppGoals} · 전술과 라인업을 조정하세요
              </div>
            )}
            <button
              type="button"
              className="kickoff-btn"
              disabled={!ready}
              onClick={phase === "halftime" ? startSecondHalf : kickoff}
            >
              {!ready
                ? `선발 ${placedIds.size}/11 배치 필요`
                : phase === "halftime"
                  ? "🔄 후반전 시작"
                  : "▶ 킥오프 (경기 실행)"}
            </button>
          </aside>

          <main className="board__pitch">
            <Pitch
              formation={formationDef}
              slots={lineup.slots}
              playersById={playersById}
              conditions={conditions}
            />
          </main>

          <section className="board__bench">
            <Bench benchPlayers={benchPlayers} conditions={conditions} benchedOut={benchedOut} />
          </section>
        </div>
      </div>

      <DragOverlay dropAnimation={{ duration: 220, easing: "cubic-bezier(0.2, 0, 0, 1)" }}>
        {activePlayer ? (
          <PlayerCardVisual
            player={activePlayer}
            condition={conditions.get(activePlayer.player_id)}
            variant="slot"
            state="floating"
            useLayoutId={false}
          />
        ) : null}
      </DragOverlay>

      <AnimatePresence>
        {phase === "half1" && half1ArenaSim && (
          <MatchArena
            key="half1"
            sim={half1ArenaSim}
            userTeamName={team.team_name}
            userCode={team.fifa_code}
            oppTeamName={activeMatch.opponentName}
            oppCode={activeMatch.opponentCode}
            userColor="#4fd1c5"
            formation={lineup.formation}
            slots={lineup.slots}
            playersById={playersById}
            startMinute={0}
            endMinute={45}
            final={false}
            onComplete={() => {}}
            onHalftimeContinue={() => setPhase("halftime")}
            onClose={closeArena}
          />
        )}
        {phase === "half2" && half2ArenaSim && (
          <MatchArena
            key="half2"
            sim={half2ArenaSim}
            userTeamName={team.team_name}
            userCode={team.fifa_code}
            oppTeamName={activeMatch.opponentName}
            oppCode={activeMatch.opponentCode}
            userColor="#4fd1c5"
            formation={lineup.formation}
            slots={lineup.slots}
            playersById={playersById}
            startMinute={45}
            endMinute={90}
            startScore={[half1?.userGoals ?? 0, half1?.oppGoals ?? 0]}
            final
            onComplete={handleMatchEnd}
            onClose={closeArena}
            onNext={() => {
              closeArena();
              onNextMatch();
            }}
          />
        )}
      </AnimatePresence>
    </DndContext>
  );
}
