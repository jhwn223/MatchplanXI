import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { slotsOf } from "../data/formation";
import {
  combinePeriods,
  simulatePeriodWithWorld,
  snapshotAtMinute,
  type HalfResult,
  type LiveMatchSnapshot,
  type MatchEvent,
  type MatchSide,
  type MatchWorld,
  type PlacedPlayerLite,
} from "../data/matchSim";
import type { Player, Position } from "../data/types";
import { TeamFlag } from "./TeamFlag";
import { disciplineFromEvents } from "./playerDiscipline";
import { ArenaEventFeed } from "./match-arena/ArenaEventFeed";
import { ArenaLiveStats } from "./match-arena/ArenaLiveStats";
import { ArenaMatchCenter, type MatchCenterTab } from "./match-arena/ArenaMatchCenter";
import { ArenaResultPanel } from "./match-arena/ArenaResultPanel";
import { PenaltyTakerSelect, type PenaltyTakerCandidate } from "./match-arena/PenaltyTakerSelect";
import {
  DEFAULT_TEAM_TACTICS,
  describeTeamTactics,
  simProfileFromTeamTactics,
  type TeamTactics,
} from "./match-arena/tactics";
import { clamp as clampf, homeFor, kickoffHomeFor } from "./match-arena/runtimeMath";
import type { ArenaDot as Dot, ArenaState } from "./match-arena/runtimeTypes";
import type { ArenaSim, MatchArenaProps } from "./match-arena/types";
import { useArenaLoop } from "./match-arena/useArenaLoop";
import {
  TacticImpactPanel,
  type TacticImpactSegment,
} from "./match-arena/TacticImpactPanel";
import {
  decideOpponentTacticChange,
  type OpponentTacticChange,
} from "./match-board/opponentPlan";

export type { ArenaSim } from "./match-arena/types";

function inheritedYellowCards(events: MatchEvent[] | undefined) {
  const cards: Record<MatchSide, Record<number, number>> = { user: {}, opp: {} };
  for (const event of events ?? []) {
    if (event.type !== "yellowCard") continue;
    cards[event.side][event.actorId] = (cards[event.side][event.actorId] ?? 0) + 1;
  }
  return cards;
}

function ScorerList({
  scorers,
}: {
  scorers: { playerId: number; minute: number; name: string }[];
}) {
  if (!scorers.length) return null;
  const groupedScorers = Array.from(
    scorers.reduce((groups, scorer) => {
      const existing = groups.get(scorer.playerId);
      if (existing) {
        existing.minutes.push(scorer.minute);
      } else {
        groups.set(scorer.playerId, {
          playerId: scorer.playerId,
          name: scorer.name,
          minutes: [scorer.minute],
        });
      }
      return groups;
    }, new Map<number, { playerId: number; name: string; minutes: number[] }>()),
    ([, scorer]) => scorer,
  );
  return (
    <ul className="arena-scorers">
      {groupedScorers.map((scorer) => (
        <li key={scorer.playerId}>
          <i aria-hidden="true">⚽</i>
          <span>{scorer.name}</span>
          <em>{scorer.minutes.map((minute) => `${minute}′`).join(", ")}</em>
        </li>
      ))}
    </ul>
  );
}

function BookingList({
  bookings,
}: {
  bookings: { minute: number; name: string; red: boolean }[];
}) {
  if (!bookings.length) return null;
  return (
    <ul className="arena-bookings">
      {bookings.map((booking, index) => (
        <li
          key={`${booking.minute}-${booking.name}-${index}`}
          data-red={booking.red || undefined}
        >
          <i aria-hidden="true" />
          <span>{booking.name}</span>
          <em>{booking.minute}′</em>
        </li>
      ))}
    </ul>
  );
}

function remappedIndex(oldDots: Dot[], nextDots: Dot[], index: number | null | undefined) {
  if (index == null || index < 0) return index ?? -1;
  const dot = oldDots[index];
  return dot ? nextDots.indexOf(dot) : -1;
}

