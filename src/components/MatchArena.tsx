import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { FORMATIONS, slotsOf, type FormationKey, type FormationSlot } from "../data/formation";
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
import { buildTeamAbilityProfile } from "../data/playerAbility";
import { TeamFlag } from "./TeamFlag";
import { disciplineFromEvents } from "./playerDiscipline";
import { ArenaEventFeed } from "./match-arena/ArenaEventFeed";
import { OpponentTacticNotice } from "./match-arena/OpponentTacticNotice";
import { ArenaLiveStats } from "./match-arena/ArenaLiveStats";
import { ArenaMatchCenter, type MatchCenterTab } from "./match-arena/ArenaMatchCenter";
import { ArenaResultPanel } from "./match-arena/ArenaResultPanel";
import { PenaltyTakerSelect, type PenaltyTakerCandidate } from "./match-arena/PenaltyTakerSelect";
import {
  applyQuickTactic,
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
  decideOpponentTacticChange,
  type OpponentTacticChange,
} from "./match-board/opponentPlan";
import { toSimPlayer } from "./match-board/simInput";

export type { ArenaSim } from "./match-arena/types";

function inheritedYellowCards(events: MatchEvent[] | undefined) {
  const cards: Record<MatchSide, Record<number, number>> = { user: {}, opp: {} };
  for (const event of events ?? []) {
    if (event.type !== "yellowCard") continue;
    cards[event.side][event.actorId] = (cards[event.side][event.actorId] ?? 0) + 1;
  }
  return cards;
}

/** Deterministic per match, but deliberately avoids the artificial :00/:05 cadence. */
function opponentMinuteSchedule(seed: number, bases: readonly number[], salt: number) {
  const scheduled = bases.map((base, index) => {
    const hash = Math.abs(Math.imul(seed + salt + index * 7919, 1103515245));
    let minute = base + (hash % 7) - 3;
    if (minute % 5 === 0) minute += hash % 2 === 0 ? 1 : -1;
    return Math.max(18, Math.min(116, minute));
  });
  return [...new Set(scheduled)].sort((a, b) => a - b);
}

