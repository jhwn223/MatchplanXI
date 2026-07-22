import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { slotsOf, type FormationKey } from "../data/formation";
import type { GoalEvent, PenaltyResult, SimComparison, TeamStats } from "../data/matchSim";
import type { Player, Position } from "../data/types";
import { topAssists, topScorers, type Leaderboard } from "../data/leaderboard";

/** Slimmed projection of a match result for one arena segment (a half, or extra time). */
export interface ArenaSim {
  goals: GoalEvent[];
  userGoals: number;
  oppGoals: number;
  comparison?: SimComparison;
  teamStats?: { user: TeamStats; opp: TeamStats };
  wentToExtraTime?: boolean;
  penalties?: PenaltyResult | null;
  regulationUserGoals?: number;
  regulationOppGoals?: number;
}

interface Props {
  sim: ArenaSim;
  userTeamName: string;
  userCode: string;
  oppTeamName: string;
  oppCode: string;
  userColor: string;
  formation: FormationKey;
  slots: Record<string, number | null>;
  playersById: Map<number, Player>;
  leaderboard: Leaderboard;
  startMinute?: number;
  endMinute?: number;
  startScore?: [number, number];
  /** false = this segment ends at an interim break (halftime / pre-extra-time), not full time */
  final?: boolean;
  /** copy shown on the interim break screen, when `final` is false */
  interimLabel?: string;
  interimCta?: string;
  onInterimContinue?: () => void;
  onComplete: () => void;
  onClose: () => void;
  onNext?: () => void;
}

interface Dot {
  x: number;
  y: number;
  hx: number; // home x
  hy: number;
  team: 0 | 1; // 0 = user, 1 = opp
  num: number;
  role: Position;
  react: number; // reaction-speed multiplier
  nz: number; // idle-noise frequency
  ph: number; // noise phase offset
}

interface ArenaState {
  clock: number;
  phase: "play" | "celebrate" | "penalties" | "interim" | "ended";
  celebrateT: number;
  actionT: number;
  score: [number, number];
  nextGoal: number;
  dots: Dot[];
  ball: { x: number; y: number; owner: number; flightTo: number; lastTeam: 0 | 1 };
  banner: string | null;
  goalSide: 0 | 1 | null;
  time: number;
  pendingKick?: number | null;
  scoring?: { side: 0 | 1; scorer?: string; assist?: string; t: number } | null;
  periodBanner: string | null;
  periodBannerT: number;
  announcedET1: boolean;
  announcedET2: boolean;
  penT: number;
}

const MIN_PER_SEC = 3.4; // 90' in ~26s at 1x

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * Math.min(1, t);
}
function d2(ax: number, ay: number, bx: number, by: number) {
  const dx = ax - bx,
    dy = ay - by;
  return dx * dx + dy * dy;
}
function clampf(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}

// map a formation slot to arena coords. side 0 (user) attacks right (+x), side 1 attacks left.
function homeFor(slotX: number, slotY: number, side: 0 | 1) {
  const ax = (100 - slotY) * 0.46 + 4;
  const ay = slotX * 0.86 + 7;
  if (side === 0) return { x: ax, y: ay };
  return { x: 100 - ax, y: 100 - ay };
}

