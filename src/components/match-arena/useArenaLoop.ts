import { useEffect, type Dispatch, type RefObject, type SetStateAction } from "react";
import { findEventDot, projectMatchEvent } from "./arenaEventProjector";
import { drawArenaFrame } from "./arenaRenderer";
import { clamp as clampf, distanceSquared as d2, lerp } from "./runtimeMath";
import type { ArenaHud, ArenaState } from "./runtimeTypes";
import type { LiveIntensity } from "./tactics";
import type { ArenaSim } from "./types";

const MIN_PER_SEC = 3.4;
interface Options {
  sim: ArenaSim;
  canvasRef: RefObject<HTMLCanvasElement | null>;
  stateRef: RefObject<ArenaState | null>;
  completedRef: RefObject<boolean>;
  pausedRef: RefObject<boolean>;
  speedRef: RefObject<number>;
  liveIntensityRef: RefObject<LiveIntensity>;
  buildState: () => ArenaState;
  userTeamName: string;
  oppTeamName: string;
  userColor: string;
  endMinute: number;
  onComplete: () => void;
  setEnded: Dispatch<SetStateAction<boolean>>;
  setPaused: Dispatch<SetStateAction<boolean>>;
  setHud: Dispatch<SetStateAction<ArenaHud>>;
}

export function useArenaLoop({
  sim,
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
  endMinute,
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
    const rng = mulbFromSeed(sim.goals.length * 7 + sim.userGoals * 131 + 97);

    const goalMouth = (side: 0 | 1) => (side === 0 ? { x: 99, y: 50 } : { x: 1, y: 50 });

    function doAction(s: ArenaState) {
      const ownerTeam = s.dots[s.ball.owner].team;
      const attackingRight = ownerTeam === 0;
      const gm = goalMouth(ownerTeam);
      const owner = s.dots[s.ball.owner];
      const fatigue = clampf(1 - (s.clock / 120) * (0.2 - owner.stamina / 700), 0.76, 1);
      const nearGoal = Math.abs(owner.x - gm.x) < 30;
      const defendingKeeper = s.dots.find((dot) => dot.team !== ownerTeam && dot.role === "GK");
      const shotChance = clampf(0.16 + owner.shooting / 260 - (defendingKeeper?.goalkeeping ?? 65) / 520, 0.12, 0.46);
      if (nearGoal && rng() < shotChance) {
        // shot saved -> goal kick to defending keeper
        s.ball.owner = -1;
        s.ball.flightTo = -1;
        s.ball.scripted = false;
        s.ball.x = gm.x;
        s.ball.y = gm.y;
        s.pendingKick = ownerTeam === 0 ? 11 : 0;
        s.actionT = 0.5;
        return;
      }
      const mates: number[] = [];
      s.dots.forEach((d, i) => {
        if (d.team === ownerTeam && i !== s.ball.owner) mates.push(i);
      });
      mates.sort((a, b) => {
        const fa = attackingRight ? s.dots[a].x : -s.dots[a].x;
        const fb = attackingRight ? s.dots[b].x : -s.dots[b].x;
        const qualityA = fa + s.dots[a].pace * 0.12 + s.dots[a].dribbling * 0.08;
        const qualityB = fb + s.dots[b].pace * 0.12 + s.dots[b].dribbling * 0.08;
        return qualityB - qualityA;
      });
      let pick = mates[Math.floor(rng() * Math.min(4, mates.length))];
      let nearestDefender = -1;
      let nearestDistance = Infinity;
      s.dots.forEach((dot, index) => {
        if (dot.team === ownerTeam) return;
        const distance = d2(dot.x, dot.y, owner.x, owner.y);
        if (distance < nearestDistance) {
          nearestDistance = distance;
          nearestDefender = index;
        }
      });
      const pressure = nearestDefender >= 0 ? s.dots[nearestDefender].defending : 65;
      const passSuccess = clampf(0.62 + (owner.passing * fatigue - pressure) / 115, 0.42, 0.94);
      if (nearestDefender >= 0 && rng() > passSuccess) pick = nearestDefender;
      s.ball.owner = -1;
      s.ball.flightTo = pick;
      s.ball.scripted = false;
      s.actionT = 0.35 + rng() * 0.45;
    }

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
      s.ball.owner = toTeam === 0 ? 8 : 19;
      s.ball.flightTo = -1;
      s.ball.scripted = false;
      s.ball.lastTeam = toTeam;
      s.banner = null;
      s.goalSide = null;
      s.scoring = null;
      s.phase = "play";
      s.actionT = 0.6;
    }

    // begin a scripted attack toward goal; GOAL only fires once the ball arrives
    function startScoring(s: ArenaState, side: 0 | 1, scorer?: string, assist?: string) {
      if (s.scoring) return;
      s.scoring = { side, scorer, assist, t: 0 };
      const gm = goalMouth(side);
      let best = findEventDot(s, side, scorer);
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
      if (best >= 0) s.ball.owner = best;
      s.ball.flightTo = -1;
      s.ball.scripted = false;
    }


    function finishSegment(s: ArenaState) {
      s.phase = "ended";
      s.score = [sim.userGoals, sim.oppGoals];
      if (!completedRef.current) {
        completedRef.current = true;
        onComplete();
        setEnded(true);
      }
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
        s.penT -= dt;
        if (s.penT <= 0) finishSegment(s);
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
      if (s.clock >= endMinute) {
        s.clock = endMinute;
        s.score = [sim.userGoals, sim.oppGoals];
        if (sim.penalties) {
          s.phase = "penalties";
          s.penT = 3.6;
          s.periodBanner = "승부차기";
          s.periodBannerT = 3.6;
          return;
        }
        finishSegment(s);
        return;
      }

      // Consume the same player-by-player action log that produced the score.
      if (!s.scoring && sim.events?.length && s.nextEvent < sim.events.length && s.clock >= sim.events[s.nextEvent].minute) {
        projectMatchEvent(s, sim.events[s.nextEvent], startScoring);
        s.nextEvent++;
        s.actionT = Math.max(s.actionT, 0.1);
      } else if (!sim.events?.length && !s.scoring && s.nextGoal < sim.goals.length && s.clock >= sim.goals[s.nextGoal].minute) {
        const g = sim.goals[s.nextGoal];
        s.nextGoal++;
        startScoring(s, g.side === "user" ? 0 : 1, g.scorer, g.assist);
      }

      if (s.pendingKick != null) {
        s.ball.owner = s.pendingKick;
        s.pendingKick = null;
      }

      if (s.scoring) {
        // rush the ball to the goal; only celebrate once it actually arrives
        s.scoring.t += dt;
        const gm = goalMouth(s.scoring.side);
        const owner = s.ball.owner >= 0 ? s.dots[s.ball.owner] : null;
        if (owner) {
          s.ball.x = lerp(s.ball.x, owner.x, dt * 12);
          s.ball.y = lerp(s.ball.y, owner.y, dt * 12);
        }
        const arrived = owner ? Math.abs(owner.x - gm.x) < 9 : Math.abs(s.ball.x - gm.x) < 9;
        if (arrived || s.scoring.t > 2.6) {
          triggerGoal(s, s.scoring.side, s.scoring.scorer, s.scoring.assist);
          return;
        }
      } else {
        s.actionT -= dt;
        if (s.actionT <= 0 && s.ball.owner >= 0) doAction(s);

        // ball movement / interception
        if (s.ball.flightTo >= 0) {
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

      // ---- movement AI ----
      const ballTeam: 0 | 1 =
        s.ball.owner >= 0 ? s.dots[s.ball.owner].team : s.ball.flightTo >= 0 ? s.dots[s.ball.flightTo].team : s.ball.lastTeam;
      const fwdDir = (t: 0 | 1) => (t === 0 ? 1 : -1); // +x is attack for team 0
      const intensity = liveIntensityRef.current;
      const fluidDefense = intensity.fluidDefense / 100;
      const attackPress = intensity.attackPress / 100;
      // is the ball in the attacking team's own build-up third? (defending team can high-press)
      const deepLine = 34 + attackPress * 18 + fluidDefense * 8;
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
        const abilitySpeed = 0.72 + d.pace / 245;
        const fatigue = clampf(1 - (s.clock / 120) * (0.21 - d.stamina / 720), 0.76, 1);

        if (s.scoring && i === s.ball.owner) {
          // scoring run: sprint straight at the goal
          tx = oppGoal.x;
          ty = oppGoal.y + Math.sin(s.time * 4 + d.ph) * 4;
          sp = 5.5;
        } else if (i === s.ball.owner) {
          // dribble toward opponent goal, weaving
          tx = d.x + dir * 7 + Math.sin(s.time * 3 + d.ph) * 3;
          ty = d.y + (oppGoal.y - d.y) * 0.05 + Math.sin(s.time * 2 + d.ph) * 3;
          sp = 3.3;
        } else if (i === presser || i === highPress) {
          // press the ball directly (a lone striker can chase the keeper)
          tx = s.ball.x + dir * -2;
          ty = s.ball.y;
          sp = 3.4 + attackPress * 1.5;
        } else if (d.team === ballTeam) {
          // attacking team: role-differentiated support (not a uniform block)
          const ballPull = clampf((s.ball.y - d.hy) * 0.01, -0.5, 0.5);
          const attackPush = d.team === 0 ? attackPress * 8 : 0;
          const defenseHold = d.team === 0 ? -fluidDefense * 7 : 0;
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
            ty = d.hy + ballPull * (8 + fluidDefense * 12);
            sp = 1.7;
          } else {
            tx = d.hx + dir * 1;
            ty = d.hy + (s.ball.y - 50) * 0.06;
            sp = 1.3;
          }
        } else {
          // defending team: compact block, drop toward own goal, shift to ball side
          const compact = d.team === 0 ? 1 + fluidDefense * 0.55 : 1;
          const pressStep = d.team === 0 ? -attackPress * 5 : 0;
          const drop = (d.role === "MID" ? 8 : d.role === "DEF" ? 5 : d.role === "FWD" ? 3 : 0) * compact + pressStep;
          tx = d.hx - dir * drop;
          ty = d.hy + (s.ball.y - d.hy) * (0.28 + fluidDefense * 0.24);
          sp = d.role === "GK" ? 1.2 : 1.9 + attackPress * 0.9;
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
        const steps = speedRef.current >= 3 ? 6 : speedRef.current;
        for (let k = 0; k < steps; k++) update(dt);
      }
      drawArenaFrame(canvas, ctx, stateRef.current!, userColor);
      hudAcc += dt;
      if (hudAcc > 0.08) {
        hudAcc = 0;
        const s = stateRef.current!;
        const periodBanner =
          s.phase === "penalties"
            ? s.penT > 2.1
              ? "승부차기"
              : `PK ${sim.penalties?.userGoals} : ${sim.penalties?.oppGoals}`
            : s.periodBannerT > 0
              ? s.periodBanner
              : null;
        setHud({
          minute: Math.floor(s.clock),
          home: s.score[0],
          away: s.score[1],
          banner: s.phase === "celebrate" ? s.banner : null,
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
  }, [sim]);
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
