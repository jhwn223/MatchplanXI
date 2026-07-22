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
import { computeTeamIndex } from "../data/conditionEngine";
import { stageLabelKo, type TeamMatch } from "../data/tournament";
import {
  autoFillBestXI,
  canPlaceInSlot,
  remapFormation,
  type Slots,
  type TacticalPreset,
} from "../data/tactics";
import { simulateMatch, type SimResult } from "../data/matchSim";
import type { PlayedResult } from "../data/tournament";
import type { Leaderboard } from "../data/leaderboard";
import { usePlayerConditions } from "../hooks/usePlayerConditions";
import { useDropSound } from "../hooks/useDropSound";
import type { Player, Team, TournamentData } from "../data/types";
import { Pitch } from "./Pitch";
import { Bench } from "./Bench";
import { ConditionGauge } from "./ConditionGauge";
import { TacticsPanel } from "./TacticsPanel";
import { MatchArena } from "./MatchArena";
import { PlayerCardVisual } from "./PlayerCardVisual";

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
  onMatchSim: (sim: SimResult) => void;
  leaderboard: Leaderboard;
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
  onMatchSim,
  leaderboard,
}: Props) {
  const [activeDragId, setActiveDragId] = useState<number | null>(null);
  const [soundOn, setSoundOn] = useState(false);
  const [sim, setSim] = useState<SimResult | null>(null);
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

  function handleDragEnd(event: DragEndEvent) {
    setActiveDragId(null);
    const { active, over } = event;
    if (!over) return;

    const d = active.data.current as { playerId: number; from: string };
    const player = playersById.get(d.playerId);
    if (!player) return;
    const targetId = String(over.id);
    if (targetId === d.from) return;

    if (targetId === BENCH_ZONE_ID) {
      if (d.from !== BENCH_ZONE_ID) {
        onChangeLineup({ ...lineup, slots: { ...lineup.slots, [d.from]: null }, presetKey: null });
      }
      return;
    }

    const targetSlot = formationDef.find((s) => s.id === targetId);
    if (!targetSlot) return;
    if (!canPlaceInSlot(player.position, targetSlot.position)) return; // adjacent tiers only, GK is a wall

    const next = { ...lineup.slots };
    if (d.from !== BENCH_ZONE_ID) next[d.from] = null;
    next[targetSlot.id] = d.playerId;
    onChangeLineup({ ...lineup, slots: next, presetKey: null });
    playDrop();
  }

  // --- kickoff / simulation ---
  const m = activeMatch.match;
  const opponent = data.teams.find((t) => t.team_name === activeMatch.opponentName);
  const hasActual = m.status === "Completed" && m.home_score != null && m.away_score != null;
  const isKnockout = m.stage_name !== "Group Stage";

  function kickoff() {
    if (placedIds.size < 11 || teamIndex == null) return;
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

    const result = simulateMatch({
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
      isKnockout,
    });
    setSim(result);
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

          <main className="board__pitch">
            <Pitch
              formation={formationDef}
              slots={lineup.slots}
              playersById={playersById}
              conditions={conditions}
            />
          </main>

          <section className="board__bench">
            <Bench benchPlayers={benchPlayers} conditions={conditions} />
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
        {sim && (
          <MatchArena
            sim={sim}
            userTeamName={team.team_name}
            userCode={team.fifa_code}
            oppTeamName={activeMatch.opponentName}
            oppCode={activeMatch.opponentCode}
            userColor="#4fd1c5"
            formation={lineup.formation}
            slots={lineup.slots}
            playersById={playersById}
            squad={squad}
            leaderboard={leaderboard}
            onComplete={() => {
              const homeGoals = activeMatch.isHome ? sim.userGoals : sim.oppGoals;
              const awayGoals = activeMatch.isHome ? sim.oppGoals : sim.userGoals;
              const homePenGoals = sim.penalties
                ? activeMatch.isHome
                  ? sim.penalties.userGoals
                  : sim.penalties.oppGoals
                : undefined;
              const awayPenGoals = sim.penalties
                ? activeMatch.isHome
                  ? sim.penalties.oppGoals
                  : sim.penalties.userGoals
                : undefined;
              onPlayed(m.match_id, {
                homeGoals,
                awayGoals,
                wentToPenalties: sim.penalties != null,
                homePenGoals,
                awayPenGoals,
              });
              onMatchSim(sim);
            }}
            onClose={() => setSim(null)}
          />
        )}
      </AnimatePresence>
    </DndContext>
  );
}
