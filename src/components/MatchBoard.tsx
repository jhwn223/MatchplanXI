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
  canPlaceInSlot,
  remapFormation,
  type Slots,
  type TacticalPreset,
} from "../data/tactics";
import {
  applyExtraTime,
  combineHalves,
  simulateHalf,
  type HalfResult,
  type SimInput,
  type SimResult,
} from "../data/matchSim";
import { buildTeamAbilityProfile, selectBestEleven } from "../data/playerAbility";
import type { PlayedResult } from "../data/tournament";
import type { Leaderboard } from "../data/leaderboard";
import { usePlayerConditions } from "../hooks/usePlayerConditions";
import { useDropSound } from "../hooks/useDropSound";
import type { Player, Team, TournamentData } from "../data/types";
import { Pitch } from "./Pitch";
import { Bench } from "./Bench";
import { ConditionGauge, type ConditionSubIndices } from "./ConditionGauge";
import { TacticsPanel } from "./TacticsPanel";
import { MatchArena, type ArenaSim } from "./MatchArena";
import { PlayerCardVisual } from "./PlayerCardVisual";
import { PlayerStatsModal } from "./PlayerStatsModal";

type MatchPhase = "idle" | "half1" | "halftime" | "half2" | "etbreak" | "extratime";

const MAX_SUBS = 5;
const MAX_SUBS_ET = 6; // extra time grants one additional substitution

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
  onMatchSim,
  leaderboard,
  onNextMatch,
}: Props) {
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

  // --- kickoff / simulation prep (declared early: isKnockout/tiedAfterRegulation feed the sub cap below) ---
  const m = activeMatch.match;
  const opponent = data.teams.find((t) => t.team_name === activeMatch.opponentName);
  const hasActual = m.status === "Completed" && m.home_score != null && m.away_score != null;
  const opponentEleven = useMemo(
    () => selectBestEleven(data.players.filter((p) => p.team_id === opponent?.team_id)),
    [data.players, opponent?.team_id]
  );
  const isKnockout = m.stage_name !== "Group Stage";
  const tiedAfterRegulation =
    regSim != null && isKnockout && regSim.userGoals === regSim.oppGoals;

  // a "substitution" is a player on the pitch who wasn't part of the kickoff XI.
  // knockout ties that reach extra time get one extra card (5 -> 6).
  const maxSubs = tiedAfterRegulation || phase === "etbreak" || phase === "extratime" ? MAX_SUBS_ET : MAX_SUBS;
  const subsUsed = useMemo(() => {
    if (!startingXI) return 0;
    return [...placedIds].filter((id) => !startingXI.has(id)).length;
  }, [startingXI, placedIds]);
  const subsRemaining = Math.max(0, maxSubs - subsUsed);

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
  const half1ArenaSim: ArenaSim | null = useMemo(
    () => (half1 ? { goals: half1.goals, userGoals: half1.userGoals, oppGoals: half1.oppGoals } : null),
    [half1]
  );
  const half2ArenaSim: ArenaSim | null = useMemo(
    () =>
      half2 && regSim
        ? {
            goals: half2.goals,
            userGoals: regSim.userGoals,
            oppGoals: regSim.oppGoals,
            comparison: regSim.comparison,
            teamStats: regSim.teamStats,
            wentToExtraTime: regSim.wentToExtraTime,
            penalties: regSim.penalties,
            regulationUserGoals: regSim.regulationUserGoals,
            regulationOppGoals: regSim.regulationOppGoals,
          }
        : null,
    [half2, regSim]
  );
  const extraTimeArenaSim: ArenaSim | null = useMemo(
    () =>
      finalSim
        ? {
            goals: finalSim.goals.filter((g) => g.minute > 90),
            userGoals: finalSim.userGoals,
            oppGoals: finalSim.oppGoals,
            comparison: finalSim.comparison,
            teamStats: finalSim.teamStats,
            wentToExtraTime: finalSim.wentToExtraTime,
            penalties: finalSim.penalties,
            regulationUserGoals: finalSim.regulationUserGoals,
            regulationOppGoals: finalSim.regulationOppGoals,
          }
        : null,
    [finalSim]
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
    if (!canPlaceInSlot(player.position, targetSlot.position)) return; // adjacent tiers only, GK is a wall

    const prevOccupant = lineup.slots[targetSlot.id];
    const next = { ...lineup.slots };
    if (d.from !== BENCH_ZONE_ID) next[d.from] = null;
    next[targetSlot.id] = d.playerId;

    if (startingXI) {
      const nextPlaced = new Set(Object.values(next).filter((v): v is number => v != null));
      const nextSubsUsed = [...nextPlaced].filter((id) => !startingXI.has(id)).length;
      if (nextSubsUsed > maxSubs) return; // no substitution cards left
    }

    onChangeLineup({ ...lineup, slots: next, presetKey: null });
    playDrop();

    // bringing on a bench player is a real substitution: whoever they replaced is done for the match
    if (startingXI && d.from === BENCH_ZONE_ID && prevOccupant != null) {
      setBenchedOut((prev) => new Set(prev).add(prevOccupant));
    }
  }

  function buildSimInput(): SimInput | null {
    if (placedIds.size < 11 || teamIndex == null) return null;
    const placed = [...placedIds]
      .map((id) => playersById.get(id))
      .filter((p): p is Player => !!p)
      .map((p) => ({
        name: p.player_name,
        position: p.position,
        overall: p.ability?.overall ?? 65,
        pace: p.ability?.pace ?? 65,
        shooting: p.ability?.shooting ?? 60,
        finishing: p.ability?.finishing ?? 60,
        positioning: p.ability?.positioning ?? 60,
        passing: p.ability?.passing ?? 65,
        vision: p.ability?.vision ?? 65,
        dribbling: p.ability?.dribbling ?? 65,
        condition: conditions.get(p.player_id)?.score ?? 65,
      }));
    const selectedPlayers = [...placedIds]
      .map((id) => playersById.get(id))
      .filter((p): p is Player => !!p);

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
      userAbility: buildTeamAbilityProfile(selectedPlayers, conditions),
      oppAbility: buildTeamAbilityProfile(opponentEleven),
      actual: hasActual
        ? { userGoals: actualUserGoals, oppGoals: actualOppGoals, resultType: m.result_type }
        : null,
      isKnockout,
    };
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
    const h2 = simulateHalf(input, 2);
    setHalf2(h2);
    setRegSim(combineHalves(input, half1, h2));
    setPhase("half2");
  }

  function startExtraTime() {
    const input = buildSimInput();
    if (!input || !regSim) return;
    setFinalSim(applyExtraTime(input, regSim));
    setPhase("extratime");
  }

  function handleMatchEnd(result: SimResult) {
    const homeGoals = activeMatch.isHome ? result.userGoals : result.oppGoals;
    const awayGoals = activeMatch.isHome ? result.oppGoals : result.userGoals;
    const homePenGoals = result.penalties
      ? activeMatch.isHome
        ? result.penalties.userGoals
        : result.penalties.oppGoals
      : undefined;
    const awayPenGoals = result.penalties
      ? activeMatch.isHome
        ? result.penalties.oppGoals
        : result.penalties.userGoals
      : undefined;
    onPlayed(m.match_id, {
      homeGoals,
      awayGoals,
      wentToPenalties: result.penalties != null,
      homePenGoals,
      awayPenGoals,
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
  const primaryAction =
    phase === "halftime"
      ? startSecondHalf
      : phase === "etbreak"
        ? startExtraTime
        : kickoff;
  const primaryLabel = !ready
    ? `선발 ${placedIds.size}/11 배치 필요`
    : phase === "halftime"
      ? "🔄 후반전 시작"
      : phase === "etbreak"
        ? "🔥 연장전 시작"
        : "▶ 킥오프 (경기 실행)";

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
                {Array.from({ length: maxSubs }).map((_, i) => (
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
            {phase === "etbreak" && regSim && (
              <div className="halftime-banner">
                🔥 연장전 돌입 · 정규시간 {regSim.userGoals} - {regSim.oppGoals} · 교체 카드 1장 추가 지급
              </div>
            )}
            <button
              type="button"
              className="kickoff-btn"
              disabled={!ready}
              onClick={primaryAction}
            >
              {primaryLabel}
            </button>
          </aside>

          <main className="board__pitch">
            <Pitch
              formation={formationDef}
              slots={lineup.slots}
              playersById={playersById}
              conditions={conditions}
              onSelectPlayer={setSelectedPlayer}
            />
          </main>

          <section className="board__bench">
            <Bench
              benchPlayers={benchPlayers}
              conditions={conditions}
              benchedOut={benchedOut}
              onSelectPlayer={setSelectedPlayer}
            />
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
            leaderboard={leaderboard}
            startMinute={0}
            endMinute={45}
            final={false}
            interimLabel="전반전 종료"
            interimCta="후반전 준비하기 →"
            onInterimContinue={() => setPhase("halftime")}
            onComplete={() => {}}
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
            leaderboard={leaderboard}
            startMinute={45}
            endMinute={90}
            startScore={[half1?.userGoals ?? 0, half1?.oppGoals ?? 0]}
            final={!tiedAfterRegulation}
            interimLabel="정규시간 종료"
            interimCta="연장전 준비하기 →"
            onInterimContinue={() => setPhase("etbreak")}
            onComplete={() => regSim && handleMatchEnd(regSim)}
            onClose={closeArena}
            onNext={
              tiedAfterRegulation
                ? undefined
                : () => {
                    closeArena();
                    onNextMatch();
                  }
            }
          />
        )}
        {phase === "extratime" && extraTimeArenaSim && finalSim && (
          <MatchArena
            key="extratime"
            sim={extraTimeArenaSim}
            userTeamName={team.team_name}
            userCode={team.fifa_code}
            oppTeamName={activeMatch.opponentName}
            oppCode={activeMatch.opponentCode}
            userColor="#4fd1c5"
            formation={lineup.formation}
            slots={lineup.slots}
            playersById={playersById}
            leaderboard={leaderboard}
            startMinute={90}
            endMinute={120}
            startScore={[finalSim.regulationUserGoals, finalSim.regulationOppGoals]}
            final
            onComplete={() => handleMatchEnd(finalSim)}
            onClose={closeArena}
            onNext={() => {
              closeArena();
              onNextMatch();
            }}
          />
        )}
      </AnimatePresence>
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
