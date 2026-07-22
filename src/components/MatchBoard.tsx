import { useMemo, useRef, useState } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragMoveEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { AnimatePresence } from "framer-motion";
import { FORMATIONS, slotsOf, BENCH_ZONE_ID, type FormationKey, type FormationSlot } from "../data/formation";
import { computeTeamIndex } from "../data/conditionEngine";
import { stageLabelKo, type TeamMatch } from "../data/tournament";
import {
  autoFillBestXI,
  remapFormation,
  type Slots,
  type TacticalPreset,
} from "../data/tactics";
import { simulateHalf, buildComparison, type SimResult, type SimInput } from "../data/matchSim";
import type { PlayedResult } from "../data/tournament";
import { usePlayerConditions } from "../hooks/usePlayerConditions";
import { useDropSound } from "../hooks/useDropSound";
import type { Player, Team, TournamentData } from "../data/types";
import { Pitch } from "./Pitch";
import { Bench } from "./Bench";
import { ConditionGauge } from "./ConditionGauge";
import { TacticsPanel } from "./TacticsPanel";
import { MatchArena } from "./MatchArena";
import { HalftimeModal } from "./HalftimeModal";
import { PlayerCardVisual } from "./PlayerCardVisual";

export type { Slots } from "../data/tactics";

