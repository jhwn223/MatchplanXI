import type { FormationSlot } from "./formation";

export type PlayerRole =
  | "lineKeeper" | "sweeperKeeper"
  | "stopper" | "cover" | "ballPlayingDefender"
  | "stayBack" | "overlappingFullback" | "invertedFullback"
  | "anchor" | "ballWinner" | "deepPlaymaker"
  | "boxToBox" | "centralSupport" | "centralPlaymaker"
  | "advancedPlaymaker" | "shadowStriker" | "freeRole"
  | "winger" | "insideForward" | "widePlaymaker"
  | "poacher" | "targetForward" | "falseNine" | "pressingForward";

export type SlotRoleGroup = "GK" | "CB" | "FB" | "DM" | "CM" | "AM" | "W" | "ST";
export type SlotRoleAssignments = Record<string, PlayerRole>;

export interface PlayerRoleDefinition {
  key: PlayerRole;
  group: SlotRoleGroup;
  label: string;
  shortLabel: string;
  benefit: string;
  cost: string;
  advance: number;
  widthScale: number;
  shotIntent: number;
  receiveWeight: number;
  pressWeight: number;
  workload: number;
}

const role = (
  key: PlayerRole,
  group: SlotRoleGroup,
  label: string,
  shortLabel: string,
  benefit: string,
  cost: string,
  modifiers: Partial<Pick<PlayerRoleDefinition, "advance" | "widthScale" | "shotIntent" | "receiveWeight" | "pressWeight" | "workload">> = {},
): PlayerRoleDefinition => ({
  key, group, label, shortLabel, benefit, cost,
  advance: 0, widthScale: 1, shotIntent: 1, receiveWeight: 1, pressWeight: 1, workload: 0,
  ...modifiers,
});

export const PLAYER_ROLES: PlayerRoleDefinition[] = [
  role("lineKeeper", "GK", "골라인 수비", "골라인", "선방 위치 안정", "후방 커버 범위 감소", { advance: -1 }),
  role("sweeperKeeper", "GK", "스위퍼 키퍼", "스위퍼", "뒷공간 선제 대응", "전진 시 빈 골문 위험", { advance: 4, receiveWeight: 1.15, workload: 0.08 }),
  role("stopper", "CB", "스토퍼", "스토퍼", "적극적인 전진 수비", "등 뒤 공간 노출", { advance: 3, pressWeight: 1.22, workload: 0.1 }),
  role("cover", "CB", "커버", "커버", "뒷공간 보호", "전방 압박 감소", { advance: -3, pressWeight: 0.82 }),
  role("ballPlayingDefender", "CB", "빌드업 수비수", "빌드업", "후방 패스 전개", "볼 소유권 상실 위험", { advance: 1, receiveWeight: 1.2 }),
  role("stayBack", "FB", "수비 대기", "수비 대기", "측면 뒷공간 보호", "공격 숫자 감소", { advance: -4, pressWeight: 0.9 }),
  role("overlappingFullback", "FB", "오버래핑", "오버랩", "측면 공격 가담", "체력 소모와 후방 공간", { advance: 8, widthScale: 1.16, receiveWeight: 1.2, workload: 0.22 }),
  role("invertedFullback", "FB", "인버티드", "인버티드", "중앙 빌드업 지원", "측면 폭 감소", { advance: 4, widthScale: 0.66, receiveWeight: 1.16, workload: 0.12 }),
  role("anchor", "DM", "앵커맨", "앵커", "수비 앞 공간 보호", "전진 지원 감소", { advance: -3, pressWeight: 0.9 }),
  role("ballWinner", "DM", "볼 위닝 미드필더", "볼 위닝", "탈취와 압박 증가", "위치 이탈과 체력 소모", { advance: 2, pressWeight: 1.3, workload: 0.2 }),
  role("deepPlaymaker", "DM", "후방 플레이메이커", "후방 PM", "후방 전개 관여", "수비 경합 감소", { receiveWeight: 1.32, pressWeight: 0.82 }),
  role("boxToBox", "CM", "박스 투 박스", "B2B", "공수 양면 지원", "높은 체력 소모", { advance: 3, receiveWeight: 1.1, pressWeight: 1.12, workload: 0.25 }),
  role("centralSupport", "CM", "중앙 지원", "중앙 지원", "안정적인 연결", "결정적 움직임 감소"),
  role("centralPlaymaker", "CM", "플레이메이커", "플메", "창의적인 패스 연결", "압박 기여 감소", { receiveWeight: 1.35, pressWeight: 0.8 }),
  role("advancedPlaymaker", "AM", "플레이메이커", "공격 PM", "찬스 메이킹 증가", "수비 가담 감소", { advance: 2, receiveWeight: 1.38, pressWeight: 0.78 }),
  role("shadowStriker", "AM", "쉐도우 스트라이커", "쉐도우", "박스 침투와 슈팅", "중원 연결 감소", { advance: 6, shotIntent: 1.35, receiveWeight: 1.12, workload: 0.14 }),
  role("freeRole", "AM", "자유 역할", "프리롤", "자유로운 공간 활용", "전술 간격 이탈", { advance: 2, widthScale: 1.08, receiveWeight: 1.25, workload: 0.1 }),
  role("winger", "W", "정통 윙어", "윙어", "측면 폭과 크로스", "중앙 득점 가담 감소", { widthScale: 1.18, receiveWeight: 1.16, workload: 0.12 }),
  role("insideForward", "W", "인사이드 포워드", "인사이드", "중앙 침투와 슈팅", "측면 폭 감소", { advance: 3, widthScale: 0.7, shotIntent: 1.35, receiveWeight: 1.12, workload: 0.15 }),
  role("widePlaymaker", "W", "와이드 플레이메이커", "와이드 PM", "측면 창의성 증가", "직접 침투 감소", { widthScale: 1.04, shotIntent: 0.82, receiveWeight: 1.34 }),
  role("poacher", "ST", "침투형 공격수", "침투형", "뒷공간 침투와 슈팅", "연계와 압박 감소", { advance: 3, shotIntent: 1.34, receiveWeight: 1.16, pressWeight: 0.78 }),
  role("targetForward", "ST", "타깃맨", "타깃맨", "롱볼 연결과 볼 간수", "침투 속도 감소", { advance: -1, receiveWeight: 1.36, shotIntent: 1.06 }),
  role("falseNine", "ST", "펄스 나인", "펄스 나인", "중앙 연계와 공간 창출", "박스 안 숫자 감소", { advance: -7, shotIntent: 0.78, receiveWeight: 1.4 }),
  role("pressingForward", "ST", "압박형 공격수", "압박형", "전방 탈취 증가", "체력과 슈팅 위치 손해", { advance: -1, shotIntent: 0.92, pressWeight: 1.4, workload: 0.28 }),
];

