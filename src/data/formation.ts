import type { Position } from "./types";

export interface FormationSlot {
  id: string;
  label: string;
  position: Position;
  /** percentage coordinates on the pitch, x/y in [0,100]; attacking toward the top */
  x: number;
  y: number;
}

export interface PitchCoordinate {
  x: number;
  y: number;
}

export type SlotPositions = Record<string, PitchCoordinate>;

export type FormationKey =
  | "5-4-1"
  | "5-3-2"
  | "4-5-1"
  | "4-4-2"
  | "4-2-3-1"
  | "4-1-2-3"
  | "3-5-2"
  | "3-4-1-2"
  | "4-3-3"
  | "3-4-3"
  | "5-2-3";

export interface FormationMeta {
  slots: FormationSlot[];
  /** -1 = very defensive, +1 = very attacking; feeds the match sim */
  attackBias: number;
  pros: string[];
  cons: string[];
}

export const FORMATIONS: Record<FormationKey, FormationMeta> = {
  "5-4-1": {
    attackBias: -0.9,
    pros: ["최다 수비수로 실점 억제", "역습 시 측면 윙백 활용"],
    cons: ["공격 인원 부족", "최전방 고립되기 쉬움"],
    slots: [
      { id: "gk", label: "GK", position: "GK", x: 50, y: 92 },
      { id: "lb", label: "LB", position: "DEF", x: 10, y: 72 },
      { id: "cb1", label: "CB", position: "DEF", x: 30, y: 79 },
      { id: "cb2", label: "CB", position: "DEF", x: 50, y: 81 },
      { id: "cb3", label: "CB", position: "DEF", x: 70, y: 79 },
      { id: "rb", label: "RB", position: "DEF", x: 90, y: 72 },
      { id: "lm", label: "LM", position: "MID", x: 15, y: 48 },
      { id: "cm1", label: "CM", position: "MID", x: 40, y: 52 },
      { id: "cm2", label: "CM", position: "MID", x: 60, y: 52 },
      { id: "rm", label: "RM", position: "MID", x: 85, y: 48 },
      { id: "st", label: "ST", position: "FWD", x: 50, y: 16 },
    ],
  },
  "5-3-2": {
    attackBias: -0.6,
    pros: ["안정적인 3백 + 윙백", "투톱으로 역습 마무리 유리"],
    cons: ["중원 숫자 열세", "윙백 체력 부담 큼"],
    slots: [
      { id: "gk", label: "GK", position: "GK", x: 50, y: 92 },
      { id: "lb", label: "LWB", position: "DEF", x: 10, y: 70 },
      { id: "cb1", label: "CB", position: "DEF", x: 30, y: 79 },
      { id: "cb2", label: "CB", position: "DEF", x: 50, y: 81 },
      { id: "cb3", label: "CB", position: "DEF", x: 70, y: 79 },
      { id: "rb", label: "RWB", position: "DEF", x: 90, y: 70 },
      { id: "cm1", label: "CM", position: "MID", x: 30, y: 52 },
      { id: "cm2", label: "CM", position: "MID", x: 50, y: 56 },
      { id: "cm3", label: "CM", position: "MID", x: 70, y: 52 },
      { id: "st1", label: "ST", position: "FWD", x: 40, y: 18 },
      { id: "st2", label: "ST", position: "FWD", x: 60, y: 18 },
    ],
  },
  "4-5-1": {
    attackBias: -0.4,
    pros: ["중원 숫자 우위로 점유 안정", "측면 미드필더의 폭넓은 수비 커버"],
    cons: ["최전방 1명, 고립되기 쉬움", "역습 마무리 인원 부족"],
    slots: [
      { id: "gk", label: "GK", position: "GK", x: 50, y: 92 },
      { id: "lb", label: "LB", position: "DEF", x: 14, y: 72 },
      { id: "cb1", label: "CB", position: "DEF", x: 37, y: 78 },
      { id: "cb2", label: "CB", position: "DEF", x: 63, y: 78 },
      { id: "rb", label: "RB", position: "DEF", x: 86, y: 72 },
      { id: "lm", label: "LM", position: "MID", x: 12, y: 46 },
      { id: "cm1", label: "CM", position: "MID", x: 34, y: 54 },
      { id: "cm2", label: "CM", position: "MID", x: 50, y: 50 },
      { id: "cm3", label: "CM", position: "MID", x: 66, y: 54 },
      { id: "rm", label: "RM", position: "MID", x: 88, y: 46 },
      { id: "st", label: "ST", position: "FWD", x: 50, y: 16 },
    ],
  },
  "4-4-2": {
    attackBias: 0.0,
    pros: ["공수 균형이 좋은 표준형", "투톱 조합으로 득점 루트 다양"],
    cons: ["중앙 미드필더 2명, 허리가 얇을 수 있음", "측면이 뚫리면 백업이 느림"],
    slots: [
      { id: "gk", label: "GK", position: "GK", x: 50, y: 92 },
      { id: "lb", label: "LB", position: "DEF", x: 12, y: 70 },
      { id: "cb1", label: "CB", position: "DEF", x: 37, y: 76 },
      { id: "cb2", label: "CB", position: "DEF", x: 63, y: 76 },
      { id: "rb", label: "RB", position: "DEF", x: 88, y: 70 },
      { id: "lm", label: "LM", position: "MID", x: 15, y: 46 },
      { id: "cm1", label: "CM", position: "MID", x: 40, y: 50 },
      { id: "cm2", label: "CM", position: "MID", x: 60, y: 50 },
      { id: "rm", label: "RM", position: "MID", x: 85, y: 46 },
      { id: "st1", label: "ST", position: "FWD", x: 38, y: 16 },
      { id: "st2", label: "ST", position: "FWD", x: 62, y: 16 },
    ],
  },
  "4-2-3-1": {
    attackBias: 0.1,
    pros: ["더블 볼란치로 중원 장악", "3명의 공격형 미드필더로 창의성 확보"],
    cons: ["최전방 고립 위험", "윙어가 수비 가담 안 하면 측면 노출"],
    slots: [
      { id: "gk", label: "GK", position: "GK", x: 50, y: 92 },
      { id: "lb", label: "LB", position: "DEF", x: 14, y: 72 },
      { id: "cb1", label: "CB", position: "DEF", x: 37, y: 78 },
      { id: "cb2", label: "CB", position: "DEF", x: 63, y: 78 },
      { id: "rb", label: "RB", position: "DEF", x: 86, y: 72 },
      { id: "dm1", label: "DM", position: "MID", x: 36, y: 58 },
      { id: "dm2", label: "DM", position: "MID", x: 64, y: 58 },
      { id: "lam", label: "LAM", position: "MID", x: 20, y: 34 },
      { id: "cam", label: "CAM", position: "MID", x: 50, y: 36 },
      { id: "ram", label: "RAM", position: "MID", x: 80, y: 34 },
      { id: "st", label: "ST", position: "FWD", x: 50, y: 14 },
    ],
  },
  "4-1-2-3": {
    attackBias: 0.45,
    pros: ["수비형 미드필더를 통한 안정적인 빌드업", "양쪽 윙어를 활용한 넓은 공격 전개"],
    cons: ["수비형 미드필더 주변에 부담이 집중됨", "윙어의 수비 가담이 부족하면 측면 노출"],
    slots: [
      { id: "gk", label: "GK", position: "GK", x: 50, y: 92 },
      { id: "lb", label: "LB", position: "DEF", x: 15, y: 72 },
      { id: "cb1", label: "CB", position: "DEF", x: 37, y: 78 },
      { id: "cb2", label: "CB", position: "DEF", x: 63, y: 78 },
      { id: "rb", label: "RB", position: "DEF", x: 85, y: 72 },
      { id: "dm", label: "DM", position: "MID", x: 50, y: 60 },
      { id: "lcm", label: "LCM", position: "MID", x: 34, y: 44 },
      { id: "rcm", label: "RCM", position: "MID", x: 66, y: 44 },
      { id: "lw", label: "LW", position: "FWD", x: 18, y: 22 },
      { id: "st", label: "ST", position: "FWD", x: 50, y: 14 },
      { id: "rw", label: "RW", position: "FWD", x: 82, y: 22 },
    ],
  },
  "3-5-2": {
    attackBias: 0.2,
    pros: ["중원 5명으로 점유율 우위", "윙백 오버래핑으로 폭 넓은 공격"],
    cons: ["윙백 뒷공간 역습에 취약", "3백이 스피드 있는 공격수에 약함"],
    slots: [
      { id: "gk", label: "GK", position: "GK", x: 50, y: 92 },
      { id: "cb1", label: "CB", position: "DEF", x: 30, y: 78 },
      { id: "cb2", label: "CB", position: "DEF", x: 50, y: 80 },
      { id: "cb3", label: "CB", position: "DEF", x: 70, y: 78 },
      { id: "lwb", label: "LWB", position: "MID", x: 11, y: 54 },
      { id: "cm1", label: "CM", position: "MID", x: 35, y: 54 },
      { id: "cm2", label: "CM", position: "MID", x: 50, y: 58 },
      { id: "cm3", label: "CM", position: "MID", x: 65, y: 54 },
      { id: "rwb", label: "RWB", position: "MID", x: 89, y: 54 },
      { id: "st1", label: "ST", position: "FWD", x: 40, y: 18 },
      { id: "st2", label: "ST", position: "FWD", x: 60, y: 18 },
    ],
  },
  "3-4-1-2": {
    attackBias: 0.3,
    pros: ["투톱과 공격형 미드필더의 중앙 연계", "윙백을 통한 폭과 중원 숫자 확보"],
    cons: ["윙백 뒤 공간이 역습에 노출될 수 있음", "공격형 미드필더가 고립되면 전개가 단조로움"],
    slots: [
      { id: "gk", label: "GK", position: "GK", x: 50, y: 92 },
      { id: "cb1", label: "CB", position: "DEF", x: 30, y: 78 },
      { id: "cb2", label: "CB", position: "DEF", x: 50, y: 80 },
      { id: "cb3", label: "CB", position: "DEF", x: 70, y: 78 },
      { id: "lwb", label: "LWB", position: "MID", x: 12, y: 54 },
      { id: "cm1", label: "CM", position: "MID", x: 38, y: 56 },
      { id: "cm2", label: "CM", position: "MID", x: 62, y: 56 },
      { id: "rwb", label: "RWB", position: "MID", x: 88, y: 54 },
      { id: "cam", label: "CAM", position: "MID", x: 50, y: 36 },
      { id: "st1", label: "ST", position: "FWD", x: 39, y: 17 },
      { id: "st2", label: "ST", position: "FWD", x: 61, y: 17 },
    ],
  },
  "4-3-3": {
    attackBias: 0.5,
    pros: ["양 윙어로 폭넓은 공격 전개", "전방 압박에 유리한 인원 배치"],
    cons: ["미드필더 3명, 수적 열세 가능", "풀백 오버래핑 시 뒷공간 노출"],
    slots: [
      { id: "gk", label: "GK", position: "GK", x: 50, y: 92 },
      { id: "lb", label: "LB", position: "DEF", x: 15, y: 72 },
      { id: "cb1", label: "CB", position: "DEF", x: 37, y: 78 },
      { id: "cb2", label: "CB", position: "DEF", x: 63, y: 78 },
      { id: "rb", label: "RB", position: "DEF", x: 85, y: 72 },
      { id: "lcm", label: "LCM", position: "MID", x: 25, y: 50 },
      { id: "cm", label: "CM", position: "MID", x: 50, y: 54 },
      { id: "rcm", label: "RCM", position: "MID", x: 75, y: 50 },
      { id: "lw", label: "LW", position: "FWD", x: 18, y: 22 },
      { id: "st", label: "ST", position: "FWD", x: 50, y: 14 },
      { id: "rw", label: "RW", position: "FWD", x: 82, y: 22 },
    ],
  },
  "3-4-3": {
    attackBias: 0.9,
    pros: ["최전방 3명, 최다 공격 인원", "높은 라인의 압박으로 주도권 장악"],
    cons: ["수비수 3명, 뒷공간 취약", "체력 소모가 커 후반 붕괴 위험"],
    slots: [
      { id: "gk", label: "GK", position: "GK", x: 50, y: 92 },
      { id: "cb1", label: "CB", position: "DEF", x: 30, y: 78 },
      { id: "cb2", label: "CB", position: "DEF", x: 50, y: 80 },
      { id: "cb3", label: "CB", position: "DEF", x: 70, y: 78 },
      { id: "lm", label: "LM", position: "MID", x: 14, y: 52 },
      { id: "cm1", label: "CM", position: "MID", x: 38, y: 54 },
      { id: "cm2", label: "CM", position: "MID", x: 62, y: 54 },
      { id: "rm", label: "RM", position: "MID", x: 86, y: 52 },
      { id: "lw", label: "LW", position: "FWD", x: 20, y: 20 },
      { id: "st", label: "ST", position: "FWD", x: 50, y: 14 },
      { id: "rw", label: "RW", position: "FWD", x: 80, y: 20 },
    ],
  },
  "5-2-3": {
    attackBias: -0.1,
    pros: ["수비 시 5백의 안정성과 전방 3명의 역습", "윙백과 윙어를 활용한 측면 전개"],
    cons: ["중앙 미드필더가 두 명뿐이라 수적 열세 가능", "윙백의 체력 부담과 전환 속도 의존"],
    slots: [
      { id: "gk", label: "GK", position: "GK", x: 50, y: 92 },
      { id: "lwb", label: "LWB", position: "DEF", x: 9, y: 67 },
      { id: "cb1", label: "CB", position: "DEF", x: 29, y: 78 },
      { id: "cb2", label: "CB", position: "DEF", x: 50, y: 81 },
      { id: "cb3", label: "CB", position: "DEF", x: 71, y: 78 },
      { id: "rwb", label: "RWB", position: "DEF", x: 91, y: 67 },
      { id: "cm1", label: "CM", position: "MID", x: 39, y: 51 },
      { id: "cm2", label: "CM", position: "MID", x: 61, y: 51 },
      { id: "lw", label: "LW", position: "FWD", x: 19, y: 22 },
      { id: "st", label: "ST", position: "FWD", x: 50, y: 15 },
      { id: "rw", label: "RW", position: "FWD", x: 81, y: 22 },
    ],
  },
};

export const FORMATION_KEYS = Object.keys(FORMATIONS) as FormationKey[];

/** slot list for a formation (convenience) */
export function slotsOf(key: FormationKey): FormationSlot[] {
  return FORMATIONS[key].slots;
}

export function detectFormationShape(
  base: FormationKey,
  slots: Record<string, number | null>,
  positions?: SlotPositions
): string {
  const formation = slotsOf(base);
  const occupied = formation.filter((slot) => slots[slot.id] != null);
  if (occupied.length !== 11) return base;

  const lines = { DEF: 0, MID: 0, FWD: 0 };
  let changedLine = false;
  for (const slot of occupied) {
    if (slot.position === "GK") continue;
    const y = positions?.[slot.id]?.y ?? slot.y;
    const line = y <= 28 ? "FWD" : y >= 65 ? "DEF" : "MID";
    lines[line]++;
    if (line !== slot.position) changedLine = true;
  }

  if (!changedLine) return base;
  return `${lines.DEF}-${lines.MID}-${lines.FWD}`;
}

export const BENCH_ZONE_ID = "bench";
