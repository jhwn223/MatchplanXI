import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { slotsOf } from "../data/formation";
import {
  combinePeriods,
  simulatePeriod,
  snapshotAtMinute,
  type HalfResult,
  type LiveMatchSnapshot,
} from "../data/matchSim";
import type { Player, Position } from "../data/types";
import { ArenaEventFeed } from "./match-arena/ArenaEventFeed";
import { ArenaMatchCenter, type MatchCenterTab } from "./match-arena/ArenaMatchCenter";
import { ArenaResultPanel } from "./match-arena/ArenaResultPanel";
import {
  DEFAULT_TEAM_TACTICS,
  describeTeamTactics,
  intensityFromTeamTactics,
  simProfileFromTeamTactics,
  type LiveIntensity,
  type TeamTactics,
} from "./match-arena/tactics";
import { clamp as clampf, homeFor } from "./match-arena/runtimeMath";
import type { ArenaDot as Dot, ArenaState } from "./match-arena/runtimeTypes";
import type { ArenaSim, MatchArenaProps } from "./match-arena/types";
import { useArenaLoop } from "./match-arena/useArenaLoop";
import { TacticImpactPanel } from "./match-arena/TacticImpactPanel";
import {
  decideOpponentTacticChange,
  type OpponentTacticChange,
} from "./match-board/opponentPlan";

export type { ArenaSim } from "./match-arena/types";

