import { FORMATIONS, slotsOf, type FormationKey, type FormationSlot } from "./formation";
import type { ConditionBreakdown } from "./conditionEngine";
import type { TeamStats } from "./matchSim";
import type { Player, Position } from "./types";

export type Slots = Record<string, number | null>;

/** Coarse position tiers, back of the pitch to the front. */
const POSITION_TIER: Record<Position, number> = { GK: 0, DEF: 1, MID: 2, FWD: 3 };

/**
 * Whether a player of `playerPos` may be placed in a slot of `slotPos`.
 * GK is a wall (GK only in GK, GK can't go outfield); outfield players may
 * cover adjacent tiers only (DEF↔MID↔FWD), so FWD↔DEF is not allowed.
 */
export function canPlaceInSlot(playerPos: Position, slotPos: Position): boolean {
  if (playerPos === "GK" || slotPos === "GK") return playerPos === slotPos;
  return Math.abs(POSITION_TIER[playerPos] - POSITION_TIER[slotPos]) <= 1;
}

export function emptySlots(formation: FormationKey): Slots {
  const s: Slots = {};
  for (const slot of slotsOf(formation)) s[slot.id] = null;
  return s;
}

/** Fine-grained slot role, derived from the slot label + coarse position. */
export type SlotRole = "GK" | "CB" | "FB" | "DM" | "CM" | "AM" | "WM" | "ST" | "W";

export function slotRole(slot: FormationSlot): SlotRole {
  const l = slot.label;
  if (l === "GK") return "GK";
  if (l.startsWith("CB")) return "CB";
  if (l === "LB" || l === "RB") return "FB";
  if (l === "LWB" || l === "RWB") return slot.position === "DEF" ? "FB" : "WM";
  if (l === "LM" || l === "RM") return "WM";
  if (l.startsWith("DM")) return "DM";
  if (l.includes("AM")) return "AM";
  if (l === "LW" || l === "RW") return "W";
  if (l === "ST") return "ST";
  return "CM"; // LCM/RCM/CM
}

export function switchFormationKeepPlayers(
  oldFormation: FormationKey,
  oldSlots: Slots,
  newFormation: FormationKey
): Slots {
  const oldSlotDefs = slotsOf(oldFormation);
  const byPosition: Record<Position, number[]> = { GK: [], DEF: [], MID: [], FWD: [] };
  for (const def of oldSlotDefs) {
    const pid = oldSlots[def.id];
    if (pid != null) byPosition[def.position].push(pid);
  }
  const next = emptySlots(newFormation);
  const cursor: Record<Position, number> = { GK: 0, DEF: 0, MID: 0, FWD: 0 };
  for (const def of slotsOf(newFormation)) {
    const pool = byPosition[def.position];
    const idx = cursor[def.position];
    if (idx < pool.length) {
      next[def.id] = pool[idx];
      cursor[def.position] = idx + 1;
    }
  }
  return next;
}

// keep the old name as an alias for existing imports
export const remapFormation = switchFormationKeepPlayers;

// ---- role-aware auto fill ----

interface Norm {
  goals: number; // 0..1 within squad
  height: number;
  caps: number;
  condition: number;
  ability: number;
}

function normalizeSquad(
  squad: Player[],
  conditions: Map<number, ConditionBreakdown>
): Map<number, Norm> {
  const g = squad.map((p) => p.goals);
  const h = squad.map((p) => p.height_cm);
  const c = squad.map((p) => p.caps);
  const range = (arr: number[]) => {
    const mn = Math.min(...arr);
    const mx = Math.max(...arr);
    return (v: number) => (mx === mn ? 0.5 : (v - mn) / (mx - mn));
  };
  const ng = range(g), nh = range(h), nc = range(c);
  const m = new Map<number, Norm>();
  for (const p of squad) {
    m.set(p.player_id, {
      goals: ng(p.goals),
      height: nh(p.height_cm),
      caps: nc(p.caps),
      condition: (conditions.get(p.player_id)?.score ?? 0) / 100,
      ability: (p.ability?.overall ?? 65) / 100,
    });
  }
  return m;
}

