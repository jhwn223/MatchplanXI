import { useEffect, type Dispatch, type RefObject, type SetStateAction } from "react";
import {
  eventPlaybackClock,
  findEventDot,
  heldPlaybackClock,
  prepareEventActor,
  projectMatchEvent,
} from "./arenaEventProjector";
import {
  indexPositionSamples,
  interpolatePositionTargets,
  updateArenaMovement,
} from "./arenaMovement";
import { drawArenaFrame } from "./arenaRenderer";
import { displayArenaName } from "./names";
import { buildPenaltySequence } from "./penaltyKicks";
import { clamp as clampf, distanceSquared as d2, kickoffHomeFor, lerp } from "./runtimeMath";
import type { ArenaHud, ArenaState } from "./runtimeTypes";
import type { ArenaSim } from "./types";

const PK_AIM_T = 0.5;
const PK_STRIKE_T = 0.55;
const PK_REVEAL_T = 1.1;
const FIXED_SIMULATION_STEP = 1 / 60;

// About 3m 20s for a regulation match before short stoppages. Event playback
// can briefly hold the clock so the picture, feed and timeline stay together.
const MIN_PER_SEC = 0.45;
interface Options {
  simRef: RefObject<ArenaSim>;
  canvasRef: RefObject<HTMLCanvasElement | null>;
  stateRef: RefObject<ArenaState | null>;
  completedRef: RefObject<boolean>;
  pausedRef: RefObject<boolean>;
  speedRef: RefObject<number>;
  pkOrderRef: RefObject<number[] | null>;
  buildState: () => ArenaState;
  userTeamName: string;
  oppTeamName: string;
  userColor: string;
  startMinute: number;
  endMinute: number;
  onMinuteEnter: (minute: number) => void;
  onPeriodEnd: () => void;
  onPenaltiesPending: () => void;
  onComplete: () => void;
  setEnded: Dispatch<SetStateAction<boolean>>;
  setPaused: Dispatch<SetStateAction<boolean>>;
  setHud: Dispatch<SetStateAction<ArenaHud>>;
}