const ROLE_MAP = new Map(PLAYER_ROLES.map((definition) => [definition.key, definition]));

export function roleDefinition(roleKey?: PlayerRole): PlayerRoleDefinition {
  return ROLE_MAP.get(roleKey ?? "centralSupport") ?? ROLE_MAP.get("centralSupport")!;
}

export function roleGroupForSlot(slot: Pick<FormationSlot, "id" | "label" | "position">): SlotRoleGroup {
  const label = slot.label.toUpperCase();
  if (slot.position === "GK") return "GK";
  if (label.includes("CB")) return "CB";
  if (label.includes("LB") || label.includes("RB") || label.includes("WB")) return "FB";
  if (label.includes("DM")) return "DM";
  if (label.includes("AM")) return "AM";
  if (label === "LW" || label === "RW" || label === "LM" || label === "RM") return "W";
  if (label.includes("ST") || slot.position === "FWD") return "ST";
  return "CM";
}

export function rolesForSlot(slot: Pick<FormationSlot, "id" | "label" | "position">) {
  const group = roleGroupForSlot(slot);
  return PLAYER_ROLES.filter((definition) => definition.group === group);
}

const DEFAULT_BY_GROUP: Record<SlotRoleGroup, PlayerRole> = {
  GK: "lineKeeper", CB: "cover", FB: "overlappingFullback", DM: "anchor",
  CM: "centralSupport", AM: "advancedPlaymaker", W: "winger", ST: "poacher",
};

export function defaultRoleForSlot(slot: Pick<FormationSlot, "id" | "label" | "position">): PlayerRole {
  return DEFAULT_BY_GROUP[roleGroupForSlot(slot)];
}

export function resolvedRoleForSlot(
  assignments: Partial<SlotRoleAssignments> | undefined,
  slot: Pick<FormationSlot, "id" | "label" | "position">,
) {
  const selected = assignments?.[slot.id];
  return selected && rolesForSlot(slot).some((role) => role.key === selected)
    ? selected
    : defaultRoleForSlot(slot);
}
