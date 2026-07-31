import { useEffect, type Dispatch, type RefObject, type SetStateAction } from "react";
import {
  eventPlaybackClock,
  findEventDot,
  projectMatchEvent,
} from "./arenaEventProjector";
import { drawArenaFrame } from "./arenaRenderer";
import { displayArenaName } from "./names";
import { buildPenaltySequence } from "./penaltyKicks";
import { clamp as clampf, distanceSquared as d2, lerp } from "./runtimeMath";
import type { ArenaHud, ArenaState } from "./runtimeTypes";
import type { LiveIntensity } from "./tactics";
import type { ArenaSim } from "./types";

const PK_AIM_T = 0.5;
const PK_STRIKE_T = 0.55;
const PK_REVEAL_T = 1.1;

// 1x plays a 90-minute match in roughly 4m 40s. The old value (3.4)
// compressed a match into about 26 seconds and made tactical observation moot.
const MIN_PER_SEC = 0.32;
interface Options {
  simRef: RefObject<ArenaSim>;
  canvasRef: RefObject<HTMLCanvasElement | null>;
  stateRef: RefObject<ArenaState | null>;
  completedRef: RefObject<boolean>;
  pausedRef: RefObject<boolean>;
  speedRef: RefObject<number>;
  liveIntensityRef: RefObject<LiveIntensity>;
  opponentIntensityRef: RefObject<LiveIntensity>;
  buildState: () => ArenaState;
  userTeamName: string;
  oppTeamName: string;
  userColor: string;
  startMinute: number;
  endMinute: number;
  onMinuteEnter: (minute: number) => void;
  onPeriodEnd: () => void;
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
  liveIntensityRef,
  opponentIntensityRef,
  buildState,
  userTeamName,
  oppTeamName,
  userColor,
  startMinute,
  endMinute,
  onMinuteEnter,
  onPeriodEnd,
  onComplete,
  setEnded,
  setPaused,
  setHud,
}: Options) {
  useEffect(() => {
    stateRef.current = buildState();
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
    const rng = mulbFromSeed(startMinute * 977 + endMinute * 131 + 97);

    const goalMouth = (side: 0 | 1) => (side === 0 ? { x: 99, y: 50 } : { x: 1, y: 50 });

    function triggerGoal(s: ArenaState, side: 0 | 1, scorer?: string, assist?: string) {
      s.phase = "celebrate";
      s.celebrateT = 1.9;
      s.goalSide = side;
      s.scoring = null;
      if (side === 0) s.score[0]++;
      else s.score[1]++;
      const gm = goalMouth(side);
      s.ball.owner = -1;
      s.ball.flightTo = -1;
      s.ball.flightTarget = null;
      s.ball.scripted = false;
      s.ball.x = gm.x;
      s.ball.y = gm.y;
      s.banner =
        side === 0 ? `${scorer ?? userTeamName}${assist ? ` (도움: ${assist})` : ""}` : oppTeamName;
    }

    function kickoff(s: ArenaState, toTeam: 0 | 1) {
      s.dots.forEach((d) => {
        d.x = d.hx;
        d.y = d.hy;
      });
      s.ball.x = 50;
      s.ball.y = 50;
      const kickoffOwner = s.dots.findIndex(
        (dot) => dot.team === toTeam && dot.role === "FWD",
      );
      const fallbackOwner = s.dots.findIndex((dot) => dot.team === toTeam);
      s.ball.owner = kickoffOwner >= 0 ? kickoffOwner : fallbackOwner;
      s.ball.flightTo = -1;
      s.ball.flightTarget = null;
      s.ball.scripted = false;
      s.ball.lastTeam = toTeam;
      s.banner = null;
      s.goalSide = null;
      s.scoring = null;
      s.phase = "play";
      s.actionT = 0.6;
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
      if (best >= 0 && Math.abs(s.ball.x - gm.x) > 25) {
        s.ball.x = s.dots[best].x;
        s.ball.y = s.dots[best].y;
      }
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

    const pkSpot = (team: 0 | 1) => {
      const gm = goalMouth(team);
      return { x: gm.x + (team === 0 ? -11 : 11), y: 50 };
    };

    const pkTarget = (team: 0 | 1, scored: boolean) => {
      const gm = goalMouth(team);
      return { x: gm.x, y: clampf(50 + (scored ? (team === 0 ? 7 : -7) : 0), 20, 80) };
    };

    function positionForKick(s: ArenaState) {
      const kick = s.pkSequence[s.pkIndex];
      if (!kick) return;
      const kickNumber = Math.floor(s.pkIndex / 2);
      const spot = pkSpot(kick.team);
      const kickerPool = s.dots.filter((d) => d.team === kick.team && d.role !== "GK");
      const keeperDot = s.dots.find((d) => d.team !== kick.team && d.role === "GK");
      const kicker = kickerPool.length ? kickerPool[kickNumber % kickerPool.length] : null;
      if (kicker) {
        kicker.x = spot.x;
        kicker.y = spot.y;
      }
      if (keeperDot) {
        const gm = goalMouth(kick.team);
        keeperDot.x = gm.x;
        keeperDot.y = gm.y;
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
      s.pkSequence = buildPenaltySequence(currentSim.penalties!, rng);
      s.pkIndex = 0;
      s.pkScore = [0, 0];
      s.pkStage = "aim";
      s.penT = PK_AIM_T;
      s.banner = null;
      s.periodBanner = "승부차기";
      s.periodBannerT = PK_AIM_T + PK_STRIKE_T;
      positionForKick(s);
    }

    function update(dt: number) {
      const s = stateRef.current!;
      if (s.phase === "ended" || s.phase === "interim") return;
      s.time += dt;

      if (s.periodBannerT > 0) {
        s.periodBannerT -= dt;
        if (s.periodBannerT <= 0) s.periodBanner = null;
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
          const spot = pkSpot(kick.team);
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
        if (s.celebrateT <= 0) kickoff(s, s.goalSide === 0 ? 1 : 0);
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

      s.clock += dt * MIN_PER_SEC;
      const reachedPeriodEnd = s.clock >= endMinute;
      if (reachedPeriodEnd) s.clock = endMinute;

      // Generate the upcoming match minute at the beginning of its visual
      // interval. This keeps the future unknown while leaving enough real time
      // to animate every action that the engine resolved for that minute.
      const upcomingMinute = Math.min(
        endMinute,
        Math.max(startMinute + 1, Math.floor(s.clock) + 1),
      );
      onMinuteEnter(upcomingMinute);
      if (reachedPeriodEnd) onPeriodEnd();

      // Consume only the action log that produced the score and statistics.
      // Multiple events in one minute are deliberately spread across that
      // minute instead of firing in consecutive animation frames.
      const currentSim = simRef.current;
      const ballBusy =
        s.ball.flightTo >= 0 || s.ball.flightTarget != null || s.scoring != null;
      if (
        !ballBusy &&
        currentSim.events?.length &&
        s.nextEvent < currentSim.events.length &&
        s.clock >= eventPlaybackClock(currentSim.events, s.nextEvent)
      ) {
        projectMatchEvent(s, currentSim.events[s.nextEvent], startScoring);
        s.nextEvent++;
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
            s.ball.owner = target.owner ?? -1;
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

      if (reachedPeriodEnd) {
        const finalSim = simRef.current;
        const pendingEvents = s.nextEvent < (finalSim.events?.length ?? 0);
        const actionStillVisible =
          s.scoring != null || s.ball.flightTo >= 0 || s.ball.flightTarget != null;
        if (!pendingEvents && !actionStillVisible) {
          s.score = [finalSim.userGoals, finalSim.oppGoals];
          if (finalSim.penalties) {
            startPenalties(s);
            return;
          }
          finishSegment(s);
          return;
        }
      }

      // ---- movement AI ----
      const ballTeam: 0 | 1 =
        s.ball.owner >= 0 ? s.dots[s.ball.owner].team : s.ball.flightTo >= 0 ? s.dots[s.ball.flightTo].team : s.ball.lastTeam;
      const fwdDir = (t: 0 | 1) => (t === 0 ? 1 : -1); // +x is attack for team 0
      const intensities = [
        liveIntensityRef.current,
        opponentIntensityRef.current,
      ] as const;
      const defendingTeam: 0 | 1 = ballTeam === 0 ? 1 : 0;
      const defendingIntensity = intensities[defendingTeam];
      const defendingFluidity = defendingIntensity.fluidDefense / 100;
      const defendingPress = defendingIntensity.attackPress / 100;
      // is the ball in the attacking team's own build-up third? (defending team can high-press)
      const deepLine = 34 + defendingPress * 18 + defendingFluidity * 8;
      const deep = ballTeam === 0 ? s.ball.x < deepLine : s.ball.x > 100 - deepLine;

      // defending team pressers: closest defender to ball, plus (if deep) their nearest forward
      let presser = -1,
        pmin = Infinity;
      let highPress = -1,
        hpMin = Infinity;
      s.dots.forEach((d, i) => {
        if (d.team === ballTeam) return;
        const dd = d2(d.x, d.y, s.ball.x, s.ball.y);
        const defensiveRead = 0.62 + d.defending / 170 + d.react * 0.12;
        const pressScore = dd / defensiveRead;
        if (pressScore < pmin) {
          pmin = pressScore;
          presser = i;
        }
        if (deep && d.role === "FWD" && pressScore < hpMin) {
          hpMin = pressScore;
          highPress = i;
        }
      });

      s.dots.forEach((d, i) => {
        let tx: number, ty: number, sp: number;
        const dir = fwdDir(d.team);
        const oppGoal = goalMouth(d.team);
        const ownIntensity = intensities[d.team];
        const ownFluidity = ownIntensity.fluidDefense / 100;
        const ownPress = ownIntensity.attackPress / 100;
        const abilitySpeed = 0.72 + d.pace / 245;
        const fatigue = clampf(1 - (s.clock / 120) * (0.21 - d.stamina / 720), 0.76, 1);

        if (s.scoring && i === s.scoring.shooter) {
          // Follow through after the shot without carrying the ball into goal.
          tx = d.x + dir * 4;
          ty = d.y;
          sp = 3.6;
        } else if (s.ball.flightTarget?.owner === i) {
          // The receiver attacks the fixed arrival point. The ball never bends
          // to chase a receiver who has already run somewhere else.
          tx = s.ball.flightTarget.x;
          ty = s.ball.flightTarget.y;
          sp = 3.4;
        } else if (i === s.ball.owner) {
          // dribble toward opponent goal, weaving
          tx = d.x + dir * 7 + Math.sin(s.time * 3 + d.ph) * 3;
          ty = d.y + (oppGoal.y - d.y) * 0.05 + Math.sin(s.time * 2 + d.ph) * 3;
          sp = 3.3;
        } else if (i === presser || i === highPress) {
          // press the ball directly (a lone striker can chase the keeper)
          tx = s.ball.x + dir * -2;
          ty = s.ball.y;
          sp = 3.4 + ownPress * 1.5;
        } else if (d.team === ballTeam) {
          // attacking team: role-differentiated support (not a uniform block)
          const ballPull = clampf((s.ball.y - d.hy) * 0.01, -0.5, 0.5);
          const attackPush = ownPress * 8;
          const defenseHold = -ownFluidity * 7;
          if (d.role === "FWD") {
            tx = d.hx + dir * (22 + attackPush + defenseHold);
            ty = d.hy + (s.ball.y - d.hy) * 0.45;
            sp = 2.7;
          } else if (d.role === "MID") {
            tx = d.hx + dir * (11 + attackPush * 0.8 + defenseHold * 0.5);
            ty = d.hy + (s.ball.y - d.hy) * 0.3;
            sp = 2.2;
          } else if (d.role === "DEF") {
            tx = d.hx + dir * (4 + attackPush * 0.35 + defenseHold);
            ty = d.hy + ballPull * (8 + ownFluidity * 12);
            sp = 1.7;
          } else {
            tx = d.hx + dir * 1;
            ty = d.hy + (s.ball.y - 50) * 0.06;
            sp = 1.3;
          }
        } else {
          // defending team: compact block, drop toward own goal, shift to ball side
          const compact = 1 + ownFluidity * 0.55;
          const pressStep = -ownPress * 5;
          const drop = (d.role === "MID" ? 8 : d.role === "DEF" ? 5 : d.role === "FWD" ? 3 : 0) * compact + pressStep;
          tx = d.hx - dir * drop;
          ty = d.hy + (s.ball.y - d.hy) * (0.28 + ownFluidity * 0.24);
          sp = d.role === "GK" ? 1.2 : 1.9 + ownPress * 0.9;
        }

        // The selected team width must be visible on the pitch, not just in
        // probability calculations. Narrow teams compress toward the centre;
        // wide teams stretch both attacking and defensive support positions.
        if (d.role !== "GK") {
          const widthScale = 0.62 + (ownIntensity.teamWidth / 100) * 0.76;
          ty = 50 + (ty - 50) * widthScale;
        }

        // per-player idle noise so nobody glides in lockstep
        tx += Math.sin(s.time * d.nz + d.ph) * 1.4;
        ty += Math.cos(s.time * d.nz * 1.2 + d.ph) * 1.4;

        d.x = lerp(d.x, clampf(tx, 2, 98), dt * sp * d.react * abilitySpeed * fatigue);
        d.y = lerp(d.y, clampf(ty, 3, 97), dt * sp * d.react * abilitySpeed * fatigue);
      });
    }


    const step = (now: number) => {
      const dt = Math.min(0.045, (now - last) / 1000);
      last = now;
      if (!pausedRef.current) {
        const playbackSpeed = speedRef.current;
        const steps = Math.max(1, Math.ceil(playbackSpeed));
        for (let k = 0; k < steps; k++) update((dt * playbackSpeed) / steps);
      }
      drawArenaFrame(canvas, ctx, stateRef.current!, userColor);
      hudAcc += dt;
      if (hudAcc > 0.08) {
        hudAcc = 0;
        const s = stateRef.current!;
        const periodBanner = s.periodBannerT > 0 ? s.periodBanner : null;
        setHud({
          minute: Math.floor(s.clock),
          home: s.score[0],
          away: s.score[1],
          banner: s.phase === "celebrate" || s.phase === "penalties" ? s.banner : null,
          periodBanner,
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