/** How well a player fits a given fine role (0..1), from real attributes. */
function roleAffinity(role: SlotRole, n: Norm): number {
  switch (role) {
    case "GK":
      return 1;
    case "CB":
      return 0.6 * n.height + 0.4 * n.caps;
    case "FB":
      return 0.55 + 0.35 * (1 - n.height); // fullbacks: more mobile, not target-men
    case "DM":
      return 0.35 * n.height + 0.35 * (1 - n.goals) + 0.3 * n.caps;
    case "CM":
      return 0.5 + 0.2 * n.caps;
    case "AM":
      return 0.75 * n.goals + 0.25 * (1 - n.height);
    case "WM":
      return 0.55 + 0.25 * (1 - n.height);
    case "ST":
      return 0.8 * n.goals + 0.2 * n.height; // strikers: goalscorers, some tall targets
    case "W":
      return 0.5 + 0.35 * (1 - n.height) + 0.15 * n.goals; // wingers: quick/wide
  }
}

// role assignment priority within each coarse position (more specialised first)
const ROLE_PRIORITY: SlotRole[] = ["GK", "CB", "ST", "AM", "DM", "W", "WM", "FB", "CM"];

/** Fill an entire formation, matching players to slot ROLES (ST↔strikers, W↔wingers,
 *  CB↔tall defenders …), breaking ties by match condition. */
export function autoFillByRole(
  formation: FormationKey,
  squad: Player[],
  conditions: Map<number, ConditionBreakdown>
): Slots {
  const norms = normalizeSquad(squad, conditions);
  const byPosition: Record<Position, Player[]> = { GK: [], DEF: [], MID: [], FWD: [] };
  for (const p of squad) byPosition[p.position].push(p);

  const next = emptySlots(formation);
  const slots = slotsOf(formation).map((s) => ({ slot: s, role: slotRole(s) }));

  // process coarse positions independently so a striker is only ever considered for FWD slots
  const positions: Position[] = ["GK", "DEF", "MID", "FWD"];
  for (const pos of positions) {
    const posSlots = slots.filter((s) => s.slot.position === pos);
    const available = new Set(byPosition[pos].map((p) => p.player_id));
    const players = byPosition[pos];

    // order slots by role specialisation so ST grabs the best striker before W does
    posSlots.sort(
      (a, b) => ROLE_PRIORITY.indexOf(a.role) - ROLE_PRIORITY.indexOf(b.role)
    );

    for (const { slot, role } of posSlots) {
      let best: Player | null = null;
      let bestScore = -Infinity;
      for (const p of players) {
        if (!available.has(p.player_id)) continue;
        const n = norms.get(p.player_id)!;
        // a known fine-role dominates the heuristic: strong match bonus, mismatch penalty
        const pref = p.preferredRole ? (p.preferredRole === role ? 2 : -0.7) : 0;
        const score = roleAffinity(role, n) * 0.7 + n.condition * 0.55 + n.ability * 1.15 + pref;
        if (score > bestScore) {
          bestScore = score;
          best = p;
        }
      }
      if (best) {
        next[slot.id] = best.player_id;
        available.delete(best.player_id);
      }
    }
  }
  return next;
}

// keep old name as alias
export const autoFillBestXI = autoFillByRole;

export interface TacticalPreset {
  key: string;
  label: string;
  emoji: string;
  formation: FormationKey;
  description: string;
}

export const TACTICAL_PRESETS: TacticalPreset[] = [
  { key: "defensive", label: "수비적", emoji: "🛡", formation: "5-4-1", description: "고지대·피로 누적 시 실점 최소화" },
  { key: "balanced", label: "균형", emoji: "⚖", formation: "4-2-3-1", description: "안정적인 중원 장악" },
  { key: "attacking", label: "공격적", emoji: "⚔", formation: "4-3-3", description: "폭넓은 공격 전개" },
  { key: "allout", label: "초공격", emoji: "🔥", formation: "3-4-3", description: "총력전, 컨디션 소모 큼" },
];

