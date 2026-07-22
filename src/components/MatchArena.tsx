import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { slotsOf, type FormationKey, type SlotPositions } from "../data/formation";
import type { GoalEvent, PenaltyResult, SimComparison, TeamStats } from "../data/matchSim";
import type { Player, Position } from "../data/types";
import { topAssists, topScorers, type Leaderboard, type LeaderboardEntry } from "../data/leaderboard";

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
  formationLabel?: string;
  slots: Record<string, number | null>;
  positions?: SlotPositions;
  playersById: Map<number, Player>;
  leaderboard: Leaderboard;
  startMinute?: number;
  endMinute?: number;
  startScore?: [number, number];
  /** false = this segment ends at an interim break (halftime / pre-extra-time), not full time */
  final?: boolean;
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
  name: string;
  role: Position;
  react: number; // reaction-speed multiplier
  nz: number; // idle-noise frequency
  ph: number; // noise phase offset
}

type LiveIntensity = {
  fluidDefense: number;
  attackPress: number;
};

const DEFAULT_LIVE_INTENSITY: LiveIntensity = { fluidDefense: 35, attackPress: 30 };

type DefenseStyle = "dropBack" | "balanced" | "errorPress" | "lossPress" | "constantPress";
type BuildUpPlay = "shortPass" | "balanced" | "longPass" | "fastBuildUp";
type ChanceCreation = "possession" | "balanced" | "directPassing" | "forwardRuns";

interface TeamTactics {
  defenseStyle: DefenseStyle;
  width: number;
  depth: number;
  buildUpPlay: BuildUpPlay;
  chanceCreation: ChanceCreation;
  attackWidth: number;
  boxPlayers: number;
  corners: number;
  freeKicks: number;
}

type TacticSelectKey = "defenseStyle" | "buildUpPlay" | "chanceCreation";
type TacticMeterKey = "width" | "depth" | "attackWidth" | "boxPlayers" | "corners" | "freeKicks";

const DEFAULT_TEAM_TACTICS: TeamTactics = {
  defenseStyle: "balanced",
  width: 5,
  depth: 4,
  buildUpPlay: "balanced",
  chanceCreation: "balanced",
  attackWidth: 6,
  boxPlayers: 6,
  corners: 1,
  freeKicks: 3,
};

const TACTIC_SELECTS: Record<TacticSelectKey, { title: string; options: Array<{ value: string; label: string }> }> = {
  defenseStyle: {
    title: "수비 스타일",
    options: [
      { value: "dropBack", label: "후퇴" },
      { value: "balanced", label: "밸런스" },
      { value: "errorPress", label: "볼 터치 실수 시 압박" },
      { value: "lossPress", label: "공 뺏긴 직후 압박" },
      { value: "constantPress", label: "지속적인 압박" },
    ],
  },
  buildUpPlay: {
    title: "빌드업 플레이",
    options: [
      { value: "shortPass", label: "짧은 패스" },
      { value: "balanced", label: "밸런스" },
      { value: "longPass", label: "긴 패스" },
      { value: "fastBuildUp", label: "빠른 빌드업" },
    ],
  },
  chanceCreation: {
    title: "기회 만들기",
    options: [
      { value: "possession", label: "점유율" },
      { value: "balanced", label: "밸런스" },
      { value: "directPassing", label: "침투 패스" },
      { value: "forwardRuns", label: "전방 침투" },
    ],
  },
};