export function MatchArena({
  simInput,
  userTeamName,
  userCode,
  oppTeamName,
  oppCode,
  userColor,
  formation,
  formationLabel,
  tacticStyleKey,
  slots,
  positions,
  playersById,
  opponentPlayers,
  leaderboard,
  startMinute = 0,
  endMinute = 90,
  startScore = [0, 0],
  final = true,
  interimLabel = "구간 종료",
  interimCta = "계속하기 →",
  onInterimContinue,
  initialTactics = DEFAULT_TEAM_TACTICS,
  initialOpponentTactics = DEFAULT_TEAM_TACTICS,
  opponentFormation = "4-3-3",
  onTacticChange,
  onOpponentTacticChange,
  onFormationChange,
  onPeriodComplete,
  onComplete,
  onClose,
  onNext,
}: MatchArenaProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const simInputRef = useRef(simInput);
  const stateRef = useRef<ArenaState | null>(null);
  const pausedRef = useRef(false);
  const speedRef = useRef(1);
  const pausedBeforePanelRef = useRef(false);
  const liveIntensityRef = useRef<LiveIntensity>(intensityFromTeamTactics(initialTactics));
  const completedRef = useRef(false);
  const tacticsRef = useRef<TeamTactics>(initialTactics);
  const opponentTacticsRef = useRef<TeamTactics>(initialOpponentTactics);
  const periodRef = useRef<HalfResult | null>(null);
  const simulatedThroughRef = useRef(startMinute);
  const periodEndedRef = useRef(false);
  const simRef = useRef<ArenaSim>({
    goals: [],
    events: [],
    userGoals: startScore[0],
    oppGoals: startScore[1],
    userXg: 0,
    oppXg: 0,
  });

  const [paused, setPaused] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [activePanel, setActivePanel] = useState<MatchCenterTab | null>(null);
  const [teamTactics, setTeamTactics] = useState<TeamTactics>(initialTactics);
  const [opponentTactics, setOpponentTactics] = useState<TeamTactics>(initialOpponentTactics);
  const [hud, setHud] = useState({
    minute: startMinute,
    home: startScore[0],
    away: startScore[1],
    banner: null as string | null,
    periodBanner: null as string | null,
  });
  const [ended, setEnded] = useState(false);
  const [sim, setSim] = useState<ArenaSim>(simRef.current);
  const [simulatedThrough, setSimulatedThrough] = useState(startMinute);
  const [impactBaseline, setImpactBaseline] = useState<LiveMatchSnapshot | null>(null);
  const [tacticChangedAt, setTacticChangedAt] = useState(startMinute);
  const [hasTacticChange, setHasTacticChange] = useState(false);
  const [opponentTacticChanges, setOpponentTacticChanges] = useState<OpponentTacticChange[]>([]);

  useEffect(() => {
    simInputRef.current = simInput;
  }, [simInput]);

  function updateTeamTactics(next: TeamTactics) {
    const currentLive = snapshotAtMinute(simRef.current.liveSnapshots ?? [], hud.minute);
    setImpactBaseline(currentLive);
    setTacticChangedAt(hud.minute);
    setHasTacticChange(true);
    tacticsRef.current = next;
    liveIntensityRef.current = intensityFromTeamTactics(next);
    setTeamTactics(next);
    onTacticChange?.(next);
  }

  function arenaSimFromPeriod(period: HalfResult): ArenaSim {
    return {
      goals: period.goals,
      events: period.events,
      userGoals: startScore[0] + period.userGoals,
      oppGoals: startScore[1] + period.oppGoals,
      userXg: period.userXg,
      oppXg: period.oppXg,
      teamStats: period.teamStats,
      liveSnapshots: period.liveSnapshots,
    };
  }

  function ensureSimulatedThrough(targetMinute: number) {
    const target = Math.min(endMinute, Math.max(startMinute, Math.floor(targetMinute)));
    if (target <= simulatedThroughRef.current || periodEndedRef.current) return;

    let accumulated = periodRef.current;
    for (let minute = simulatedThroughRef.current + 1; minute <= target; minute++) {
      const liveBeforeChange = snapshotAtMinute(
        accumulated?.liveSnapshots ?? [],
        minute - 1,
      );
      const opponentDecision = decideOpponentTacticChange({
        minute,
        userGoals: startScore[0] + (accumulated?.userGoals ?? 0),
        oppGoals: startScore[1] + (accumulated?.oppGoals ?? 0),
        current: opponentTacticsRef.current,
        userTactics: tacticsRef.current,
        live: liveBeforeChange,
      });
      if (
        opponentDecision &&
        JSON.stringify(opponentDecision.tactics) !== JSON.stringify(opponentTacticsRef.current)
      ) {
        opponentTacticsRef.current = opponentDecision.tactics;
        setOpponentTactics(opponentDecision.tactics);
        onOpponentTacticChange?.(opponentDecision.tactics);
        setOpponentTacticChanges((current) => [...current, opponentDecision]);
      }
      const minuteInput = {
        ...simInputRef.current,
        userTactics: simProfileFromTeamTactics(tacticsRef.current),
        oppTactics: simProfileFromTeamTactics(opponentTacticsRef.current),
      };
      const next = simulatePeriod(minuteInput, minute, minute, minute * 999_983);
      accumulated = combinePeriods(accumulated, next);
    }
    if (!accumulated) return;
    periodRef.current = accumulated;
    simulatedThroughRef.current = target;
    const nextSim = arenaSimFromPeriod(accumulated);
    simRef.current = nextSim;
    setSim(nextSim);
    setSimulatedThrough(target);
  }

  function finishLivePeriod() {
    if (periodEndedRef.current) return;
    ensureSimulatedThrough(endMinute);
    const period = periodRef.current;
    if (!period) return;
    periodEndedRef.current = true;
    const completedSim = onPeriodComplete(period);
    simRef.current = completedSim;
    setSim(completedSim);
  }

  function openMatchCenter(tab: MatchCenterTab) {
    if (activePanel == null) pausedBeforePanelRef.current = pausedRef.current;
    pausedRef.current = true;
    setPaused(true);
    setActivePanel(tab);
  }

  function closeMatchCenter() {
    setActivePanel(null);
    pausedRef.current = pausedBeforePanelRef.current;
    setPaused(pausedBeforePanelRef.current);
  }

  function applyTeamTactics(next: TeamTactics) {
    updateTeamTactics(next);
    closeMatchCenter();
  }

  function ratingsFor(player: Player | null | undefined, fallback = 65) {
    const ability = player?.ability;
    return {
      react: clampf((ability?.reactions ?? fallback) / 70, 0.72, 1.32),
      pace: ability?.pace ?? fallback,
      passing: ability?.passing ?? fallback,
      dribbling: ability?.dribbling ?? fallback,
      shooting: ability?.shooting ?? fallback,
      defending: ability?.defending ?? fallback,
      goalkeeping: player?.position === "GK"
        ? ((ability?.gkDiving ?? fallback) + (ability?.gkReflexes ?? fallback) + (ability?.gkPositioning ?? fallback)) / 3
        : 10,
      stamina: ability?.stamina ?? fallback,
      condition: 72,
    };
  }

  function applyUserFormationToState(s: ArenaState, snapToShape: boolean) {
    const userSlots = slotsOf(formation);
    userSlots.forEach((slot, i) => {
      const dot = s.dots[i];
      if (!dot || dot.team !== 0) return;
      const pid = slots[slot.id];
      const player = pid != null ? playersById.get(pid) : null;
      const coordinate = positions?.[slot.id] ?? slot;
      const h = homeFor(coordinate.x, coordinate.y, 0);
      dot.hx = h.x;
      dot.hy = h.y;
      dot.role = slot.position;
      dot.num = player ? (player.player_id % 30) + 1 : i + 1;
      dot.name = player?.player_name ?? slot.label;
      Object.assign(dot, ratingsFor(player));
      if (snapToShape) {
        dot.x = h.x;
        dot.y = h.y;
      }
    });
  }

  function buildState(): ArenaState {
    const dots: Dot[] = [];
    const rnd = (i: number) => ((Math.sin(i * 12.9898) * 43758.5453) % 1 + 1) % 1;
    const userSlots = slotsOf(formation);
    userSlots.forEach((s, i) => {
      const pid = slots[s.id];
      const player = pid != null ? playersById.get(pid) : null;
      const num = player ? (player.player_id % 30) + 1 : i + 1;
      const coordinate = positions?.[s.id] ?? s;
      const h = homeFor(coordinate.x, coordinate.y, 0);
      dots.push({ x: h.x, y: h.y, hx: h.x, hy: h.y, team: 0, num, name: player?.player_name ?? s.label, role: s.position, ...ratingsFor(player), nz: 0.6 + rnd(i + 5) * 1.6, ph: rnd(i + 9) * 6.28 });
    });
    const opponentQueues: Record<Position, Player[]> = {
      GK: opponentPlayers.filter((player) => player.position === "GK"),
      DEF: opponentPlayers.filter((player) => player.position === "DEF"),
      MID: opponentPlayers.filter((player) => player.position === "MID"),
      FWD: opponentPlayers.filter((player) => player.position === "FWD"),
    };
    slotsOf(opponentFormation).forEach((s, i) => {
      const h = homeFor(s.x, s.y, 1);
      const player = opponentQueues[s.position].shift() ?? opponentPlayers[i] ?? null;
      dots.push({ x: h.x, y: h.y, hx: h.x, hy: h.y, team: 1, num: player ? (player.player_id % 30) + 1 : i + 1, name: player?.player_name ?? `${oppCode} ${i + 1}`, role: s.position, ...ratingsFor(player), nz: 0.6 + rnd(i + 25) * 1.6, ph: rnd(i + 29) * 6.28 });
    });
    return {
      clock: startMinute,
      phase: "play",
      celebrateT: 0,
      actionT: 0.5,
      score: [...startScore],
      nextGoal: 0,
      nextEvent: 0,
      dots,
      ball: { x: 50, y: 50, owner: 8, flightTo: -1, lastTeam: 0, scripted: false },
      banner: null,
      goalSide: null,
      time: 0,
      periodBanner: null,
      periodBannerT: 0,
      announcedET1: false,
      announcedET2: false,
      penT: 0,
      pkSequence: [],
      pkIndex: 0,
      pkScore: [0, 0],
      pkStage: "aim",
    };
  }

  useEffect(() => {
    const s = stateRef.current;
    if (!s) return;
    applyUserFormationToState(s, pausedRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formation, slots, positions, playersById]);

  useArenaLoop({
    simRef,
    canvasRef,
    stateRef,
    completedRef,
    pausedRef,
    speedRef,
    liveIntensityRef,
    buildState,
    userTeamName,
    oppTeamName,
    userColor,
    startMinute,
    endMinute,
    onMinuteEnter: ensureSimulatedThrough,
    onPeriodEnd: finishLivePeriod,
    onComplete,
    setEnded,
    setPaused,
    setHud,
  });


  function replay() {
    stateRef.current = buildState();
    // Replay the finished timeline without simulating or recording the match again.
    completedRef.current = true;
    setEnded(false);
    setHud({ minute: startMinute, home: startScore[0], away: startScore[1], banner: null, periodBanner: null });
    setPaused(false);
    pausedRef.current = false;
  }

  const liveSnapshot = snapshotAtMinute(sim.liveSnapshots ?? [], hud.minute);
  // 연장전(90~120분)은 한 화면 안에서 105분을 기준으로 연장 전반/후반 두 구간으로 나눠서 게이지를 채운다.
  const isExtraTime = endMinute > 90;
  const extraTimeHalf = isExtraTime && hud.minute >= 105;
  const segmentStart = isExtraTime ? (extraTimeHalf ? 105 : 90) : startMinute;
  const segmentEnd = isExtraTime ? (extraTimeHalf ? 120 : 105) : endMinute;
  // 눈금은 항상 90분 고정이 아니라 현재 구간(전반/후반/연장 전반/연장 후반)의 시작~종료 분에 맞춰 계산
  const timelineTicks = Array.from({ length: 7 }, (_, i) => Math.round(segmentStart + ((segmentEnd - segmentStart) * i) / 6));

  return (
    <motion.div className="sim-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
      <motion.div
        className="arena-modal"
        initial={{ scale: 0.95, y: 16, opacity: 0 }}
        animate={{ scale: 1, y: 0, opacity: 1 }}
        transition={{ type: "spring", stiffness: 300, damping: 26 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="arena-score">
          <div className="arena-score__team">
            <small>HOME</small>
            <div><span style={{ background: userColor }}>{userCode}</span><strong>{userTeamName}</strong></div>
          </div>
          <div className="arena-score__center">
            <span className="arena-score__clock">● {hud.minute}′ {endMinute <= 45 ? "전반전" : endMinute <= 90 ? "후반전" : extraTimeHalf ? "연장 후반" : "연장 전반"}</span>
            <strong className="arena-score__nums">{hud.home} <i>:</i> {hud.away}</strong>
          </div>
          <div className="arena-score__team arena-score__team--away">
            <small>AWAY</small>
            <div><strong>{oppTeamName}</strong><span>{oppCode}</span></div>
          </div>
          <button type="button" className="arena-close" onClick={onClose}>
            ✕
          </button>
        </div>

        {!ended && activePanel && (
          <ArenaMatchCenter
            activeTab={activePanel}
            onTabChange={setActivePanel}
            sim={sim}
            live={liveSnapshot}
            minute={hud.minute}
            userTeamName={userTeamName}
            userCode={userCode}
            oppTeamName={oppTeamName}
            formation={formation}
            formationLabel={formationLabel}
            tactics={teamTactics}
            onApplyTactics={applyTeamTactics}
            onFormationChange={onFormationChange}
            onClose={closeMatchCenter}
          />
        )}

        <div
          className={`arena-live-grid${activePanel || ended ? " arena-live-grid--panel-open" : ""}`}
          aria-hidden={activePanel != null || ended}
        >
          <div className="arena-canvas-wrap">
            <canvas ref={canvasRef} className="arena-canvas" />
            <div className="arena-live-tactic">진행 중인 전술<br /><strong>{formation} · {describeTeamTactics(teamTactics)}</strong></div>
            <AnimatePresence>
              {hud.periodBanner && (
                <motion.div
                  key={hud.periodBanner}
                  className="arena-banner"
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                >
                  {hud.periodBanner}
                </motion.div>
              )}
            </AnimatePresence>
            <AnimatePresence>
              {hud.banner && (
                <motion.div
                  key="goal"
                  className="arena-goal"
                  initial={{ scale: 0.3, opacity: 0, rotate: -8 }}
                  animate={{ scale: 1, opacity: 1, rotate: 0 }}
                  exit={{ scale: 1.4, opacity: 0 }}
                  transition={{ type: "spring", stiffness: 260, damping: 12 }}
                >
                  <span className="arena-goal__big">GOAL!</span>
                  <span className="arena-goal__scorer">⚽ {hud.banner}</span>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
          <div className="arena-insights">
            <ArenaEventFeed
              events={sim.events ?? []}
              minute={hud.minute}
              live={liveSnapshot}
              opponentTacticChanges={opponentTacticChanges}
              opponentTactics={opponentTactics}
            />
            <TacticImpactPanel
              tactics={teamTactics}
              changedAt={tacticChangedAt}
              hasChanged={hasTacticChange}
              baseline={impactBaseline}
              live={liveSnapshot}
              currentMinute={hud.minute}
              simulatedThrough={simulatedThrough}
            />
          </div>
        </div>

        {!ended ? (
          <div className="arena-live-controls">
            <div className="arena-timeline">
              <i style={{ width: `${Math.max(0, Math.min(100, ((hud.minute - segmentStart) / Math.max(1, segmentEnd - segmentStart)) * 100))}%` }} />
              {timelineTicks.map((tick, index) => <span key={index}>{tick}′</span>)}
            </div>
            <div className="arena-controls">
            <button type="button" className="arena-ctrl" disabled={activePanel != null} onClick={() => { pausedRef.current = !paused; setPaused(!paused); }}>
              {activePanel ? "분석 중 · 일시정지" : paused ? "▶ 재생" : "⏸ 일시정지"}
            </button>
            {[1, 2, 4].map((sp) => (
              <button
                key={sp}
                type="button"
                className="arena-ctrl"
                data-active={speed === sp || undefined}
                disabled={activePanel != null}
                onClick={() => { speedRef.current = sp; setSpeed(sp); }}
              >
                {sp}배속
              </button>
            ))}
            <button type="button" className="arena-ctrl arena-ctrl--section" data-active={activePanel === "overview" || undefined} onClick={() => openMatchCenter("overview")}>◉ 경기 개요</button>
            <button type="button" className="arena-ctrl arena-ctrl--section" data-active={activePanel === "ratings" || undefined} onClick={() => openMatchCenter("ratings")}>★ 선수 평점</button>
            <button type="button" className="arena-ctrl arena-ctrl--section" data-active={activePanel === "analysis" || undefined} onClick={() => openMatchCenter("analysis")}>▥ 경기 분석</button>
            <button type="button" className="arena-ctrl arena-ctrl--section arena-ctrl--skip" data-active={activePanel === "tactics" || undefined} onClick={() => openMatchCenter("tactics")}>✎ 전술 변경</button>
            <button type="button" className="arena-ctrl arena-ctrl--end" disabled={activePanel != null} onClick={() => { stateRef.current!.clock = endMinute; }}>경기 종료</button>
            </div>
          </div>
        ) : (
          <ArenaResultPanel
            sim={sim}
            final={final}
            interimLabel={interimLabel}
            interimCta={interimCta}
            userTeamName={userTeamName}
            oppTeamName={oppTeamName}
            tacticStyleKey={tacticStyleKey}
            leaderboard={leaderboard}
            onInterimContinue={onInterimContinue}
            onReplay={replay}
            onClose={onClose}
            onNext={onNext}
          />
        )}
      </motion.div>
    </motion.div>
  );
}