export const FORMATION_META = FORMATIONS;

// ---- tactic style (playstyle) ----

export type TacticStyleKey =
  | "possession"
  | "counter"
  | "wing"
  | "halfspace"
  | "longball"
  | "gegenpress";

export interface TacticStyle {
  key: TacticStyleKey;
  label: string;
  emoji: string;
  description: string;
  /** small nudge blended into the formation/position-derived attack bias */
  attackBias: number;
  /** -1..1, how aggressively the team presses/recovers the ball high up the pitch */
  pressBias: number;
  /** -1..1, how much fullbacks/wingers overlap and cross */
  overlapBias: number;
  /** -1..1, negative = short possession passing, positive = direct/long passing */
  directnessBias: number;
  /** -1..1, net tendency to create counters (positive) vs concede them (negative pressure) */
  counterBias: number;
}

export const TACTIC_STYLES: TacticStyle[] = [
  {
    key: "possession",
    label: "점유(패스) 전술",
    emoji: "🎯",
    description: "짧은 패스, 높은 점유율, 천천히 전개",
    attackBias: -0.05,
    pressBias: -0.3,
    overlapBias: -0.2,
    directnessBias: -0.9,
    counterBias: -0.3,
  },
  {
    key: "counter",
    label: "역습 전술",
    emoji: "⚡",
    description: "공을 뺏으면 빠르게 전진",
    attackBias: -0.15,
    pressBias: -0.5,
    overlapBias: -0.1,
    directnessBias: 0.4,
    counterBias: 0.9,
  },
  {
    key: "wing",
    label: "측면(크로스) 전술",
    emoji: "↗",
    description: "풀백·윙 활용, 크로스 비중 높음",
    attackBias: 0.25,
    pressBias: 0.0,
    overlapBias: 0.9,
    directnessBias: 0.1,
    counterBias: 0.0,
  },
  {
    key: "halfspace",
    label: "중앙 침투 전술",
    emoji: "🎯",
    description: "원투패스, 스루패스, 하프스페이스 활용",
    attackBias: 0.35,
    pressBias: 0.1,
    overlapBias: 0.1,
    directnessBias: -0.4,
    counterBias: 0.1,
  },
  {
    key: "longball",
    label: "롱볼 전술",
    emoji: "🚀",
    description: "긴 패스로 최전방 공략",
    attackBias: 0.15,
    pressBias: -0.1,
    overlapBias: 0.0,
    directnessBias: 0.9,
    counterBias: 0.2,
  },
  {
    key: "gegenpress",
    label: "게겐프레싱",
    emoji: "🔥",
    description: "높은 압박 후 즉시 탈취",
    attackBias: 0.45,
    pressBias: 0.95,
    overlapBias: 0.3,
    directnessBias: 0.2,
    counterBias: -0.4,
  },
];

export function tacticStyleByKey(key: TacticStyleKey | null | undefined): TacticStyle {
  return TACTIC_STYLES.find((s) => s.key === key) ?? TACTIC_STYLES[0];
}

export interface TacticStat {
  label: string;
  /** 0..100, for stat-bar rendering */
  value: number;
}

/** bias is -1..1; convert to a 0..100 bar value. */
function biasToStat(bias: number): number {
  return Math.round(((bias + 1) / 2) * 100);
}

/**
 * Attack/defense stat breakdown for a tactic style, meant to replace raw
 * bias numbers with labeled bars a screen can render directly.
 */