export function useArenaLoop({
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
  onMinuteEnter,
  onPeriodEnd,
  onPenaltiesPending,
  onComplete,
  setEnded,
  setPaused,
  setHud,
}: Options) {
  useEffect(() => {
    stateRef.current = buildState();
    stateRef.current.kickoffPauseT = 1;
    completedRef.current = false;
    setEnded(false);
    setPaused(false);
    pausedRef.current = false;
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;

    function resize() {
      const rect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    resize();
    window.addEventListener("resize", resize);

    let raf = 0;
    let last = performance.now();
    let hudAcc = 0;
    let simulationAccumulator = 0;
    let pkPendingNotified = false;
    const rng = mulbFromSeed(startMinute * 977 + endMinute * 131 + 97);

    const goalMouth = (side: 0 | 1) => (side === 0 ? { x: 99, y: 50 } : { x: 1, y: 50 });
    // Real shootouts alternate at a single end, not each team's own attacking goal.
    const SHOOTOUT_GOAL = goalMouth(1);

    function triggerGoal(s: ArenaState, side: 0 | 1, scorer?: string, assist?: string) {
      const shooter = s.scoring?.shooter ?? -1;
      s.phase = "celebrate";
      s.celebrateT = 2.6;
      s.goalSide = side;
      s.scoring = null;
      if (shooter >= 0) {
        s.dots[shooter].action = "celebrate";
        s.dots[shooter].actionT = 1.3;
      }
      if (side === 0) s.score[0]++;
      else s.score[1]++;
      const gm = goalMouth(side);
      s.ball.owner = -1;
      s.ball.flightTo = -1;
      s.ball.flightTarget = null;
      s.ball.scripted = false;
      s.ball.x = gm.x;
      s.ball.y = gm.y;
      s.ball.trail = [];
      s.banner =
        side === 0 ? `${scorer ?? userTeamName}${assist ? ` (도움: ${assist})` : ""}` : oppTeamName;
    }

    function kickoffTakerIndex(s: ArenaState, toTeam: 0 | 1) {
      const forward = s.dots.findIndex(
        (dot) => dot.team === toTeam && dot.role === "FWD",
      );
      return forward >= 0
        ? forward
        : s.dots.findIndex((dot) => dot.team === toTeam);
    }

    function kickoffSpotFor(s: ArenaState, index: number, toTeam: 0 | 1) {
      if (index === kickoffTakerIndex(s, toTeam)) {
        return { x: toTeam === 0 ? 48.6 : 51.4, y: 50 };
      }
      const dot = s.dots[index];
      return kickoffHomeFor(dot.hx, dot.hy, dot.team);
    }

    function kickoff(s: ArenaState, toTeam: 0 | 1) {
      s.dots.forEach((d, i) => {
        const spot = kickoffSpotFor(s, i, toTeam);
        d.x = spot.x;
        d.y = spot.y;
        d.vx = 0;
        d.vy = 0;
        d.action = "idle";
        d.actionT = 0;
      });
      s.ball.x = 50;
      s.ball.y = 50;
      s.ball.owner = kickoffTakerIndex(s, toTeam);
      s.ball.flightTo = -1;
      s.ball.flightTarget = null;
      s.ball.scripted = false;
      s.ball.trail = [];
      s.ball.lastTeam = toTeam;
      s.banner = null;
      s.goalSide = null;
      s.scoring = null;
      s.situation = null;
      s.scriptedRun = null;
      s.phase = "play";
      s.actionT = 0.6;
      s.kickoffPauseT = 1;
    }

    // begin a scripted attack toward goal; GOAL only fires once the ball arrives
    function startScoring(
      s: ArenaState,
      side: 0 | 1,
      scorer?: string,
      assist?: string,
      scorerId?: number,
    ) {
      if (s.scoring) return;
      const gm = goalMouth(side);
      let best = findEventDot(s, side, scorer, scorerId);
      let bmin = Infinity;
      if (best < 0) {
        s.dots.forEach((d, i) => {
          if (d.team !== side) return;
          const bias = d.role === "FWD" ? -300 : d.role === "MID" ? 0 : 300;
          const score = Math.abs(d.x - gm.x) + bias;
          if (score < bmin) {
            bmin = score;
            best = i;
          }
        });
      }
      s.scoring = { side, scorer, assist, shooter: best, t: 0 };
      s.ball.owner = -1;
      s.ball.flightTo = -1;
      s.ball.flightTarget = null;
      s.ball.scripted = true;
    }


    function finishSegment(s: ArenaState) {
      s.phase = "ended";
      const currentSim = simRef.current;
      s.score = [currentSim.userGoals, currentSim.oppGoals];
      if (!completedRef.current) {
        completedRef.current = true;
        onComplete();
        setEnded(true);
      }
    }

    // Both teams shoot at the same end during the shootout; only which side of
    // the spot they approach from (and which corner they aim for) varies.
    const pkSpot = () => ({
      x: SHOOTOUT_GOAL.x + 11,
      y: 50,
    });

    const pkTarget = (team: 0 | 1, scored: boolean) => ({
      x: SHOOTOUT_GOAL.x,
      y: clampf(50 + (scored ? (team === 0 ? 7 : -7) : 0), 20, 80),
    });

    function positionForKick(s: ArenaState) {
      const kick = s.pkSequence[s.pkIndex];
      if (!kick) return;
      const kickNumber = Math.floor(s.pkIndex / 2);
      const spot = pkSpot();
      const kickerPool = s.dots.filter((d) => d.team === kick.team && d.role !== "GK");
      const keeperDot = s.dots.find((d) => d.team !== kick.team && d.role === "GK");
      const chosenKicker = kick.playerId != null
        ? s.dots.find((d) => d.playerId === kick.playerId)
        : null;
      const kicker = chosenKicker ?? (kickerPool.length ? kickerPool[kickNumber % kickerPool.length] : null);
      if (kicker) {
        kicker.x = spot.x;
        kicker.y = spot.y;
      }
      if (keeperDot) {
        keeperDot.x = SHOOTOUT_GOAL.x;
        keeperDot.y = SHOOTOUT_GOAL.y;
      }
      s.ball.x = spot.x;
      s.ball.y = spot.y;
      s.ball.owner = kicker ? s.dots.indexOf(kicker) : -1;
      s.ball.flightTo = -1;
      s.ball.flightTarget = null;
    }

    function startPenalties(s: ArenaState) {
      const currentSim = simRef.current;
      s.phase = "penalties";
      s.pkSequence = buildPenaltySequence(currentSim.penalties!, rng, pkOrderRef.current ?? undefined);
      s.pkIndex = 0;
      s.pkScore = [0, 0];
      s.pkStage = "aim";
      s.penT = PK_AIM_T;
      s.banner = null;
      s.periodBanner = "승부차기";
      s.periodBannerT = PK_AIM_T + PK_STRIKE_T;
      positionForKick(s);
    }

    let cachedSamples = simRef.current.positionSamples;
    let positionSampleIndex = indexPositionSamples(cachedSamples);

    function update(dt: number) {
      const s = stateRef.current!;
      if (s.phase === "ended" || s.phase === "interim") return;
      if ((s.kickoffPauseT ?? 0) > 0) {
        return;
      }
      s.time += dt;
      s.ball.previousX = s.ball.x;
      s.ball.previousY = s.ball.y;
      s.ball.trail.forEach((point) => {
        point.age += dt;
      });
      s.ball.trail = s.ball.trail.filter((point) => point.age < 0.55);

      if (s.periodBannerT > 0) {
        s.periodBannerT -= dt;
        if (s.periodBannerT <= 0) s.periodBanner = null;
      }
      if (s.situation) {
        s.situation.elapsed = (s.situation.elapsed ?? 0) + dt;
        s.situation.remaining -= dt;
        if (s.situation.remaining <= 0) {
          const restart = s.situation;
          const actor = s.dots[restart.actor];
          const actorReady =
            !actor ||
            Math.hypot(actor.x - restart.x, actor.y - restart.y) <= 3;
          const restartTimedOut = restart.elapsed >= 4;
          if (restart.type === "foul" || actorReady || restartTimedOut) {
            if (actor && restart.type !== "foul") {
              s.ball.owner = restart.actor;
              s.ball.x = actor.x;
              s.ball.y = actor.y;
              s.ball.flightTo = -1;
              s.ball.flightTarget = null;
              s.ball.scripted = false;
            }
            s.situation = null;
          } else {
            s.situation.remaining = 0.12;
          }
        }
      }
      if (s.scriptedRun) {
        const run = s.scriptedRun;
        const runner = s.dots[run.actor];
        run.elapsed = (run.elapsed ?? 0) + dt;
        const claimRadius = run.elapsed >= 1.2 ? 2.8 : 1.8;
        // A run that cannot physically be completed (the target sits outside
        // the runner's allowed zone) must still release the match instead of
        // freezing event playback forever.
        const runTimedOut = run.elapsed >= 3.5;
        if (
          !runner ||
          runTimedOut ||
          Math.hypot(runner.x - run.x, runner.y - run.y) <= claimRadius
        ) {
          if (runner && run.claimBall) {
            s.ball.owner = run.actor;
            s.ball.x = runner.x;
            s.ball.y = runner.y;
            s.ball.lastTeam = runner.team;
            s.ball.flightTo = -1;
            s.ball.flightTarget = null;
            s.ball.scripted = false;
          }
          s.scriptedRun = null;
        }
      }

      if (s.phase === "penalties") {
        const kick = s.pkSequence[s.pkIndex];
        if (!kick) {
          finishSegment(s);
          return;
        }
        s.penT -= dt;
        if (s.pkStage === "aim") {
          if (s.penT <= 0) {
            s.pkStage = "strike";
            s.penT = PK_STRIKE_T;
          }
          return;
        }
        if (s.pkStage === "strike") {
          const spot = pkSpot();
          const target = pkTarget(kick.team, kick.scored);
          const t = clampf(1 - s.penT / PK_STRIKE_T, 0, 1);
          s.ball.x = spot.x + (target.x - spot.x) * t;
          s.ball.y = spot.y + (target.y - spot.y) * t;
          if (s.penT <= 0) {
            if (kick.scored) s.pkScore[kick.team]++;
            s.pkStage = "reveal";
            s.penT = PK_REVEAL_T;
            const kicker = s.ball.owner >= 0 ? s.dots[s.ball.owner] : null;
            s.banner = kick.scored && kicker ? displayArenaName(kicker.name) : null;
            s.periodBanner = `PK ${s.pkScore[0]} : ${s.pkScore[1]}${kick.scored ? "" : " · 실축"}`;
            s.periodBannerT = PK_REVEAL_T;
          }
          return;
        }
        // reveal
        if (s.penT <= 0) {
          s.pkIndex++;
          s.banner = null;
          if (s.pkIndex >= s.pkSequence.length) {
            finishSegment(s);
            return;
          }
          positionForKick(s);
          s.pkStage = "aim";
          s.penT = PK_AIM_T;
        }
        return;
      }

      if (s.phase === "celebrate") {
        s.celebrateT -= dt;
        // Players jog back to the kickoff shape during the celebration so the
        // restart never has to teleport a whole team into position.
        const nextKickoffTeam: 0 | 1 = s.goalSide === 0 ? 1 : 0;
        let everyoneSet = true;
        s.dots.forEach((d, i) => {
          if (d.action === "celebrate" && d.actionT > 0) {
            d.actionT = Math.max(0, d.actionT - dt);
            everyoneSet = false;
            return;
          }
          const spot = kickoffSpotFor(s, i, nextKickoffTeam);
          const dx = spot.x - d.x;
          const dy = spot.y - d.y;
          const distance = Math.hypot(dx, dy);
          if (distance < 0.4) {
            d.vx = 0;
            d.vy = 0;
            return;
          }
          everyoneSet = false;
          const step = Math.min(distance, 18 * dt);
          d.x += (dx / distance) * step;
          d.y += (dy / distance) * step;
          d.facing = Math.atan2(dy, dx);
          d.action = "move";
          d.actionT = 0;
        });
        // Restart once the picture is set; the extra 2s cap keeps a distant
        // straggler from stalling the game (they snap the last few metres).
        if (s.celebrateT <= 0 && (everyoneSet || s.celebrateT <= -2)) {
          kickoff(s, nextKickoffTeam);
        }
        return;
      }

      // extra-time period announcements (only for a segment that plays past 90')
      if (endMinute > 90) {
        if (!s.announcedET1 && s.clock >= 90) {
          s.announcedET1 = true;
          s.periodBanner = "연장 전반";
          s.periodBannerT = 2.2;
        }
        if (!s.announcedET2 && s.clock >= 105) {
          s.announcedET2 = true;
          s.periodBanner = "연장 후반";
          s.periodBannerT = 2.2;
        }
      }

      const proposedClock = Math.min(endMinute, s.clock + dt * MIN_PER_SEC);

      // Generate the upcoming match minute at the beginning of its visual
      // interval. This keeps the future unknown while leaving enough real time
      // to animate every action that the engine resolved for that minute.
      const upcomingMinute = Math.min(
        endMinute,
        Math.max(startMinute + 1, Math.floor(proposedClock) + 1),
      );
      onMinuteEnter(upcomingMinute);

      // Consume only the action log that produced the score and statistics.
      // Multiple events in one minute are deliberately spread across that
      // minute instead of firing in consecutive animation frames.
      const currentSim = simRef.current;
      const ballBusy =
        s.ball.flightTo >= 0 ||
        s.ball.flightTarget != null ||
        s.scoring != null ||
        s.situation != null ||
        s.scriptedRun != null;
      const nextPlayback = eventPlaybackClock(
        currentSim.events ?? [],
        s.nextEvent,
      );
      s.clock = Number.isFinite(nextPlayback)
        ? Math.min(proposedClock, Math.max(s.clock, nextPlayback + 0.65))
        : proposedClock;
      const hasPendingEvents = s.nextEvent < (currentSim.events?.length ?? 0);
      s.clock = heldPlaybackClock(
        s.clock,
        endMinute,
        nextPlayback,
        proposedClock >= endMinute && (hasPendingEvents || ballBusy),
      );
      const reachedPeriodEnd =
        proposedClock >= endMinute && !hasPendingEvents && !ballBusy;
      if (reachedPeriodEnd) {
        s.clock = endMinute;
        onPeriodEnd();
      }
      if (
        !ballBusy &&
        currentSim.events?.length &&
        s.nextEvent < currentSim.events.length &&
        s.clock >= eventPlaybackClock(currentSim.events, s.nextEvent)
      ) {
        const event = currentSim.events[s.nextEvent];
        if (prepareEventActor(s, event)) {
          projectMatchEvent(s, event, startScoring);
          s.nextEvent++;
        }
      } else if (
        !currentSim.events?.length &&
        !s.scoring &&
        s.nextGoal < currentSim.goals.length &&
        s.clock >= currentSim.goals[s.nextGoal].minute - 0.5
      ) {
        const goal = currentSim.goals[s.nextGoal];
        s.nextGoal++;
        startScoring(
          s,
          goal.side === "user" ? 0 : 1,
          goal.scorer,
          goal.assist,
          goal.scorerId,
        );
      }

      if (s.pendingKick != null) {
        s.ball.owner = s.pendingKick;
        s.ball.flightTo = -1;
        s.ball.flightTarget = null;
        s.pendingKick = null;
      }

      if (s.scoring) {
        // The event engine decided the goal. The 2D view now shows the actual
        // shot travelling into the goal instead of making the scorer run there.
        s.scoring.t += dt;
        const gm = goalMouth(s.scoring.side);
        s.ball.x = lerp(s.ball.x, gm.x, dt * 6.5);
        s.ball.y = lerp(s.ball.y, gm.y, dt * 6.5);
        if (d2(s.ball.x, s.ball.y, gm.x, gm.y) < 1.2 || s.scoring.t > 1.5) {
          triggerGoal(s, s.scoring.side, s.scoring.scorer, s.scoring.assist);
          return;
        }
      } else {
        // A coordinate target represents an unsuccessful pass or a shot. It
        // must complete before the next engine event can take possession.
        if (s.ball.flightTarget) {
          const target = s.ball.flightTarget;
          target.elapsed = Math.min(target.duration, target.elapsed + dt);
          const progress = target.duration > 0 ? target.elapsed / target.duration : 1;
          s.ball.x = lerp(target.fromX, target.x, progress);
          s.ball.y = lerp(target.fromY, target.y, progress);
          if (progress >= 1) {
            const receiver = target.owner != null ? s.dots[target.owner] : null;
            if (
              receiver &&
              Math.hypot(receiver.x - target.x, receiver.y - target.y) > 2.2
            ) {
              s.ball.owner = -1;
              s.scriptedRun = {
                actor: target.owner!,
                x: target.x,
                y: target.y,
                action: "receive",
                claimBall: true,
                elapsed: 0,
              };
            } else {
              s.ball.owner = target.owner ?? -1;
            }
            s.ball.flightTarget = null;
            s.ball.scripted = false;
          }
        } else if (s.ball.flightTo >= 0) {
          const tgt = s.dots[s.ball.flightTo];
          s.ball.x = lerp(s.ball.x, tgt.x, dt * 9);
          s.ball.y = lerp(s.ball.y, tgt.y, dt * 9);
          const flightTeam = tgt.team;
          let stolen = -1;
          s.dots.forEach((d, i) => {
            if (d.team !== flightTeam && d2(d.x, d.y, s.ball.x, s.ball.y) < 5) stolen = i;
          });
          if (stolen >= 0 && !s.ball.scripted) {
            s.ball.owner = stolen;
            s.ball.flightTo = -1;
          } else if (d2(s.ball.x, s.ball.y, tgt.x, tgt.y) < 4) {
            s.ball.owner = s.ball.flightTo;
            s.ball.flightTo = -1;
            s.ball.scripted = false;
          }
        } else if (s.ball.owner >= 0) {
          const o = s.dots[s.ball.owner];
          s.ball.x = lerp(s.ball.x, o.x, dt * 12);
          s.ball.y = lerp(s.ball.y, o.y, dt * 12);
        }
      }
      if (s.ball.owner >= 0) s.ball.lastTeam = s.dots[s.ball.owner].team;
      if (
        Math.hypot(
          s.ball.x - s.ball.previousX,
          s.ball.y - s.ball.previousY,
        ) > 0.18
      ) {
        s.ball.trail.push({ x: s.ball.previousX, y: s.ball.previousY, age: 0 });
        if (s.ball.trail.length > 12) s.ball.trail.shift();
      }

      if (reachedPeriodEnd) {
        const finalSim = simRef.current;
        const pendingEvents = s.nextEvent < (finalSim.events?.length ?? 0);
        const actionStillVisible =
          s.scoring != null || s.ball.flightTo >= 0 || s.ball.flightTarget != null;
        if (!pendingEvents && !actionStillVisible) {
          s.score = [finalSim.userGoals, finalSim.oppGoals];
          if (finalSim.penalties) {
            if (!pkOrderRef.current) {
              // Freeze here — the taker-order screen is up. startPenalties()
              // runs once the user confirms an order (or the app falls back
              // to an auto order).
              if (!pkPendingNotified) {
                pkPendingNotified = true;
                onPenaltiesPending();
              }
              return;
            }
            startPenalties(s);
            return;
          }
          finishSegment(s);
          return;
        }
      }

      if (s.phase === "play") {
        const currentSamples = simRef.current.positionSamples;
        if (currentSamples !== cachedSamples) {
          cachedSamples = currentSamples;
          positionSampleIndex = indexPositionSamples(currentSamples);
        }
        const targets = interpolatePositionTargets(positionSampleIndex, s.clock);
        updateArenaMovement(s, targets, dt);
      }
    }


    const step = (now: number) => {
      const dt = Math.min(0.045, (now - last) / 1000);
      last = now;
      const kickoffPaused = (stateRef.current?.kickoffPauseT ?? 0) > 0;
      if (kickoffPaused && stateRef.current) {
        // Opening stillness is wall-clock time, so 2x/4x playback never
        // shortens the one-second kickoff presentation.
        stateRef.current.kickoffPauseT = Math.max(
          0,
          (stateRef.current.kickoffPauseT ?? 0) - dt,
        );
      }
      if (!pausedRef.current) {
        if (kickoffPaused) {
          simulationAccumulator = 0;
        } else {
          simulationAccumulator = Math.min(
            0.35,
            simulationAccumulator + dt * speedRef.current,
          );
          while (simulationAccumulator >= FIXED_SIMULATION_STEP) {
            update(FIXED_SIMULATION_STEP);
            simulationAccumulator -= FIXED_SIMULATION_STEP;
          }
        }
      } else {
        simulationAccumulator = 0;
      }
      drawArenaFrame(canvas, ctx, stateRef.current!, userColor);
      hudAcc += dt;
      if (hudAcc > 0.08) {
        hudAcc = 0;
        const s = stateRef.current!;
        const periodBanner = s.periodBannerT > 0 ? s.periodBanner : null;
        const situationLabels = {
          foul: "파울 · 경기 중단",
          corner: "코너킥 준비",
          freeKick: "프리킥 준비",
          penaltyKick: "페널티킥 준비",
          offside: "오프사이드 · 간접 프리킥",
        } as const;
        setHud({
          minute: Math.floor(s.clock),
          home: s.score[0],
          away: s.score[1],
          banner: s.phase === "celebrate" || s.phase === "penalties" ? s.banner : null,
          periodBanner,
          eventCount: Math.max(0, s.nextEvent - (s.scoring ? 1 : 0)),
          situation: s.situation
            ? situationLabels[s.situation.type]
            : null,
        });
      }
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [endMinute, startMinute]);
}

function mulbFromSeed(seed: number) {
  let value = seed >>> 0;
  return function () {
    value |= 0;
    value = (value + 0x6d2b79f5) | 0;
    let next = Math.imul(value ^ (value >>> 15), 1 | value);
    next = (next + Math.imul(next ^ (next >>> 7), 61 | next)) ^ next;
    return ((next ^ (next >>> 14)) >>> 0) / 4294967296;
  };
}