export function MatchArena({
  sim,
  userTeamName,
  userCode,
  oppTeamName,
  oppCode,
  userColor,
  formation,
  slots,
  playersById,
  leaderboard,
  startMinute = 0,
  endMinute = 90,
  startScore = [0, 0],
  final = true,
  interimLabel = "전반전 종료",
  interimCta = "후반전 준비하기 →",
  onInterimContinue,
  onComplete,
  onClose,
  onNext,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef<ArenaState | null>(null);
  const pausedRef = useRef(false);
  const speedRef = useRef(1);
  const completedRef = useRef(false);

  const [paused, setPaused] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [hud, setHud] = useState({
    minute: startMinute,
    home: startScore[0],
    away: startScore[1],
    banner: null as string | null,
    periodBanner: null as string | null,
  });
  const [ended, setEnded] = useState(false);
  const [interim, setInterim] = useState(false);

  function buildState(): ArenaState {
    const dots: Dot[] = [];
    const rnd = (i: number) => ((Math.sin(i * 12.9898) * 43758.5453) % 1 + 1) % 1;
    const userSlots = slotsOf(formation);
    userSlots.forEach((s, i) => {
      const pid = slots[s.id];
      const num = pid != null ? ((playersById.get(pid)?.player_id ?? i) % 30) + 1 : i + 1;
      const h = homeFor(s.x, s.y, 0);
      dots.push({ x: h.x, y: h.y, hx: h.x, hy: h.y, team: 0, num, role: s.position, react: 0.85 + rnd(i) * 0.4, nz: 0.6 + rnd(i + 5) * 1.6, ph: rnd(i + 9) * 6.28 });
    });
    slotsOf("4-3-3").forEach((s, i) => {
      const h = homeFor(s.x, s.y, 1);
      dots.push({ x: h.x, y: h.y, hx: h.x, hy: h.y, team: 1, num: i + 1, role: s.position, react: 0.85 + rnd(i + 20) * 0.4, nz: 0.6 + rnd(i + 25) * 1.6, ph: rnd(i + 29) * 6.28 });
    });
    return {
      clock: startMinute,
      phase: "play",
      celebrateT: 0,
      actionT: 0.5,
      score: [...startScore],
      nextGoal: 0,
      dots,
      ball: { x: 50, y: 50, owner: 8, flightTo: -1, lastTeam: 0 },
      banner: null,
      goalSide: null,
      time: 0,
      periodBanner: null,
      periodBannerT: 0,
      announcedET1: false,
      announcedET2: false,
      penT: 0,
    };
  }

  useEffect(() => {
    stateRef.current = buildState();
    completedRef.current = false;
    setEnded(false);
    setInterim(false);
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
      const nearGoal = Math.abs(owner.x - gm.x) < 30;
      if (nearGoal && rng() < 0.4) {
        // shot saved -> goal kick to defending keeper
        s.ball.owner = -1;
        s.ball.flightTo = -1;
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
        return fb - fa;
      });
      const pick = mates[Math.floor(rng() * Math.min(4, mates.length))];
      s.ball.owner = -1;
      s.ball.flightTo = pick;
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
      let best = -1;
      let bmin = Infinity;
      s.dots.forEach((d, i) => {
        if (d.team !== side) return;
        const bias = d.role === "FWD" ? -300 : d.role === "MID" ? 0 : 300;
        const score = Math.abs(d.x - gm.x) + bias;
        if (score < bmin) {
          bmin = score;
          best = i;
        }
      });
      if (best >= 0) s.ball.owner = best;
      s.ball.flightTo = -1;
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
        if (!final) {
          s.phase = "interim";
          setInterim(true);
          return;
        }
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

      // a scheduled goal starts an attacking run (not an instant teleport-to-net)
      if (!s.scoring && s.nextGoal < sim.goals.length && s.clock >= sim.goals[s.nextGoal].minute) {
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
          if (stolen >= 0) {
            s.ball.owner = stolen;
            s.ball.flightTo = -1;
          } else if (d2(s.ball.x, s.ball.y, tgt.x, tgt.y) < 4) {
            s.ball.owner = s.ball.flightTo;
            s.ball.flightTo = -1;
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
      // is the ball in the attacking team's own build-up third? (defending team can high-press)
      const deep = ballTeam === 0 ? s.ball.x < 34 : s.ball.x > 66;

      // defending team pressers: closest defender to ball, plus (if deep) their nearest forward
      let presser = -1,
        pmin = Infinity;
      let highPress = -1,
        hpMin = Infinity;
      s.dots.forEach((d, i) => {
        if (d.team === ballTeam) return;
        const dd = d2(d.x, d.y, s.ball.x, s.ball.y);
        if (dd < pmin) {
          pmin = dd;
          presser = i;
        }
        if (deep && d.role === "FWD" && dd < hpMin) {
          hpMin = dd;
          highPress = i;
        }
      });

      s.dots.forEach((d, i) => {
        let tx: number, ty: number, sp: number;
        const dir = fwdDir(d.team);
        const oppGoal = goalMouth(d.team);

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
          sp = 3.6;
        } else if (d.team === ballTeam) {
          // attacking team: role-differentiated support (not a uniform block)
          const ballPull = clampf((s.ball.y - d.hy) * 0.01, -0.5, 0.5);
          if (d.role === "FWD") {
            tx = d.hx + dir * 22;
            ty = d.hy + (s.ball.y - d.hy) * 0.45;
            sp = 2.7;
          } else if (d.role === "MID") {
            tx = d.hx + dir * 11;
            ty = d.hy + (s.ball.y - d.hy) * 0.3;
            sp = 2.2;
          } else if (d.role === "DEF") {
            tx = d.hx + dir * 4;
            ty = d.hy + ballPull * 8;
            sp = 1.7;
          } else {
            tx = d.hx + dir * 1;
            ty = d.hy + (s.ball.y - 50) * 0.06;
            sp = 1.3;
          }
        } else {
          // defending team: compact block, drop toward own goal, shift to ball side
          const drop = d.role === "MID" ? 8 : d.role === "DEF" ? 5 : d.role === "FWD" ? 3 : 0;
          tx = d.hx - dir * drop;
          ty = d.hy + (s.ball.y - d.hy) * 0.28;
          sp = d.role === "GK" ? 1.2 : 2.0;
        }

        // per-player idle noise so nobody glides in lockstep
        tx += Math.sin(s.time * d.nz + d.ph) * 1.4;
        ty += Math.cos(s.time * d.nz * 1.2 + d.ph) * 1.4;

        d.x = lerp(d.x, clampf(tx, 2, 98), dt * sp * d.react);
        d.y = lerp(d.y, clampf(ty, 3, 97), dt * sp * d.react);
      });
    }

    function draw() {
      const s = stateRef.current!;
      const rect = canvas.getBoundingClientRect();
      const W = rect.width,
        H = rect.height;
      const X = (x: number) => (x / 100) * W;
      const Y = (y: number) => (y / 100) * H;

      ctx.fillStyle = "#123a1e";
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = "rgba(255,255,255,0.03)";
      for (let i = 0; i < 10; i += 2) ctx.fillRect((i / 10) * W, 0, W / 10, H);
      ctx.strokeStyle = "rgba(255,255,255,0.25)";
      ctx.lineWidth = 1.5;
      ctx.strokeRect(X(2), Y(4), X(96) - X(2), Y(96) - Y(4));
      ctx.beginPath();
      ctx.moveTo(X(50), Y(4));
      ctx.lineTo(X(50), Y(96));
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(X(50), Y(50), X(9), 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeRect(X(2), Y(30), X(12) - X(2), Y(70) - Y(30));
      ctx.strokeRect(X(88), Y(30), X(98) - X(88), Y(70) - Y(30));

      s.dots.forEach((d, i) => {
        const r = Math.max(7, W * 0.016);
        ctx.beginPath();
        ctx.arc(X(d.x), Y(d.y), r, 0, Math.PI * 2);
        ctx.fillStyle = d.team === 0 ? userColor : "#e5484d";
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.strokeStyle = i === s.ball.owner ? "#fde047" : "rgba(0,0,0,0.35)";
        ctx.stroke();
        ctx.fillStyle = d.team === 0 ? "#06231f" : "#fff";
        ctx.font = `bold ${Math.max(8, W * 0.014)}px sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(String(d.num), X(d.x), Y(d.y));
      });

      ctx.beginPath();
      ctx.arc(X(s.ball.x), Y(s.ball.y), Math.max(4, W * 0.008), 0, Math.PI * 2);
      ctx.fillStyle = "#fff";
      ctx.fill();
      ctx.strokeStyle = "#111";
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    const step = (now: number) => {
      const dt = Math.min(0.045, (now - last) / 1000);
      last = now;
      if (!pausedRef.current) {
        const steps = speedRef.current >= 3 ? 6 : speedRef.current;
        for (let k = 0; k < steps; k++) update(dt);
      }
      draw();
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

  function replay() {
    stateRef.current = buildState();
    completedRef.current = true;
    setEnded(false);
    setInterim(false);
    setHud({ minute: startMinute, home: startScore[0], away: startScore[1], banner: null, periodBanner: null });
  }

  const cmp = sim.comparison;
  const scorers = topScorers(leaderboard);
  const assisters = topAssists(leaderboard);

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
          <span className="arena-score__side" style={{ color: userColor }}>
            {userCode}
          </span>
          <span className="arena-score__nums">
            {hud.home} : {hud.away}
          </span>
          <span className="arena-score__side arena-score__side--opp">{oppCode}</span>
          <span className="arena-score__clock">{hud.minute}′</span>
          <button type="button" className="arena-close" onClick={onClose}>
            ✕
          </button>
        </div>

        <div className="arena-canvas-wrap">
          <canvas ref={canvasRef} className="arena-canvas" />
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

        {!ended && !interim ? (
          <div className="arena-controls">
            <button type="button" className="arena-ctrl" onClick={() => { pausedRef.current = !paused; setPaused(!paused); }}>
              {paused ? "▶ 재생" : "⏸ 일시정지"}
            </button>
            {[1, 2, 4].map((sp) => (
              <button
                key={sp}
                type="button"
                className="arena-ctrl"
                data-active={speed === sp || undefined}
                onClick={() => { speedRef.current = sp; setSpeed(sp); }}
              >
                {sp}배속
              </button>
            ))}
            <button
              type="button"
              className="arena-ctrl arena-ctrl--skip"
              onClick={() => { stateRef.current!.clock = endMinute; }}
            >
              결과로 건너뛰기 ⏭
            </button>
          </div>
        ) : !final ? (
          <motion.div className="sim-compare" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
            <div className="sim-compare__row">
              <div className="sim-compare__col">
                <span className="sim-compare__label">{interimLabel}</span>
                <span className="sim-compare__val">
                  {sim.userGoals} - {sim.oppGoals}
                </span>
              </div>
            </div>
            <p className="sim-compare__verdict">전술과 라인업을 조정할 수 있습니다.</p>
            <div className="sim-compare__actions">
              <button type="button" className="sim-btn" onClick={onInterimContinue}>
                {interimCta}
              </button>
            </div>
          </motion.div>
        ) : (
          <motion.div className="sim-compare" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
            {sim.wentToExtraTime && (
              <p className="sim-compare__et">
                90분 {sim.regulationUserGoals}-{sim.regulationOppGoals} → 연장 {sim.userGoals}-{sim.oppGoals}
                {sim.penalties &&
                  ` → 승부차기 ${sim.penalties.userGoals}-${sim.penalties.oppGoals} (${
                    sim.penalties.winner === "user" ? userTeamName : oppTeamName
                  } 승)`}
              </p>
            )}
            <div className="sim-compare__row">
              <div className="sim-compare__col">
                <span className="sim-compare__label">내 전술 결과</span>
                <span className="sim-compare__val">
                  {sim.userGoals} - {sim.oppGoals}
                </span>
              </div>
              {cmp?.hasActual && (
                <div className="sim-compare__col">
                  <span className="sim-compare__label">실제 결과</span>
                  <span className="sim-compare__val">
                    {cmp.actualUserGoals} - {cmp.actualOppGoals}
                  </span>
                </div>
              )}
            </div>
            {cmp && (
              <>
                <p className="sim-compare__verdict">{cmp.verdict}</p>
                <p className="sim-compare__tactics">🧩 {cmp.tacticsNote}</p>
              </>
            )}

            {sim.teamStats && (
              <div className="team-stats">
                <h4 className="team-stats__title">팀 스탯</h4>
                <TeamStatBar
                  label="패스 성공률"
                  userVal={sim.teamStats.user.passSuccessRate}
                  oppVal={sim.teamStats.opp.passSuccessRate}
                />
                <TeamStatBar
                  label="GK 선방률"
                  userVal={sim.teamStats.user.saveRate}
                  oppVal={sim.teamStats.opp.saveRate}
                  userSub={`${sim.teamStats.user.saves}/${sim.teamStats.user.shotsFaced} 선방`}
                  oppSub={`${sim.teamStats.opp.saves}/${sim.teamStats.opp.shotsFaced} 선방`}
                />
              </div>
            )}

            <div className="leaderboard">
              <h4 className="leaderboard__title">🏆 대회 누적 순위 — {userTeamName}</h4>
              <div className="leaderboard__cols">
                <LeaderboardCol title="⚽ 득점왕" rows={scorers} field="goals" />
                <LeaderboardCol title="🎯 어시스트왕" rows={assisters} field="assists" />
              </div>
            </div>

            <div className="sim-compare__actions">
              <button type="button" className="sim-btn sim-btn--ghost" onClick={replay}>
                다시 보기
              </button>
              <button type="button" className="sim-btn" onClick={onClose}>
                확인
              </button>
              {onNext && (
                <button type="button" className="sim-btn sim-btn--accent" onClick={onNext}>
                  다음 경기 →
                </button>
              )}
            </div>
          </motion.div>
        )}
      </motion.div>
    </motion.div>
  );
}

function TeamStatBar({
  label,
  userVal,
  oppVal,
  userSub,
  oppSub,
}: {
  label: string;
  userVal: number;
  oppVal: number;
  userSub?: string;
  oppSub?: string;
}) {
  const total = userVal + oppVal;
  const userShare = total > 0 ? (userVal / total) * 100 : 50;
  return (
    <div className="stat-bar">
      <div className="stat-bar__nums">
        <span className="stat-bar__val">
          {userVal}%{userSub ? <span className="stat-bar__sub"> · {userSub}</span> : null}
        </span>
        <span className="stat-bar__label">{label}</span>
        <span className="stat-bar__val stat-bar__val--opp">
          {oppSub ? <span className="stat-bar__sub">{oppSub} · </span> : null}
          {oppVal}%
        </span>
      </div>
      <div className="stat-bar__track">
        <div className="stat-bar__fill" style={{ width: `${userShare}%` }} />
      </div>
    </div>
  );
}

function LeaderboardCol({
  title,
  rows,
  field,
}: {
  title: string;
  rows: { name: string; goals: number; assists: number }[];
  field: "goals" | "assists";
}) {
  return (
    <div className="leaderboard__col">
      <h5 className="leaderboard__col-title">{title}</h5>
      {rows.length === 0 ? (
        <p className="leaderboard__empty">아직 기록 없음</p>
      ) : (
        <ol className="leaderboard__list">
          {rows.map((r, i) => (
            <li key={r.name} className="leaderboard__row">
              <span className="leaderboard__rank">{i + 1}</span>
              <span className="leaderboard__name">{r.name}</span>
              <span className="leaderboard__count">{r[field]}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

function mulbFromSeed(seed: number) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