/** Keep every index-based animation reference valid when a player leaves. */
function replaceDotsAndRemapIndexes(s: ArenaState, oldDots: Dot[], nextDots: Dot[]) {
  s.ball.owner = remappedIndex(oldDots, nextDots, s.ball.owner);
  s.ball.flightTo = remappedIndex(oldDots, nextDots, s.ball.flightTo);
  if (s.ball.flightTarget) {
    const owner = s.ball.flightTarget.owner;
    const chaser = s.ball.flightTarget.chaser;
    s.ball.flightTarget.owner = owner == null ? null : remappedIndex(oldDots, nextDots, owner);
    s.ball.flightTarget.chaser = chaser == null ? null : remappedIndex(oldDots, nextDots, chaser);
  }
  if (s.pendingKick != null) {
    const next = remappedIndex(oldDots, nextDots, s.pendingKick);
    s.pendingKick = next >= 0 ? next : null;
  }
  if (s.scoring) {
    const shooter = remappedIndex(oldDots, nextDots, s.scoring.shooter);
    s.scoring = shooter >= 0 ? { ...s.scoring, shooter } : null;
  }
  if (s.scriptedRun) {
    const actor = remappedIndex(oldDots, nextDots, s.scriptedRun.actor);
    s.scriptedRun = actor >= 0 ? { ...s.scriptedRun, actor } : null;
  }
  if (s.situation) {
    const actor = remappedIndex(oldDots, nextDots, s.situation.actor);
    s.situation = actor >= 0 ? { ...s.situation, actor } : null;
  }
  s.dots = nextDots;
}

function removePlayerFromArena(s: ArenaState, side: MatchSide, playerId: number) {
  const team = side === "user" ? 0 : 1;
  const oldDots = [...s.dots];
  const dismissed = oldDots.find((dot) => dot.team === team && dot.playerId === playerId);
  if (!dismissed) return;
  if (s.ball.owner >= 0 && oldDots[s.ball.owner] === dismissed) {
    s.ball.x = dismissed.x;
    s.ball.y = dismissed.y;
  }
  replaceDotsAndRemapIndexes(s, oldDots, oldDots.filter((dot) => dot !== dismissed));
}