const KOREAN_CANVAS_FONT = `"Apple SD Gothic Neo", "Malgun Gothic", "Noto Sans KR", "Segoe UI", sans-serif`;

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
  formationLabel,
  slots,
  positions,
  playersById,
  leaderboard,
  startMinute = 0,
  endMinute = 90,
  startScore = [0, 0],
  final = true,
  interimLabel = "구간 종료",
  interimCta = "계속하기 →",
  onInterimContinue,
  onComplete,
  onClose,
  onNext,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef<ArenaState | null>(null);
  const pausedRef = useRef(false);
  const speedRef = useRef(1);
  const liveIntensityRef = useRef<LiveIntensity>(DEFAULT_LIVE_INTENSITY);
  const completedRef = useRef(false);

  const [paused, setPaused] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [teamTactics, setTeamTactics] = useState<TeamTactics>(DEFAULT_TEAM_TACTICS);
  const [openTacticSelect, setOpenTacticSelect] = useState<TacticSelectKey | null>(null);
  const [hud, setHud] = useState({
    minute: startMinute,
    home: startScore[0],
    away: startScore[1],
    banner: null as string | null,
    periodBanner: null as string | null,
  });
  const [ended, setEnded] = useState(false);

  function updateTeamTactics(next: TeamTactics) {
    liveIntensityRef.current = intensityFromTeamTactics(next);
    setTeamTactics(next);
  }

  function setTacticSelect<K extends TacticSelectKey>(key: K, value: TeamTactics[K]) {
    updateTeamTactics({ ...teamTactics, [key]: value });
    setOpenTacticSelect(null);
  }

  function nudgeMeter(key: TacticMeterKey, delta: number) {
    updateTeamTactics({ ...teamTactics, [key]: clampf(teamTactics[key] + delta, 1, 10) });
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
      dots.push({ x: h.x, y: h.y, hx: h.x, hy: h.y, team: 0, num, name: player?.player_name ?? s.label, role: s.position, react: 0.85 + rnd(i) * 0.4, nz: 0.6 + rnd(i + 5) * 1.6, ph: rnd(i + 9) * 6.28 });
    });
    slotsOf("4-3-3").forEach((s, i) => {
      const h = homeFor(s.x, s.y, 1);
      dots.push({ x: h.x, y: h.y, hx: h.x, hy: h.y, team: 1, num: i + 1, name: `${oppCode} ${i + 1}`, role: s.position, react: 0.85 + rnd(i + 20) * 0.4, nz: 0.6 + rnd(i + 25) * 1.6, ph: rnd(i + 29) * 6.28 });
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
    const s = stateRef.current;
    if (!s) return;
    applyUserFormationToState(s, pausedRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formation, slots, positions, playersById]);

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
        s.phase = "ended";
        s.score = [sim.userGoals, sim.oppGoals];
        if (!completedRef.current) {
          completedRef.current = true;
          onComplete();
          setEnded(true);
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
        const px = X(d.x);
        const py = Y(d.y);
        ctx.beginPath();
        ctx.arc(px, py, r, 0, Math.PI * 2);
        ctx.fillStyle = d.team === 0 ? userColor : "#e5484d";
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.strokeStyle = i === s.ball.owner ? "#fde047" : "rgba(0,0,0,0.35)";
        ctx.stroke();
        ctx.fillStyle = d.team === 0 ? "#06231f" : "#fff";
        ctx.font = `bold ${Math.max(8, W * 0.014)}px ${KOREAN_CANVAS_FONT}`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(String(d.num), px, py);

        if (d.team === 0) {
          const label = `${d.num} ${displayArenaName(d.name)}`;
          const labelFont = Math.max(12, Math.min(15, W * 0.015));
          const labelY = clampf(py - r - 9, labelFont + 3, H - 6);
          ctx.font = `800 ${labelFont}px ${KOREAN_CANVAS_FONT}`;
          ctx.lineWidth = 4;
          ctx.strokeStyle = "rgba(0, 0, 0, 0.85)";
          ctx.strokeText(label, px, labelY);
          ctx.fillStyle = "#fff";
          ctx.fillText(label, px, labelY);
        }
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
    setHud({ minute: startMinute, home: startScore[0], away: startScore[1], banner: null, periodBanner: null });
    setPaused(false);
    pausedRef.current = false;
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

        {!ended ? (
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
              <button type="button" className="sim-btn" onClick={onInterimContinue ?? onClose}>
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
        {!ended && (
          <div className="arena-team-tactics">
            <div className="arena-team-tactics__head">
              <strong>팀 전술</strong>
              <span>{userTeamName}</span>
            </div>
            <div className="arena-team-tactics__formation">{userCode} / {formationLabel ?? formation}</div>

            <TacticSelectRow
              label="수비 스타일"
              value={teamTactics.defenseStyle}
              selectKey="defenseStyle"
              openKey={openTacticSelect}
              onToggle={setOpenTacticSelect}
              onSelect={(value) => setTacticSelect("defenseStyle", value as DefenseStyle)}
            />
            <TacticMeter label="폭" value={teamTactics.width} onNudge={(delta) => nudgeMeter("width", delta)} />
            <TacticMeter label="깊이" value={teamTactics.depth} onNudge={(delta) => nudgeMeter("depth", delta)} />

            <div className="arena-team-tactics__section">공격</div>
            <TacticSelectRow
              label="빌드업 플레이"
              value={teamTactics.buildUpPlay}
              selectKey="buildUpPlay"
              openKey={openTacticSelect}
              onToggle={setOpenTacticSelect}
              onSelect={(value) => setTacticSelect("buildUpPlay", value as BuildUpPlay)}
            />
            <TacticSelectRow
              label="기회 만들기"
              value={teamTactics.chanceCreation}
              selectKey="chanceCreation"
              openKey={openTacticSelect}
              onToggle={setOpenTacticSelect}
              onSelect={(value) => setTacticSelect("chanceCreation", value as ChanceCreation)}
            />
            <TacticMeter label="폭" value={teamTactics.attackWidth} onNudge={(delta) => nudgeMeter("attackWidth", delta)} />
            <TacticMeter label="박스 안쪽 선수" value={teamTactics.boxPlayers} onNudge={(delta) => nudgeMeter("boxPlayers", delta)} />
            <TacticMeter label="코너킥" value={teamTactics.corners} onNudge={(delta) => nudgeMeter("corners", delta)} />
            <TacticMeter label="프리킥" value={teamTactics.freeKicks} onNudge={(delta) => nudgeMeter("freeKicks", delta)} />
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}

function TacticSelectRow({
  label,
  value,
  selectKey,
  openKey,
  onToggle,
  onSelect,
}: {
  label: string;
  value: string;
  selectKey: TacticSelectKey;
  openKey: TacticSelectKey | null;
  onToggle: (key: TacticSelectKey | null) => void;
  onSelect: (value: string) => void;
}) {
  const config = TACTIC_SELECTS[selectKey];
  const currentLabel = config.options.find((o) => o.value === value)?.label ?? "밸런스";
  const open = openKey === selectKey;
  return (
    <div className="tactic-row-wrap">
      <button type="button" className="tactic-row tactic-row--select" onClick={() => onToggle(open ? null : selectKey)}>
        <span>{label}</span>
        <strong>{currentLabel}</strong>
        <span className="tactic-row__chevron">▾</span>
      </button>
      {open && (
        <div className="tactic-menu">
          <div className="tactic-menu__title">
            {config.title}
            <button type="button" onClick={() => onToggle(null)}>×</button>
          </div>
          {config.options.map((option) => (
            <button
              key={option.value}
              type="button"
              className="tactic-menu__option"
              data-active={option.value === value || undefined}
              onClick={() => onSelect(option.value)}
            >
              <span>{option.label}</span>
              {option.value === value && <strong>✓</strong>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function TacticMeter({ label, value, onNudge }: { label: string; value: number; onNudge: (delta: number) => void }) {
  return (
    <div className="tactic-row tactic-row--meter">
      <span>{label}</span>
      <strong>{value}</strong>
      <button type="button" className="tactic-step" onClick={() => onNudge(-1)} aria-label={`${label} 낮추기`}>
        ◂
      </button>
      <div className="tactic-meter" aria-hidden="true">
        {Array.from({ length: 10 }).map((_, i) => (
          <span key={i} data-on={i < value || undefined} />
        ))}
      </div>
      <button type="button" className="tactic-step" onClick={() => onNudge(1)} aria-label={`${label} 높이기`}>
        ▸
      </button>
    </div>
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
  const total = Math.max(1, userVal + oppVal);
  const userPct = Math.round((userVal / total) * 100);
  return (
    <div className="stat-bar">
      <div className="stat-bar__nums">
        <span className="stat-bar__val">
          {Math.round(userVal)}%
          {userSub && <span className="stat-bar__sub"> · {userSub}</span>}
        </span>
        <span className="stat-bar__label">{label}</span>
        <span className="stat-bar__val stat-bar__val--opp">
          {Math.round(oppVal)}%
          {oppSub && <span className="stat-bar__sub"> · {oppSub}</span>}
        </span>
      </div>
      <div className="stat-bar__track">
        <div className="stat-bar__fill" style={{ width: `${userPct}%` }} />
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
  rows: LeaderboardEntry[];
  field: "goals" | "assists";
}) {
  return (
    <div className="leaderboard__col">
      <h5 className="leaderboard__col-title">{title}</h5>
      {rows.length === 0 ? (
        <p className="leaderboard__empty">아직 기록 없음</p>
      ) : (
        <ol className="leaderboard__list">
          {rows.map((row, i) => (
            <li key={`${row.name}-${i}`} className="leaderboard__row">
              <span className="leaderboard__rank">{i + 1}</span>
              <span className="leaderboard__name">{row.name}</span>
              <span className="leaderboard__count">{row[field]}</span>
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

function displayArenaName(name: string) {
  const koreanName = KOREAN_ARENA_NAMES[name];
  if (koreanName) return koreanName;
  const parts = name.trim().split(/\s+/);
  if (parts.length <= 2) return name;
  return `${parts[0]} ${parts[parts.length - 1]}`;
}

const KOREAN_ARENA_NAMES: Record<string, string> = {
  "Seunggyu Kim": "김승규",
  "Hanbeom Lee": "이한범",
  "Gihyuk Lee": "이기혁",
  "Minjae Kim": "김민재",
  "Taehyeon Kim": "김태현",
  "Inbeom Hwang": "황인범",
  "Heung Min Son": "손흥민",
  "Seungho Paik": "백승호",
  "Guesung Cho": "조규성",
  "Jae Sung Lee": "이재성",
  "Hee Chan Hwang": "황희찬",
  "Bumkeun Song": "송범근",
  "Taeseok Lee": "이태석",
  "Wije Cho": "조유제",
  "Moonhwan Kim": "김문환",
  "Jinseob Park": "박진섭",
  "Junho Bae": "배준호",
  "Hyeongyu Oh": "오현규",
  "Kangin Lee": "이강인",
  "Hyunjun Yang": "양현준",
  "Hyeonwoo Jo": "조현우",
  "Youngwoo Seol": "설영우",
  "Jens Castrop": "옌스 카스트로프",
  "Jingyu Kim": "김진규",
  "Jisung Eom": "엄지성",
  "Donggyeong Lee": "이동경",
};

function intensityFromTeamTactics(tactics: TeamTactics): LiveIntensity {
  const stylePress: Record<DefenseStyle, number> = {
    dropBack: 10,
    balanced: 30,
    errorPress: 48,
    lossPress: 64,
    constantPress: 84,
  };
  const buildPress: Record<BuildUpPlay, number> = {
    shortPass: -4,
    balanced: 0,
    longPass: 4,
    fastBuildUp: 12,
  };
  const chancePress: Record<ChanceCreation, number> = {
    possession: -4,
    balanced: 0,
    directPassing: 7,
    forwardRuns: 12,
  };
  return {
    fluidDefense: clampf(82 - tactics.depth * 6 + tactics.width * 2, 0, 100),
    attackPress: clampf(
      stylePress[tactics.defenseStyle] + tactics.depth * 2 + buildPress[tactics.buildUpPlay] + chancePress[tactics.chanceCreation],
      0,
      100
    ),
  };
}