function ScorerList({
  scorers,
}: {
  scorers: { playerId: number; minute: number; name: string }[];
}) {
  // Always render the <ul>, even empty — it reserves the same slot on both
  // sides of the scoreboard, so a team with only a card (no goal) doesn't
  // end up with its booking line sitting one slot higher than the other
  // side's and throwing the two columns out of alignment.
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
  // Always render the <ul> — see the comment in ScorerList above.
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
  slotRoles,
  playersById,
  opponentPlayers,
  opponentBench,
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
  onRoleChange,
  setPieces,
  onSetPieceChange,
  savedTactics,
  onSaveTactic,
  onDeleteTactic,
  onOpponentTacticChange,
  onOpponentManagementChange,
  onFormationChange,
  onPlayerDismissed,
  onMinuteChange,
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
  const skipRequestedRef = useRef(false);
  const pausedBeforePanelRef = useRef(false);
  const completedRef = useRef(false);
  const pkOrderRef = useRef<number[] | null>(null);
  const tacticsRef = useRef<TeamTactics>(initialTactics);
  const opponentTacticsRef = useRef<TeamTactics>(initialOpponentTactics);
  const opponentPlayersRef = useRef(opponentPlayers);
  const opponentBenchRef = useRef(opponentBench);
  // Keep a roster history so a dismissed opponent can still be identified in
  // the analysis view after being correctly removed from the active XI.
  const knownOpponentPlayersRef = useRef(
    new Map([...opponentPlayers, ...opponentBench].map((player) => [player.player_id, player])),
  );
  const opponentFormationRef = useRef<FormationKey>(opponentFormation);
  const opponentReviewMinutesRef = useRef(
    opponentMinuteSchedule(simInput.seed, [23, 36, 51, 64, 76, 84, 106], 17),
  );
  const opponentManagementMinutesRef = useRef(
    opponentMinuteSchedule(simInput.seed, [56, 67, 78, 107], 53),
  );
  const handledOpponentManagementRef = useRef(new Set<number>());
  const handledOpponentDismissalManagementRef = useRef(new Set<string>());
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
  const [opponentTacticChanges, setOpponentTacticChanges] = useState<OpponentTacticChange[]>([]);
  const [dismissalNotice, setDismissalNotice] = useState<string | null>(null);
  const [dismissalSide, setDismissalSide] = useState<MatchSide | null>(null);

  useEffect(() => {
    simInputRef.current = simInput;
  }, [simInput]);

  useEffect(() => {
    opponentPlayersRef.current = opponentPlayers;
    opponentBenchRef.current = opponentBench;
    opponentFormationRef.current = opponentFormation;
    for (const player of [...opponentPlayers, ...opponentBench]) {
      knownOpponentPlayersRef.current.set(player.player_id, player);
    }
  }, [opponentBench, opponentFormation, opponentPlayers]);

  function assignOpponentPlayers(players: Player[], nextFormation: FormationKey, minute: number) {
    const available = new Set(players);
    const previous = new Map(simInputRef.current.oppPlaced.map((player) => [player.playerId, player]));
    return slotsOf(nextFormation).flatMap((slot) => {
      const candidates = [...available];
      const player = candidates
        .filter((candidate) => candidate.position === slot.position)
        .sort((a, b) => (b.ability?.overall ?? 0) - (a.ability?.overall ?? 0))[0]
        ?? candidates
          .filter((candidate) => slot.position !== "GK" && candidate.position !== "GK")
          .sort((a, b) => (b.ability?.overall ?? 0) - (a.ability?.overall ?? 0))[0]
        ?? candidates.sort((a, b) => (b.ability?.overall ?? 0) - (a.ability?.overall ?? 0))[0];
      if (!player) return [];
      available.delete(player);
      const old = previous.get(player.player_id);
      return [toSimPlayer(
        player,
        slot,
        old?.condition ?? 100,
        old?.enteredAtMinute ?? minute,
      )];
    });
  }

  function applyOpponentFormationToState(s: ArenaState, placed: PlacedPlayerLite[], snapToShape: boolean) {
    const oldDots = [...s.dots];
    const current = oldDots.filter((dot) => dot.team === 1);
    const unused = new Set(current);
    const nextDots: Dot[] = [];
    placed.forEach((simPlayer, index) => {
      const slot = slotsOf(opponentFormationRef.current).find((entry) => entry.id === simPlayer.slotId)
        ?? ({ x: simPlayer.baseY, y: 100 - simPlayer.baseX, position: simPlayer.position } as FormationSlot);
      const h = homeFor(slot.x, slot.y, 1);
      const player = opponentPlayersRef.current.find((entry) => entry.player_id === simPlayer.playerId);
      let dot = current.find((candidate) => candidate.playerId === simPlayer.playerId && unused.has(candidate));
      if (!dot) dot = [...unused][0];
      if (!dot) {
        dot = {
          playerId: simPlayer.playerId, x: h.x, y: h.y, vx: 0, vy: 0, facing: Math.PI,
          hx: h.x, hy: h.y, team: 1, num: (simPlayer.playerId % 30) + 1,
          name: simPlayer.name, role: simPlayer.position, tacticalRole: simPlayer.tacticalRole,
          ...ratingsFor(player, simPlayer), nz: 1, ph: (index * 1.73) % 6.28,
          action: "idle", actionT: 0,
        };
      }
      unused.delete(dot);
      dot.playerId = simPlayer.playerId;
      dot.name = simPlayer.name;
      dot.role = simPlayer.position;
      dot.hx = h.x;
      dot.hy = h.y;
      Object.assign(dot, ratingsFor(player, simPlayer));
      if (snapToShape) {
        dot.x = h.x;
        dot.y = h.y;
        dot.vx = 0;
        dot.vy = 0;
      }
      nextDots.push(dot);
    });
    replaceDotsAndRemapIndexes(s, oldDots, [
      ...oldDots.filter((dot) => dot.team === 0),
      ...nextDots,
    ]);
  }

  function manageOpponentAtMinute(
    minute: number,
    live: LiveMatchSnapshot | null,
    userGoals: number,
    oppGoals: number,
  ) {
    if (!opponentManagementMinutesRef.current.includes(minute) || handledOpponentManagementRef.current.has(minute)) return;
    handledOpponentManagementRef.current.add(minute);
    const scoreDifference = oppGoals - userGoals;
    const previousFormation = opponentFormationRef.current;
    const nextFormation: FormationKey = scoreDifference <= -2
      ? "3-4-3"
      : scoreDifference < 0
        ? "4-3-3"
        : scoreDifference > 0 && minute >= 70
          ? "5-4-1"
          : previousFormation;
    let active = [...opponentPlayersRef.current];
    let bench = [...opponentBenchRef.current];
    const stats = new Map(
      (live?.players ?? []).filter((stat) => stat.side === "opp").map((stat) => [stat.playerId, stat]),
    );
    const previouslyDismissed = new Set(
      (priorEvents ?? [])
        .filter((event) => event.side === "opp" && event.type === "redCard")
        .map((event) => event.actorId),
    );
    const candidate = active
      .filter((player) => player.position !== "GK" && !previouslyDismissed.has(player.player_id) && !(stats.get(player.player_id)?.redCards))
      .sort((a, b) => {
        const aStat = stats.get(a.player_id);
        const bStat = stats.get(b.player_id);
        const fatigueA = aStat?.condition ?? 100;
        const fatigueB = bStat?.condition ?? 100;
        const inheritedA = (priorEvents ?? []).filter((event) => event.side === "opp" && event.actorId === a.player_id && event.type === "yellowCard").length;
        const inheritedB = (priorEvents ?? []).filter((event) => event.side === "opp" && event.actorId === b.player_id && event.type === "yellowCard").length;
        const riskA = ((aStat?.yellowCards ?? 0) + inheritedA) * 18 + (100 - fatigueA) + Math.max(0, 6.2 - (aStat?.rating ?? 6)) * 8;
        const riskB = ((bStat?.yellowCards ?? 0) + inheritedB) * 18 + (100 - fatigueB) + Math.max(0, 6.2 - (bStat?.rating ?? 6)) * 8;
        return riskB - riskA;
      })[0];
    const candidateStat = candidate ? stats.get(candidate.player_id) : null;
    const candidateInheritedYellows = candidate
      ? (priorEvents ?? []).filter((event) => event.side === "opp" && event.actorId === candidate.player_id && event.type === "yellowCard").length
      : 0;
    const shouldSubstitute = candidate && bench.length > 0 && (
      (candidateStat?.condition ?? 100) < (minute >= 75 ? 82 : minute >= 65 ? 76 : 70)
      || (candidateStat?.yellowCards ?? 0) + candidateInheritedYellows > 0
      || scoreDifference !== 0
    );
    let substitutionText = "";
    if (shouldSubstitute && candidate) {
      const wanted = scoreDifference < 0
        ? ["FWD", "MID"]
        : scoreDifference > 0
          ? ["DEF", "MID"]
          : [candidate.position];
      const incoming = [...bench]
        .sort((a, b) => {
          const fitA = wanted.includes(a.position) ? 20 : a.position === candidate.position ? 10 : 0;
          const fitB = wanted.includes(b.position) ? 20 : b.position === candidate.position ? 10 : 0;
          return fitB + (b.ability?.overall ?? 0) - fitA - (a.ability?.overall ?? 0);
        })[0];
      if (incoming) {
        active = active.map((player) => player.player_id === candidate.player_id ? incoming : player);
        bench = bench.filter((player) => player.player_id !== incoming.player_id);
        substitutionText = `${candidate.player_name} 대신 ${incoming.player_name} 투입`;
      }
    }
    if (!substitutionText && nextFormation === previousFormation) return;
    opponentPlayersRef.current = active;
    opponentBenchRef.current = bench;
    opponentFormationRef.current = nextFormation;
    const placed = assignOpponentPlayers(active, nextFormation, minute);
    simInputRef.current = {
      ...simInputRef.current,
      oppPlaced: placed,
      oppAbility: buildTeamAbilityProfile(active),
      oppAttackBias: FORMATIONS[nextFormation].attackBias,
    };
    if (stateRef.current) applyOpponentFormationToState(stateRef.current, placed, false);
    onOpponentManagementChange?.(active, bench, nextFormation);
    const formationText = nextFormation !== previousFormation ? `포메이션 ${nextFormation} 전환` : "";
    const detail = [substitutionText, formationText].filter(Boolean).join(" · ");
    setOpponentTacticChanges((current) => [...current, {
      minute,
      title: "상대 감독이 선수 구성을 조정",
      detail,
      tactics: opponentTacticsRef.current,
    }]);
  }

  function reactToOpponentDismissal(
    event: MatchEvent,
    userGoals: number,
    oppGoals: number,
  ) {
    if (event.side !== "opp" || event.type !== "redCard") return;
    const key = `${event.actorId}:${event.minute}`;
    if (handledOpponentDismissalManagementRef.current.has(key)) return;
    handledOpponentDismissalManagementRef.current.add(key);

    const dismissedPlayer = opponentPlayersRef.current.find(
      (player) => player.player_id === event.actorId,
    );
    let active = opponentPlayersRef.current.filter(
      (player) => player.player_id !== event.actorId,
    );
    if (active.length === opponentPlayersRef.current.length) return;
    let bench = [...opponentBenchRef.current];
    let emergencyKeeperText = "";
    if (dismissedPlayer?.position === "GK") {
      const replacementKeeper = bench
        .filter((player) => player.position === "GK")
        .sort((a, b) => (b.ability?.overall ?? 0) - (a.ability?.overall ?? 0))[0];
      const sacrificedOutfielder = [...active]
        .filter((player) => player.position !== "GK")
        .sort((a, b) => {
          const priorityA = a.position === "FWD" ? 0 : a.position === "MID" ? 1 : 2;
          const priorityB = b.position === "FWD" ? 0 : b.position === "MID" ? 1 : 2;
          return priorityA - priorityB || (a.ability?.overall ?? 0) - (b.ability?.overall ?? 0);
        })[0];
      if (replacementKeeper && sacrificedOutfielder) {
        active = active
          .filter((player) => player.player_id !== sacrificedOutfielder.player_id)
          .concat(replacementKeeper);
        bench = bench.filter((player) => player.player_id !== replacementKeeper.player_id);
        emergencyKeeperText = `${sacrificedOutfielder.player_name}을 빼고 ${replacementKeeper.player_name} 골키퍼를 투입했습니다. `;
      }
    }

    const isTrailing = oppGoals < userGoals;
    // With ten players these nominal shapes resolve to 4-3-2 or 4-4-1 because
    // assignOpponentPlayers leaves the final attacking slot vacant.
    const nextFormation: FormationKey = isTrailing ? "4-3-3" : "4-4-2";
    const nextTactics = isTrailing
      ? {
          ...applyQuickTactic(opponentTacticsRef.current, "chaseGoal"),
          pressing: "standard" as const,
          defensiveLine: "standard" as const,
        }
      : applyQuickTactic(opponentTacticsRef.current, oppGoals > userGoals ? "protectLead" : "defensive");

    opponentPlayersRef.current = active;
    opponentBenchRef.current = bench;
    opponentFormationRef.current = nextFormation;
    opponentTacticsRef.current = nextTactics;
    const placed = assignOpponentPlayers(active, nextFormation, event.minute);
    simInputRef.current = {
      ...simInputRef.current,
      oppPlaced: placed,
      oppAbility: buildTeamAbilityProfile(active),
      oppAttackBias: FORMATIONS[nextFormation].attackBias,
    };
    if (stateRef.current) {
      applyOpponentFormationToState(stateRef.current, placed, false);
      const profiles = stateRef.current.shapeProfiles ?? [
        simProfileFromTeamTactics(DEFAULT_TEAM_TACTICS),
        simProfileFromTeamTactics(DEFAULT_TEAM_TACTICS),
      ];
      stateRef.current.shapeProfiles = [profiles[0], simProfileFromTeamTactics(nextTactics)];
    }
    setOpponentTactics(nextTactics);
    onOpponentTacticChange?.(nextTactics);
    onOpponentManagementChange?.(active, bench, nextFormation);
    setOpponentTacticChanges((current) => [...current, {
      minute: event.minute,
      title: "상대가 퇴장에 맞춰 대형을 재정비",
      detail: isTrailing
        ? `${emergencyKeeperText}10명으로 ${nextFormation} 기반의 공격 대형을 유지하되 압박 강도를 낮췄습니다.`
        : `${emergencyKeeperText}10명으로 ${nextFormation} 기반의 수비 블록을 만들고 중앙 간격을 좁혔습니다.`,
      tactics: nextTactics,
    }]);
  }

  function updateTeamTactics(next: TeamTactics) {
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
      track: period.track,
      userGoals: startScore[0] + period.userGoals,
      oppGoals: startScore[1] + period.oppGoals,
      userXg: period.userXg,
      oppXg: period.oppXg,
      teamStats: period.teamStats,
      liveSnapshots: period.liveSnapshots,
      playerStats: period.playerStats,
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
      manageOpponentAtMinute(
        minute,
        liveBeforeChange,
        startScore[0] + (accumulated?.userGoals ?? 0),
        startScore[1] + (accumulated?.oppGoals ?? 0),
      );
      const opponentDecision = decideOpponentTacticChange({
        minute,
        userGoals: startScore[0] + (accumulated?.userGoals ?? 0),
        oppGoals: startScore[1] + (accumulated?.oppGoals ?? 0),
        current: opponentTacticsRef.current,
        userTactics: tacticsRef.current,
        live: liveBeforeChange,
        reviewMinutes: opponentReviewMinutesRef.current,
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
      for (const event of step.result.events) {
        reactToOpponentDismissal(
          event,
          startScore[0] + (accumulated?.userGoals ?? 0),
          startScore[1] + (accumulated?.oppGoals ?? 0),
        );
      }
    }
    if (!accumulated) return;
    periodRef.current = accumulated;
    simulatedThroughRef.current = target;
    const nextSim = arenaSimFromPeriod(accumulated);
    simRef.current = nextSim;
    setSim(nextSim);
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

  // Instantly resolves the rest of this segment instead of waiting on
  // animated playback. finishLivePeriod() is the same call the arena loop
  // makes on a natural period end — it both runs the remaining simulation
  // and hands the finished half's data to the parent (via onPeriodComplete),
  // which is what actually unlocks the next segment (e.g. second half
  // kickoff). Skipping straight to setEnded without it left the parent
  // thinking the half never finished.
  function skipToResult() {
    finishLivePeriod();
    skipRequestedRef.current = true;
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
      const coordinate = positions?.[slot.id] ?? slot;
      const h = homeFor(coordinate.x, coordinate.y, 0);
      let dot = currentUserDots.find((candidate) => candidate.playerId === pid && unused.has(candidate));
      if (!dot) dot = [...unused][0];
      // A formation/substitution update can arrive on the same frame as a
      // dismissal reconciliation. Previously there was no spare dot and this
      // branch simply dropped the player from the renderer forever. Recreate
      // the visual state from the authoritative lineup instead.
      if (!dot) {
        dot = {
          playerId: player?.player_id ?? -(i + 1),
          x: h.x,
          y: h.y,
          vx: 0,
          vy: 0,
          facing: 0,
          hx: h.x,
          hy: h.y,
          team: 0,
          num: player ? (player.player_id % 30) + 1 : i + 1,
          name: player?.player_name ?? slot.label,
          role: slot.position,
          ...ratingsFor(player, simPlayerFor(player, "user")),
          nz: 1,
          ph: (i * 1.73) % 6.28,
          action: "idle",
          actionT: 0,
        };
      }
      unused.delete(dot);
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
      dots.push({ playerId: player?.player_id ?? -(i + 1), x: k.x, y: k.y, vx: 0, vy: 0, facing: 0, hx: h.x, hy: h.y, team: 0, num, name: player?.player_name ?? s.label, role: s.position, tacticalRole: simPlayerFor(player, "user")?.tacticalRole, ...ratingsFor(player, simPlayerFor(player, "user")), nz: 0.6 + rnd(i + 5) * 1.6, ph: rnd(i + 9) * 6.28, action: "idle", actionT: 0 });
    });
    const liveOpponentPlayers = opponentPlayersRef.current;
    const opponentQueues: Record<Position, Player[]> = {
      GK: liveOpponentPlayers.filter((player) => player.position === "GK"),
      DEF: liveOpponentPlayers.filter((player) => player.position === "DEF"),
      MID: liveOpponentPlayers.filter((player) => player.position === "MID"),
      FWD: liveOpponentPlayers.filter((player) => player.position === "FWD"),
    };
    slotsOf(opponentFormationRef.current).forEach((s, i) => {
      const h = homeFor(s.x, s.y, 1);
      const k = kickoffHomeFor(h.x, h.y, 1);
      const player = opponentQueues[s.position].shift() ?? liveOpponentPlayers[i] ?? null;
      if (player && dismissedOpponent.has(player.player_id)) return;
      dots.push({ playerId: player?.player_id ?? -(100 + i + 1), x: k.x, y: k.y, vx: 0, vy: 0, facing: Math.PI, hx: h.x, hy: h.y, team: 1, num: player ? (player.player_id % 30) + 1 : i + 1, name: player?.player_name ?? `${oppCode} ${i + 1}`, role: s.position, tacticalRole: simPlayerFor(player, "opp")?.tacticalRole, ...ratingsFor(player, simPlayerFor(player, "opp")), nz: 0.6 + rnd(i + 25) * 1.6, ph: rnd(i + 29) * 6.28, action: "idle", actionT: 0 });
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
      setPieceParticipants: {
        corner: setPieces?.cornerParticipants ?? [],
        freeKick: setPieces?.freeKickParticipants ?? [],
      },
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
    skipRequestedRef,
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
  // The board owns the lineup, so it needs the clock to stamp a substitution
  // with the minute the player actually came on.
  useEffect(() => {
    onMinuteChange?.(hud.minute);
  }, [hud.minute, onMinuteChange]);
  // Bookings are read from the card events rather than the running totals so
  // each one carries the minute it happened, and the periods already played
  // are prepended so the list keeps growing across the interval.
  const timeline = [...(priorEvents ?? []), ...playedEvents];
  const discipline = disciplineFromEvents(timeline, "user");
  const opponentDiscipline = disciplineFromEvents(timeline, "opp");
  const dismissedOpponentPlayers = [...knownOpponentPlayersRef.current.values()].filter(
    (player) => opponentDiscipline.get(player.player_id) === "red",
  );
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
      setDismissalSide(event.side);
      setDismissalNotice(
        event.side === "user"
          ? `우리 팀 퇴장 · ${event.actor} — 10명으로 재정비해야 합니다.`
          : `상대 팀 퇴장 · ${event.actor} — 수적 우세를 활용하도록 스쿼드와 전술을 조정하세요.`,
      );
      // A dismissal always changes the playable shape. Open the one place the
      // user can react to it, regardless of which side lost the player.
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
            formation={formation}
            formationLabel={formationLabel}
            tactics={teamTactics}
            slots={slots}
            positions={positions}
            slotRoles={slotRoles}
            playersById={playersById}
            opponentPlayers={opponentPlayersRef.current}
            opponentBench={opponentBenchRef.current}
            dismissedOpponentPlayers={dismissedOpponentPlayers}
            opponentFormation={opponentFormationRef.current}
            opponentTactics={opponentTactics}
            squadControls={squadControls}
            onApplyTactics={updateTeamTactics}
            onRoleChange={onRoleChange}
                onFormationChange={onFormationChange}
                setPieces={setPieces}
                onSetPieceChange={onSetPieceChange}
            dismissalNotice={dismissalNotice}
            dismissalSide={dismissalSide}
            discipline={discipline}
            opponentDiscipline={opponentDiscipline}
            savedTactics={savedTactics}
            onSaveTactic={onSaveTactic}
            onDeleteTactic={onDeleteTactic}
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
            {/* Above the tab content rather than inside either panel: the two
                panels pad their contents differently, which is what made the
                same notice come out at two widths and two positions. */}
            <OpponentTacticNotice
              changes={opponentTacticChanges}
              minute={hud.minute}
            />
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
                opponentTactics={opponentTactics}
              />
            )}
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
            <button
              type="button"
              className="arena-ctrl arena-ctrl--section"
              disabled={activePanel != null || pendingPenalties}
              onClick={skipToResult}
            >
              ⏭ 결과만 보기
            </button>
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