export function tacticStatBreakdown(key: TacticStyleKey | null | undefined): {
  attack: TacticStat[];
  defense: TacticStat[];
} {
  const style = tacticStyleByKey(key);
  return {
    attack: [
      { label: "공격 전개", value: biasToStat(style.attackBias) },
      { label: "측면 오버래핑", value: biasToStat(style.overlapBias) },
      { label: "직선적 전개(롱볼 성향)", value: biasToStat(style.directnessBias) },
    ],
    defense: [
      { label: "전방 압박", value: biasToStat(style.pressBias) },
      { label: "역습 전환", value: biasToStat(style.counterBias) },
    ],
  };
}

/** Style-flavoured, stat-backed bullet points for the post-match "AI 전술 분석" panel. */
export function generateTacticAnalysis(key: TacticStyleKey | null | undefined, stats: TeamStats): string[] {
  const style = tacticStyleByKey(key);
  const shotAccuracy = stats.shots > 0 ? Math.round((stats.shotsOnTarget / stats.shots) * 100) : 0;

  switch (style.key) {
    case "possession":
      return [
        `점유율 ${stats.possession}%로 볼을 오래 소유했습니다.`,
        `짧은 패스 전개 덕분에 패스 성공률 ${stats.passSuccessRate}%를 기록했습니다.`,
        `슈팅 ${stats.shots}회 중 유효 슈팅은 ${stats.shotsOnTarget}회(${shotAccuracy}%)였습니다.`,
      ];
    case "counter":
      return [
        `인터셉트 ${stats.interceptions}회로 볼을 되찾은 뒤 빠르게 전환했습니다.`,
        `태클 성공 ${stats.tacklesWon}회로 상대 공격을 끊어냈습니다.`,
        `역습 과정에서 슈팅 ${stats.shots}회 중 ${stats.shotsOnTarget}회가 유효 슈팅으로 이어졌습니다.`,
      ];
    case "wing":
      return [
        `측면 위주 전개로 점유율 ${stats.possession}%를 기록했습니다.`,
        `슈팅 ${stats.shots}회 중 ${stats.shotsOnTarget}회(${shotAccuracy}%)가 유효 슈팅이었습니다.`,
        `패스 성공률 ${stats.passSuccessRate}%로 측면 연계가 원활했습니다.`,
      ];
    case "halfspace":
      return [
        `하프스페이스 침투로 패스 성공률 ${stats.passSuccessRate}%를 기록했습니다.`,
        `중앙 집중 전개로 슈팅 ${stats.shots}회, 유효 슈팅 ${stats.shotsOnTarget}회를 만들었습니다.`,
        `점유율 ${stats.possession}%로 안정적인 경기 운영을 보였습니다.`,
      ];
    case "longball":
      return [
        `롱볼 위주 전술로 패스 성공률은 ${stats.passSuccessRate}%에 머물렀습니다.`,
        `최전방을 직접 공략해 슈팅 ${stats.shots}회를 시도했습니다.`,
        `점유율은 ${stats.possession}%로 낮았지만 직선적인 공격을 노렸습니다.`,
      ];
    case "gegenpress":
      return [
        `높은 압박으로 인터셉트 ${stats.interceptions}회, 태클 성공 ${stats.tacklesWon}회를 기록했습니다.`,
        `탈취 직후 빠른 전환으로 슈팅 ${stats.shots}회를 만들어냈습니다.`,
        `점유율 ${stats.possession}%로 경기를 주도했습니다.`,
      ];
  }
}

/** Which tactic styles suit each formation best, most-recommended first. */
export const FORMATION_RECOMMENDED_STYLES: Record<FormationKey, TacticStyleKey[]> = {
  "5-4-1": ["counter", "possession"],
  "5-3-2": ["counter", "longball"],
  "4-5-1": ["possession", "counter"],
  "4-4-2": ["wing", "longball"],
  "4-2-3-1": ["halfspace", "possession"],
  "3-5-2": ["wing", "possession"],
  "4-3-3": ["wing", "gegenpress"],
  "3-4-3": ["gegenpress", "halfspace"],
};

export function recommendedStylesFor(formation: FormationKey): TacticStyleKey[] {
  return FORMATION_RECOMMENDED_STYLES[formation] ?? [];
}