export interface Lineup {
  formation: FormationKey;
  slots: Slots;
  presetKey?: string | null;
  /** manual x/y overrides per slot id, from dragging a placed player around the pitch. */
  positions?: Record<string, { x: number; y: number }>;
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

export { emptySlots } from "../data/tactics";

interface Props {
  data: TournamentData;
  team: Team;
  teamMatches: TeamMatch[];
  activeMatch: TeamMatch;
  lineup: Lineup;
  restBias?: Record<number, number>;
  onChangeLineup: (next: Lineup) => void;
  onBack: () => void;
  onPlayed: (matchId: number, result: PlayedResult) => void;
  /** when provided, the post-match screen offers a shortcut straight to the next fixture. */
  onNextMatch?: () => void;
}

type MatchPhase = "idle" | "half1" | "halftime" | "half2";

export function MatchBoard({
  data,
  team,
  teamMatches,
  activeMatch,
  lineup,
  restBias,
  onChangeLineup,
  onBack,
  onPlayed,
  onNextMatch,
}: Props) {
  const [activeDragId, setActiveDragId] = useState<number | null>(null);
  const [dragOverSlotId, setDragOverSlotId] = useState<string | null>(null);
  const [freePreview, setFreePreview] = useState<{ slotId: string; x: number; y: number } | null>(null);
  const pitchRef = useRef<HTMLDivElement>(null);
  const [soundOn, setSoundOn] = useState(false);
  const [phase, setPhase] = useState<MatchPhase>("idle");
  const [half1Sim, setHalf1Sim] = useState<SimResult | null>(null);
  const [finalSim, setFinalSim] = useState<SimResult | null>(null);
  const [matchSeed, setMatchSeed] = useState<number | null>(null);
  const [htSubsUsed, setHtSubsUsed] = useState(0);
  const playDrop = useDropSound(soundOn);

  const formationDef = slotsOf(lineup.formation);
  const effectiveFormation = useMemo<FormationSlot[]>(
    () =>
      formationDef.map((s) => {
        const custom = lineup.positions?.[s.id];
        return custom ? { ...s, x: custom.x, y: custom.y } : s;
      }),
    [formationDef, lineup.positions]
  );
  const restBiasMap = useMemo(() => {
    const map = new Map<number, number>();
    if (restBias) for (const [k, v] of Object.entries(restBias)) map.set(Number(k), v);
    return map;
  }, [restBias]);
  const conditions = usePlayerConditions(data, team.team_id, teamMatches, activeMatch, restBiasMap);

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

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } })
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

  function handleDragOver(event: DragOverEvent) {
    const overId = event.over ? String(event.over.id) : null;
    setDragOverSlotId(overId && overId !== BENCH_ZONE_ID ? overId : null);
  }

  // continuously track a placed player being dragged across open grass (not over any slot),
  // so it can be dropped anywhere on the pitch instead of only swapping with another slot.
  function handleDragMove(event: DragMoveEvent) {
    const d = event.active.data.current as { playerId: number; from: string } | undefined;
    if (!d || d.from === BENCH_ZONE_ID || event.over) {
      setFreePreview(null);
      return;
    }
    const rect = pitchRef.current?.getBoundingClientRect();
    const origin = effectiveFormation.find((s) => s.id === d.from);
    if (!rect || rect.width === 0 || !origin) {
      setFreePreview(null);
      return;
    }
    const nx = clamp(origin.x + (event.delta.x / rect.width) * 100, 3, 97);
    const ny = clamp(origin.y + (event.delta.y / rect.height) * 100, 4, 96);
    setFreePreview({ slotId: d.from, x: nx, y: ny });
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveDragId(null);
    setDragOverSlotId(null);
    setFreePreview(null);
    const { active, over, delta } = event;
    const d = active.data.current as { playerId: number; from: string } | undefined;
    if (!d) return;
    const player = playersById.get(d.playerId);
    if (!player) return;

    if (!over) {
      // dropped on open pitch space: freely reposition an already-placed player there
      if (d.from !== BENCH_ZONE_ID) {
        const rect = pitchRef.current?.getBoundingClientRect();
        const origin = effectiveFormation.find((s) => s.id === d.from);
        if (rect && rect.width > 0 && origin) {
          const nx = clamp(origin.x + (delta.x / rect.width) * 100, 3, 97);
          const ny = clamp(origin.y + (delta.y / rect.height) * 100, 4, 96);
          onChangeLineup({
            ...lineup,
            positions: { ...(lineup.positions ?? {}), [d.from]: { x: nx, y: ny } },
          });
        }
      }
      return;
    }

    const targetId = String(over.id);
    if (targetId === d.from) return;

    // halftime substitutions (bench -> pitch) are capped; formation changes are not
    const isHalftimeSub = phase === "halftime" && d.from === BENCH_ZONE_ID && targetId !== BENCH_ZONE_ID;
    if (isHalftimeSub && htSubsUsed >= 3) return;

    if (targetId === BENCH_ZONE_ID) {
      if (d.from !== BENCH_ZONE_ID) {
        onChangeLineup({ ...lineup, slots: { ...lineup.slots, [d.from]: null }, presetKey: null });
      }
      return;
    }

    const targetSlot = formationDef.find((s) => s.id === targetId);
    if (!targetSlot) return;
    if (targetSlot.position !== player.position) return; // gate

    const next = { ...lineup.slots };
    if (d.from !== BENCH_ZONE_ID) next[d.from] = null;
    next[targetSlot.id] = d.playerId;
    onChangeLineup({ ...lineup, slots: next, presetKey: null });
    playDrop();
    if (isHalftimeSub) setHtSubsUsed((n) => n + 1);
  }

  // live heatmap preview: while dragging, project the active player onto the slot it's hovering,
  // or onto its free-drag position when dragging across open grass.
  const heatmapSlots = useMemo(() => {
    if (activeDragId == null || !dragOverSlotId) return lineup.slots;
    const targetSlot = formationDef.find((s) => s.id === dragOverSlotId);
    const player = playersById.get(activeDragId);
    if (!targetSlot || !player || targetSlot.position !== player.position) return lineup.slots;
    const fromEntry = Object.entries(lineup.slots).find(([, pid]) => pid === activeDragId);
    const next = { ...lineup.slots };
    if (fromEntry) next[fromEntry[0]] = null;
    next[targetSlot.id] = activeDragId;
    return next;
  }, [activeDragId, dragOverSlotId, lineup.slots, formationDef, playersById]);

  const heatmapFormation = useMemo(() => {
    if (!freePreview) return effectiveFormation;
    return effectiveFormation.map((s) =>
      s.id === freePreview.slotId ? { ...s, x: freePreview.x, y: freePreview.y } : s
    );
  }, [effectiveFormation, freePreview]);

  // --- kickoff / simulation (two halves, so a halftime change can affect the second) ---
  const m = activeMatch.match;
  const opponent = data.teams.find((t) => t.team_name === activeMatch.opponentName);
  const hasActual = m.status === "Completed" && m.home_score != null && m.away_score != null;
  const actualUserGoals = activeMatch.isHome ? m.home_score ?? 0 : m.away_score ?? 0;
  const actualOppGoals = activeMatch.isHome ? m.away_score ?? 0 : m.home_score ?? 0;

  function currentPlacedLite() {
    return [...placedIds]
      .map((id) => playersById.get(id))
      .filter((p): p is Player => !!p)
      .map((p) => ({ name: p.player_name, position: p.position }));
  }

  function kickoff() {
    if (placedIds.size < 11 || teamIndex == null) return;
    const seed =
      m.match_id * 100003 +
      [...placedIds].reduce((s, id) => s + id, 0) * 31 +
      lineup.formation.length * 7;
    setMatchSeed(seed);
    setHtSubsUsed(0);
    setFinalSim(null);

    const half1 = simulateHalf({
      seed,
      userTeamName: team.team_name,
      oppTeamName: activeMatch.opponentName,
      userElo: team.elo_rating,
      oppElo: opponent?.elo_rating ?? 1600,
      conditionIndex: teamIndex,
      attackBias: FORMATIONS[lineup.formation].attackBias,
      isHome: activeMatch.isHome,
      elevation: activeMatch.elevation,
      placed: currentPlacedLite(),
      actual: null,
      minuteMin: 2,
      minuteMax: 44,
      halfScale: 0.5,
    });
    setHalf1Sim(half1);
    setPhase("half1");
  }

  function startSecondHalf() {
    if (!half1Sim || matchSeed == null || teamIndex == null) return;

    const half2 = simulateHalf({
      seed: matchSeed + 999331,
      userTeamName: team.team_name,
      oppTeamName: activeMatch.opponentName,
      userElo: team.elo_rating,
      oppElo: opponent?.elo_rating ?? 1600,
      conditionIndex: teamIndex,
      attackBias: FORMATIONS[lineup.formation].attackBias,
      isHome: activeMatch.isHome,
      elevation: activeMatch.elevation,
      placed: currentPlacedLite(),
      actual: null,
      minuteMin: 46,
      minuteMax: 90,
      halfScale: 0.5,
    });

    const totalUser = half1Sim.userGoals + half2.userGoals;
    const totalOpp = half1Sim.oppGoals + half2.oppGoals;
    const outcome: "W" | "D" | "L" = totalUser > totalOpp ? "W" : totalUser < totalOpp ? "L" : "D";

    const comparisonInput: SimInput = {
      seed: matchSeed,
      userTeamName: team.team_name,
      oppTeamName: activeMatch.opponentName,
      userElo: team.elo_rating,
      oppElo: opponent?.elo_rating ?? 1600,
      conditionIndex: teamIndex,
      attackBias: FORMATIONS[lineup.formation].attackBias,
      isHome: activeMatch.isHome,
      elevation: activeMatch.elevation,
      placed: currentPlacedLite(),
      actual: hasActual
        ? { userGoals: actualUserGoals, oppGoals: actualOppGoals, resultType: m.result_type }
        : null,
    };

    setFinalSim({
      userGoals: totalUser,
      oppGoals: totalOpp,
      userXg: half1Sim.userXg + half2.userXg,
      oppXg: half1Sim.oppXg + half2.oppXg,
      goals: half2.goals,
      comparison: buildComparison(comparisonInput, totalUser, totalOpp, outcome),
    });
    setPhase("half2");
  }

  const activePlayer = activeDragId != null ? playersById.get(activeDragId) : null;
  const ready = placedIds.size === 11;

  return (
    <DndContext
      sensors={sensors}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragMove={handleDragMove}
      onDragEnd={handleDragEnd}
    >
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
            />
            <ConditionGauge value={teamIndex} filledCount={placedIds.size} />
            <button
              type="button"
              className="kickoff-btn"
              disabled={!ready}
              onClick={kickoff}
            >
              {ready ? "▶ 킥오프 (경기 실행)" : `선발 ${placedIds.size}/11 배치 필요`}
            </button>
          </aside>

          {phase !== "halftime" && (
            <main className="board__pitch">
              <Pitch
                ref={pitchRef}
                formation={effectiveFormation}
                slots={lineup.slots}
                playersById={playersById}
                conditions={conditions}
                heatmapSlots={heatmapSlots}
                heatmapFormation={heatmapFormation}
              />
            </main>
          )}

          {phase !== "halftime" && (
            <section className="board__bench">
              <Bench benchPlayers={benchPlayers} conditions={conditions} />
            </section>
          )}
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
        {phase === "half1" && half1Sim && (
          <MatchArena
            key={`h1-${m.match_id}`}
            sim={half1Sim}
            startMinute={0}
            endMinute={45}
            startScore={[0, 0]}
            userTeamName={team.team_name}
            userCode={team.fifa_code}
            oppTeamName={activeMatch.opponentName}
            oppCode={activeMatch.opponentCode}
            userColor="#4fd1c5"
            formation={lineup.formation}
            slots={lineup.slots}
            playersById={playersById}
            onComplete={() => setPhase("halftime")}
            onClose={() => setPhase("idle")}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {phase === "halftime" && half1Sim && (
          <HalftimeModal
            scoreUser={half1Sim.userGoals}
            scoreOpp={half1Sim.oppGoals}
            userCode={team.fifa_code}
            oppCode={activeMatch.opponentCode}
            formation={lineup.formation}
            formationDef={effectiveFormation}
            heatmapFormation={heatmapFormation}
            pitchRef={pitchRef}
            slots={lineup.slots}
            benchPlayers={benchPlayers}
            playersById={playersById}
            conditions={conditions}
            subsUsed={htSubsUsed}
            subsMax={3}
            activePresetKey={lineup.presetKey ?? null}
            onSelectFormation={selectFormation}
            onApplyPreset={applyPreset}
            onAutoFill={autoFill}
            onConfirm={startSecondHalf}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {phase === "half2" && finalSim && half1Sim && (
          <MatchArena
            key={`h2-${m.match_id}`}
            sim={finalSim}
            startMinute={45}
            endMinute={90}
            startScore={[half1Sim.userGoals, half1Sim.oppGoals]}
            userTeamName={team.team_name}
            userCode={team.fifa_code}
            oppTeamName={activeMatch.opponentName}
            oppCode={activeMatch.opponentCode}
            userColor="#4fd1c5"
            formation={lineup.formation}
            slots={lineup.slots}
            playersById={playersById}
            onComplete={() => {
              const homeGoals = activeMatch.isHome ? finalSim.userGoals : finalSim.oppGoals;
              const awayGoals = activeMatch.isHome ? finalSim.oppGoals : finalSim.userGoals;
              onPlayed(m.match_id, { homeGoals, awayGoals });
            }}
            onClose={() => setPhase("idle")}
            onNext={onNextMatch}
          />
        )}
      </AnimatePresence>
    </DndContext>
  );
}