export function MatchArena({
  simInput,
  priorEvents,
  squadControls,
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
  onPlayerDismissed,
  onPeriodComplete,
  onComplete,
  onCommitSubstitutions,
  onClose,
  onSchedule,
  onNext,
}: MatchArenaProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const simInputRef = useRef(simInput);
  const stateRef = useRef<ArenaState | null>(null);
  const pausedRef = useRef(false);
  const speedRef = useRef(1);
  const pausedBeforePanelRef = useRef(false);
  const completedRef = useRef(false);
  const pkOrderRef = useRef<number[] | null>(null);
  const tacticsRef = useRef<TeamTactics>(initialTactics);
  const opponentTacticsRef = useRef<TeamTactics>(initialOpponentTactics);
  const periodRef = useRef<HalfResult | null>(null);
  const matchWorldRef = useRef<MatchWorld | null>(null);
  const simulatedThroughRef = useRef(startMinute);
  const handledDismissalsRef = useRef(
    new Set(
      (priorEvents ?? [])
        .filter((event) => event.type === "redCard")
        .map((event) => `${event.side}:${event.actorId}:${event.minute}`),
    ),
  );
  const periodEndedRef = useRef(false);
  const simRef = useRef<ArenaSim>({
    goals: [],
    events: [],
    positionSamples: [],
    userGoals: startScore[0],
    oppGoals: startScore[1],
    userXg: 0,
    oppXg: 0,
  });

  const [paused, setPaused] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [activePanel, setActivePanel] = useState<MatchCenterTab | null>(null);
  const [sidebarTab, setSidebarTab] = useState<"stats" | "feed">("stats");
  const [teamTactics, setTeamTactics] = useState<TeamTactics>(initialTactics);
  const [opponentTactics, setOpponentTactics] = useState<TeamTactics>(initialOpponentTactics);
  const [hud, setHud] = useState({
    minute: startMinute,
    home: startScore[0],
    away: startScore[1],
    banner: null as string | null,
    periodBanner: null as string | null,
    eventCount: 0,
    situation: null as string | null,
  });
  const [ended, setEnded] = useState(false);
  const [pendingPenalties, setPendingPenalties] = useState(false);
  const [sim, setSim] = useState<ArenaSim>(simRef.current);
  const [simulatedThrough, setSimulatedThrough] = useState(startMinute);
  const [impactBaseline, setImpactBaseline] = useState<LiveMatchSnapshot | null>(null);
  const [tacticChangedAt, setTacticChangedAt] = useState(startMinute);
  const [hasTacticChange, setHasTacticChange] = useState(false);
  const [tacticSegments, setTacticSegments] = useState<TacticImpactSegment[]>([
    {
      from: startMinute,
      tactics: initialTactics,
      baseline: null,
    },
  ]);
  const [opponentTacticChanges, setOpponentTacticChanges] = useState<OpponentTacticChange[]>([]);
  const [dismissalNotice, setDismissalNotice] = useState<string | null>(null);

  useEffect(() => {
    simInputRef.current = simInput;
  }, [simInput]);

  function updateTeamTactics(next: TeamTactics) {
    const currentLive = snapshotAtMinute(simRef.current.liveSnapshots ?? [], hud.minute);
    setTacticSegments((current) => {
      const closed = current.map((segment, index) =>
        index === current.length - 1
          ? { ...segment, to: hud.minute, end: currentLive }
          : segment,
      );
      return [
        ...closed,
        {
          from: hud.minute,
          tactics: next,
          baseline: currentLive,
        },
      ];
    });
    setImpactBaseline(currentLive);
    setTacticChangedAt(hud.minute);
    setHasTacticChange(true);
    tacticsRef.current = next;
    if (stateRef.current) {
      const profiles = stateRef.current.shapeProfiles ?? [
        simProfileFromTeamTactics(DEFAULT_TEAM_TACTICS),
        simProfileFromTeamTactics(DEFAULT_TEAM_TACTICS),
      ];
      stateRef.current.shapeProfiles = [simProfileFromTeamTactics(next), profiles[1]];
    }
    setTeamTactics(next);
    onTacticChange?.(next);
  }

  function arenaSimFromPeriod(period: HalfResult): ArenaSim {
    return {
      goals: period.goals,
      events: period.events,
      positionSamples: period.positionSamples,
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
        if (stateRef.current) {
          const profiles = stateRef.current.shapeProfiles ?? [
            simProfileFromTeamTactics(DEFAULT_TEAM_TACTICS),
            simProfileFromTeamTactics(DEFAULT_TEAM_TACTICS),
          ];
          stateRef.current.shapeProfiles = [
            profiles[0],
            simProfileFromTeamTactics(opponentDecision.tactics),
          ];
        }
        setOpponentTactics(opponentDecision.tactics);
        onOpponentTacticChange?.(opponentDecision.tactics);
        setOpponentTacticChanges((current) => [...current, opponentDecision]);
      }
      const priorPlayerStats = accumulated?.playerStats ?? [];
      const availablePlayers = (
        players: PlacedPlayerLite[],
        side: "user" | "opp",
      ) => {
        const dismissed = new Set(
          [
            ...priorPlayerStats
              .filter((stat) => stat.side === side && stat.redCards > 0)
              .map((stat) => stat.playerId),
            ...(priorEvents ?? [])
              .filter((event) => event.side === side && event.type === "redCard")
              .map((event) => event.actorId),
          ],
        );
        const injured = new Set(
          priorPlayerStats
            .filter((stat) => stat.side === side && stat.injuries > 0)
            .map((stat) => stat.playerId),
        );
        const remaining = players.filter((player) => !dismissed.has(player.playerId));
        return remaining.map((player) =>
          injured.has(player.playerId)
            ? { ...player, condition: Math.max(20, player.condition - 30) }
            : player,
        );
      };
      const minuteInput = {
        ...simInputRef.current,
        placed: availablePlayers(simInputRef.current.placed, "user"),
        oppPlaced: availablePlayers(simInputRef.current.oppPlaced, "opp"),
        userTactics: simProfileFromTeamTactics(tacticsRef.current),
        oppTactics: simProfileFromTeamTactics(opponentTacticsRef.current),
        initialYellowCards: inheritedYellowCards(priorEvents),
      };
      const step = simulatePeriodWithWorld(
        minuteInput,
        minute,
        minute,
        minute * 999_983,
        matchWorldRef.current ?? undefined,
      );
      matchWorldRef.current = step.world;
      accumulated = combinePeriods(accumulated, step.result);
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
    onCommitSubstitutions?.();
  }

  function togglePause() {
    setPaused((current) => {
      const next = !current;
      pausedRef.current = next;
      return next;
    });
  }

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.code !== "Space" || event.repeat) return;
      // Only text entry keeps the space bar. Buttons are deliberately not
      // excluded: clicking a speed or tab button leaves it focused, and
      // skipping the shortcut there made the key look broken. Preventing the
      // default keeps the focused button from also firing its click.
      const target = event.target as HTMLElement | null;
      if (target?.closest?.("input, textarea, select, [contenteditable='true']")) return;
      if (activePanel != null || ended || pendingPenalties) return;
      event.preventDefault();
      togglePause();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [activePanel, ended, pendingPenalties]);


  function penaltyTakerCandidates(): PenaltyTakerCandidate[] {
    return slotsOf(formation)
      .filter((slot) => slot.position !== "GK")
      .map((slot) => {
        const pid = slots[slot.id];
        const player = pid != null ? playersById.get(pid) : null;
        if (!player) return null;
        return {
          playerId: player.player_id,
          name: player.player_name,
          position: player.position,
          overall: player.ability?.overall ?? 65,
          composure: player.ability?.composure ?? 65,
          penalties: player.ability?.penalties ?? 65,
        };
      })
      .filter((entry): entry is PenaltyTakerCandidate => entry != null);
  }

  function confirmPenaltyTakers(order: number[]) {
    pkOrderRef.current = order;
    setPendingPenalties(false);
  }

  function ratingsFor(
    player: Player | null | undefined,
    simPlayer?: PlacedPlayerLite,
    fallback = 65,
  ) {
    const ability = player?.ability;
    return {
      react: clampf((ability?.reactions ?? fallback) / 70, 0.72, 1.32),
      pace: ability?.pace ?? fallback,
      passing: ability?.passing ?? fallback,
      vision: ability?.vision ?? simPlayer?.vision ?? fallback,
      positioning: ability?.positioning ?? simPlayer?.positioning ?? fallback,
      dribbling: ability?.dribbling ?? fallback,
      shooting: ability?.shooting ?? fallback,
      defending: ability?.defending ?? fallback,
      goalkeeping: player?.position === "GK"
        ? ((ability?.gkDiving ?? fallback) + (ability?.gkReflexes ?? fallback) + (ability?.gkPositioning ?? fallback)) / 3
        : 10,
      stamina: ability?.stamina ?? fallback,
      condition: simPlayer?.condition ?? 100,
    };
  }

  function simPlayerFor(player: Player | null | undefined, side: "user" | "opp") {
    if (!player) return undefined;
    const squad = side === "user" ? simInputRef.current.placed : simInputRef.current.oppPlaced;
    return squad.find((entry) => entry.playerId === player.player_id);
  }

  function applyUserFormationToState(s: ArenaState, snapToShape: boolean) {
    const userSlots = slotsOf(formation);
    const oldDots = [...s.dots];
    const currentUserDots = oldDots.filter((dot) => dot.team === 0);
    const unused = new Set(currentUserDots);
    const nextUserDots: Dot[] = [];
    userSlots.forEach((slot, i) => {
      const pid = slots[slot.id];
      if (pid == null) return;
      const player = pid != null ? playersById.get(pid) : null;
      let dot = currentUserDots.find((candidate) => candidate.playerId === pid && unused.has(candidate));
      if (!dot) dot = [...unused][0];
      if (!dot) return;
      unused.delete(dot);
      const coordinate = positions?.[slot.id] ?? slot;
      const h = homeFor(coordinate.x, coordinate.y, 0);
      dot.hx = h.x;
      dot.hy = h.y;
      dot.playerId = player?.player_id ?? -(i + 1);
      dot.role = slot.position;
      dot.num = player ? (player.player_id % 30) + 1 : i + 1;
      dot.name = player?.player_name ?? slot.label;
      Object.assign(dot, ratingsFor(player, simPlayerFor(player, "user")));
      if (snapToShape) {
        dot.x = h.x;
        dot.y = h.y;
        dot.vx = 0;
        dot.vy = 0;
      }
      nextUserDots.push(dot);
    });
    replaceDotsAndRemapIndexes(s, oldDots, [
      ...nextUserDots,
      ...oldDots.filter((dot) => dot.team === 1),
    ]);
  }

  function buildState(): ArenaState {
    const dots: Dot[] = [];
    const previouslyDismissed = (side: MatchSide) => new Set(
      (priorEvents ?? [])
        .filter((event) => event.side === side && event.type === "redCard")
        .map((event) => event.actorId),
    );
    const dismissedUser = previouslyDismissed("user");
    const dismissedOpponent = previouslyDismissed("opp");
    const rnd = (i: number) => ((Math.sin(i * 12.9898) * 43758.5453) % 1 + 1) % 1;
    const userSlots = slotsOf(formation);
    userSlots.forEach((s, i) => {
      const pid = slots[s.id];
      const player = pid != null ? playersById.get(pid) : null;
      if (player && dismissedUser.has(player.player_id)) return;
      const num = player ? (player.player_id % 30) + 1 : i + 1;
      const coordinate = positions?.[s.id] ?? s;
      const h = homeFor(coordinate.x, coordinate.y, 0);
      const k = kickoffHomeFor(h.x, h.y, 0);
      dots.push({ playerId: player?.player_id ?? -(i + 1), x: k.x, y: k.y, vx: 0, vy: 0, facing: 0, hx: h.x, hy: h.y, team: 0, num, name: player?.player_name ?? s.label, role: s.position, ...ratingsFor(player, simPlayerFor(player, "user")), nz: 0.6 + rnd(i + 5) * 1.6, ph: rnd(i + 9) * 6.28, action: "idle", actionT: 0 });
    });
    const opponentQueues: Record<Position, Player[]> = {
      GK: opponentPlayers.filter((player) => player.position === "GK"),
      DEF: opponentPlayers.filter((player) => player.position === "DEF"),
      MID: opponentPlayers.filter((player) => player.position === "MID"),
      FWD: opponentPlayers.filter((player) => player.position === "FWD"),
    };
    slotsOf(opponentFormation).forEach((s, i) => {
      const h = homeFor(s.x, s.y, 1);
      const k = kickoffHomeFor(h.x, h.y, 1);
      const player = opponentQueues[s.position].shift() ?? opponentPlayers[i] ?? null;
      if (player && dismissedOpponent.has(player.player_id)) return;
      dots.push({ playerId: player?.player_id ?? -(100 + i + 1), x: k.x, y: k.y, vx: 0, vy: 0, facing: Math.PI, hx: h.x, hy: h.y, team: 1, num: player ? (player.player_id % 30) + 1 : i + 1, name: player?.player_name ?? `${oppCode} ${i + 1}`, role: s.position, ...ratingsFor(player, simPlayerFor(player, "opp")), nz: 0.6 + rnd(i + 25) * 1.6, ph: rnd(i + 29) * 6.28, action: "idle", actionT: 0 });
    });
    // The home side kicks off the match; the away side restarts the second
    // half. The taker stands on the centre spot next to the stationary ball.
    const kickoffTeam: 0 | 1 = startMinute === 45 ? 1 : 0;
    let taker = dots.findIndex((dot) => dot.team === kickoffTeam && dot.role === "FWD");
    if (taker < 0) taker = dots.findIndex((dot) => dot.team === kickoffTeam);
    if (taker >= 0) {
      dots[taker].x = kickoffTeam === 0 ? 48.6 : 51.4;
      dots[taker].y = 50;
    }
    return {
      clock: startMinute,
      phase: "play",
      celebrateT: 0,
      actionT: 0.5,
      score: [...startScore],
      nextGoal: 0,
      nextEvent: 0,
      kickoffPauseT: 1,
      dots,
      shapeProfiles: [
        simProfileFromTeamTactics(tacticsRef.current),
        simProfileFromTeamTactics(opponentTacticsRef.current),
      ],
      ball: {
        x: 50,
        y: 50,
        previousX: 50,
        previousY: 50,
        owner: taker,
        flightTo: -1,
        flightTarget: null,
        lastTeam: kickoffTeam,
        scripted: false,
        trail: [],
      },
      banner: null,
      goalSide: null,
      scriptedRun: null,
      time: 0,
      periodBanner: null,
      periodBannerT: 0,
      situation: null,
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
    pkOrderRef,
    buildState,
    userTeamName,
    oppTeamName,
    userColor,
    startMinute,
    endMinute,
    onMinuteEnter: ensureSimulatedThrough,
    onPeriodEnd: finishLivePeriod,
    onPenaltiesPending: () => setPendingPenalties(true),
    onComplete,
    setEnded,
    setPaused,
    setHud,
  });

  useEffect(() => {
    if (!ended || final || !onInterimContinue) return;
    const timer = window.setTimeout(onInterimContinue, 350);
    return () => window.clearTimeout(timer);
  }, [ended, final, onInterimContinue]);


  function replay() {
    stateRef.current = buildState();
    // Replay the finished timeline without simulating or recording the match again.
    completedRef.current = true;
    pkOrderRef.current = null;
    setPendingPenalties(false);
    setEnded(false);
    setHud({
      minute: startMinute,
      home: startScore[0],
      away: startScore[1],
      banner: null,
      periodBanner: null,
      eventCount: 0,
      situation: null,
    });
    setPaused(false);
    pausedRef.current = false;
  }

  const playedEvents = (sim.events ?? []).slice(0, hud.eventCount);
  const observedUserGoals =
    startScore[0] +
    playedEvents.filter((event) => event.type === "goal" && event.side === "user").length;
  const observedOppGoals =
    startScore[1] +
    playedEvents.filter((event) => event.type === "goal" && event.side === "opp").length;
  const observedUserXg = playedEvents
    .filter((event) => event.type === "shot" && event.side === "user")
    .reduce((sum, event) => sum + (event.xg ?? 0), 0);
  const observedOppXg = playedEvents
    .filter((event) => event.type === "shot" && event.side === "opp")
    .reduce((sum, event) => sum + (event.xg ?? 0), 0);
  const observedSim: ArenaSim = {
    ...sim,
    events: playedEvents,
    userGoals: observedUserGoals,
    oppGoals: observedOppGoals,
    userXg: observedUserXg,
    oppXg: observedOppXg,
  };
  const liveSnapshot = snapshotAtMinute(sim.liveSnapshots ?? [], hud.minute);
  // Bookings are read from the card events rather than the running totals so
  // each one carries the minute it happened, and the periods already played
  // are prepended so the list keeps growing across the interval.
  const timeline = [...(priorEvents ?? []), ...playedEvents];
  const discipline = disciplineFromEvents(timeline, "user");
  useEffect(() => {
    for (const event of playedEvents) {
      if (event.type !== "redCard") continue;
      const key = `${event.side}:${event.actorId}:${event.minute}`;
      if (handledDismissalsRef.current.has(key)) continue;
      handledDismissalsRef.current.add(key);
      if (stateRef.current) {
        removePlayerFromArena(stateRef.current, event.side, event.actorId);
      }
      onPlayerDismissed?.(event.side, event.actorId);
      setDismissalNotice(
        `${event.actor} 퇴장 · ${event.side === "user" ? "10명으로 포메이션을 재정비하세요." : "상대가 10명이 되었습니다. 전술을 재정비하세요."}`,
      );
      openMatchCenter("squad");
    }
    // Event count is the authoritative playback cursor. Other callback/state
    // identities must not make an already handled card fire twice.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hud.eventCount]);
  const bookings = (side: "user" | "opp") =>
    timeline
      .filter(
        (event) =>
          event.side === side &&
          (event.type === "yellowCard" || event.type === "redCard"),
      )
      .map((event) => ({
        minute: event.minute,
        name: event.actor,
        red: event.type === "redCard",
      }));
  const scorers = (side: "user" | "opp") =>
    timeline
      .filter((event) => event.side === side && event.type === "goal")
      .map((event) => ({
        playerId: event.actorId,
        minute: event.minute,
        name: event.actor,
      }));
  // 연장전(90~120분)은 한 화면 안에서 105분을 기준으로 연장 전반/후반 두 구간으로 나눠서 게이지를 채운다.
  const isExtraTime = endMinute > 90;
  const extraTimeHalf = isExtraTime && hud.minute >= 105;
  const segmentStart = isExtraTime ? (extraTimeHalf ? 105 : 90) : startMinute;
  const segmentEnd = isExtraTime ? (extraTimeHalf ? 120 : 105) : endMinute;
  // 눈금은 항상 90분 고정이 아니라 현재 구간(전반/후반/연장 전반/연장 후반)의 시작~종료 분에 맞춰 계산
  const timelineTicks = Array.from({ length: 7 }, (_, i) => Math.round(segmentStart + ((segmentEnd - segmentStart) * i) / 6));

  return (
    <motion.div className="sim-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
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
            <div>
              <span style={{ background: userColor }}>
                <TeamFlag fifaCode={userCode} className="arena-score__flag" />
                <em>{userCode}</em>
              </span>
              <strong>{userTeamName}</strong>
            </div>
            <ScorerList scorers={scorers("user")} />
            <BookingList bookings={bookings("user")} />
          </div>
          <div className="arena-score__center">
            <span className="arena-score__clock">● {hud.minute}′ {endMinute <= 45 ? "전반전" : endMinute <= 90 ? "후반전" : extraTimeHalf ? "연장 후반" : "연장 전반"}</span>
            <strong className="arena-score__nums">{hud.home} <i>:</i> {hud.away}</strong>
          </div>
          <div className="arena-score__team arena-score__team--away">
            <small>AWAY</small>
            <div>
              <strong>{oppTeamName}</strong>
              <span>
                <TeamFlag fifaCode={oppCode} className="arena-score__flag" />
                <em>{oppCode}</em>
              </span>
            </div>
            <ScorerList scorers={scorers("opp")} />
            <BookingList bookings={bookings("opp")} />
          </div>
        </div>

        {!ended && pendingPenalties && (
          <PenaltyTakerSelect
            userTeamName={userTeamName}
            candidates={penaltyTakerCandidates()}
            onConfirm={confirmPenaltyTakers}
          />
        )}

        {!ended && !pendingPenalties && activePanel && (
          <ArenaMatchCenter
            activeTab={activePanel}
            onTabChange={setActivePanel}
            sim={observedSim}
            live={liveSnapshot}
            minute={hud.minute}
            userTeamName={userTeamName}
            userCode={userCode}
            oppTeamName={oppTeamName}
            formation={formation}
            formationLabel={formationLabel}
            tactics={teamTactics}
            slots={slots}
            positions={positions}
            playersById={playersById}
            opponentPlayers={opponentPlayers}
            squadControls={squadControls}
            onApplyTactics={updateTeamTactics}
            onFormationChange={onFormationChange}
            dismissalNotice={dismissalNotice}
            discipline={discipline}
          />
        )}

        <div
          className={`arena-live-grid${activePanel || ended || pendingPenalties ? " arena-live-grid--panel-open" : ""}`}
          aria-hidden={activePanel != null || ended || pendingPenalties}
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
            {hud.situation && (
              <div className="arena-situation" role="status">
                <span>경기 상황</span>
                <strong>{hud.situation}</strong>
              </div>
            )}
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
            {/* The inner box is taken out of flow on wide screens so the
                sidebar cannot stretch the grid row past the pitch. */}
            <div className="arena-insights__inner">
            <div className="arena-insights__tabs" role="tablist">
              {([["stats", "통계"], ["feed", "경기정보"]] as const).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  role="tab"
                  aria-selected={sidebarTab === key}
                  data-active={sidebarTab === key || undefined}
                  onClick={() => setSidebarTab(key)}
                >
                  {label}
                </button>
              ))}
            </div>
            {sidebarTab === "stats" ? (
              <div className="arena-live-stats">
                <ArenaLiveStats
                  live={liveSnapshot}
                  userXg={observedUserXg}
                  oppXg={observedOppXg}
                />
              </div>
            ) : (
              <ArenaEventFeed
                events={playedEvents}
                minute={hud.minute}
                opponentTacticChanges={opponentTacticChanges}
                opponentTactics={opponentTactics}
              />
            )}
            <TacticImpactPanel
              tactics={teamTactics}
              changedAt={tacticChangedAt}
              hasChanged={hasTacticChange}
              baseline={impactBaseline}
              live={liveSnapshot}
              currentMinute={hud.minute}
              simulatedThrough={simulatedThrough}
              segments={tacticSegments}
            />
            </div>
          </div>
        </div>

        {!ended ? (
          <div className="arena-live-controls">
            <div className="arena-timeline">
              <i style={{ width: `${Math.max(0, Math.min(100, ((hud.minute - segmentStart) / Math.max(1, segmentEnd - segmentStart)) * 100))}%` }} />
              {timelineTicks.map((tick, index) => <span key={index}>{tick}′</span>)}
            </div>
            <div className="arena-controls">
            <button type="button" className="arena-ctrl" disabled={activePanel != null} onClick={togglePause}>
              {activePanel ? "분석 중 · 일시정지" : paused ? "▶ 재생 (Space)" : "⏸ 일시정지 (Space)"}
            </button>
            {/* 16x is a skip tier, not a viewing speed: the shortest pass
                flight is under one frame there, and it only reaches a true
                16x above ~46fps before the simulation accumulator clamps. */}
            {[1, 2, 4, 16].map((sp) => (
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
            {/* One entry point: the match centre already carries tabs for
                개요 · 평점 · 분석 · 스쿼드 · 상대 분석 alongside 전술. Once it's
                open this same slot becomes the way back out, so there's a
                single obvious place to look for either action. */}
            {activePanel != null ? (
              <button type="button" className="arena-ctrl arena-ctrl--section arena-ctrl--skip" data-active onClick={closeMatchCenter}>▶ 경기 재개</button>
            ) : (
              <button type="button" className="arena-ctrl arena-ctrl--section arena-ctrl--skip" onClick={() => openMatchCenter("tactics")}>✎ 전술 변경</button>
            )}
            </div>
          </div>
        ) : final ? (
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
            onSchedule={onSchedule}
            onNext={onNext}
          />
        ) : (
          <div className="arena-halftime-transition" role="status">
            <span>{interimLabel}</span>
            <strong>{sim.userGoals} : {sim.oppGoals}</strong>
            <p>전반 분석과 후반 전술 보드를 준비하고 있습니다.</p>
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}
