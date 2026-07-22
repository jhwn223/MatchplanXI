import { FORMATIONS, slotsOf, type FormationKey, type FormationSlot } from "./formation";
import type { ConditionBreakdown } from "./conditionEngine";
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
