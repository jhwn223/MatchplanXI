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
  /** How readily the role takes a man on when it has the ball. */
  dribbleIntent: number;
  /** How far forward and how ambitious a pass the role looks for. */
  passRisk: number;
  workload: number;
}

const role = (
  key: PlayerRole,
  group: SlotRoleGroup,
  label: string,
  shortLabel: string,
  benefit: string,
  cost: string,
  modifiers: Partial<Pick<PlayerRoleDefinition, "advance" | "widthScale" | "shotIntent" | "receiveWeight" | "pressWeight" | "dribbleIntent" | "passRisk" | "workload">> = {},
): PlayerRoleDefinition => ({
  key, group, label, shortLabel, benefit, cost,
  advance: 0, widthScale: 1, shotIntent: 1, receiveWeight: 1, pressWeight: 1,
  dribbleIntent: 1, passRisk: 0, workload: 0,
  ...modifiers,
});

export const PLAYER_ROLES: PlayerRoleDefinition[] = [
  role("lineKeeper", "GK", "골라인 키퍼", "골라인 키퍼", "골문 가까이 머물며 슈팅 선방에 집중합니다", "수비 뒷공간으로 들어오는 공에 늦게 대응합니다", { dribbleIntent: 0.19, passRisk: -0.18, advance: -1 }),
  role("sweeperKeeper", "GK", "스위퍼 키퍼", "스위퍼 키퍼", "페널티 박스 밖까지 전진해 뒷공간 패스를 먼저 걷어냅니다", "전진한 순간 공을 빼앗기면 빈 골문이 노출됩니다", { dribbleIntent: 0.31, passRisk: 0.07, advance: 4, receiveWeight: 1.15, workload: 0.08 }),
  role("stopper", "CB", "스토퍼 센터백", "스토퍼 센터백", "수비 라인에서 먼저 튀어나가 공격수를 압박하고 공을 끊습니다", "압박에 실패하면 센터백 뒤 공간이 바로 열립니다", { dribbleIntent: 0.62, passRisk: 0.02, advance: 3, pressWeight: 1.22, workload: 0.1 }),
  role("cover", "CB", "커버 센터백", "커버 센터백", "수비 라인보다 뒤에서 침투와 긴 패스를 먼저 차단합니다", "상대 공격수에게 전방에서 가하는 압박이 약해집니다", { dribbleIntent: 0.5, passRisk: -0.13, advance: -3, pressWeight: 0.82 }),
  role("ballPlayingDefender", "CB", "빌드업 센터백", "빌드업 센터백", "후방에서 패스를 자주 받아 중원과 공격진으로 전개합니다", "위험한 패스를 시도하다 자기 진영에서 공을 잃을 수 있습니다", { dribbleIntent: 1.0, passRisk: 0.54, advance: 1, receiveWeight: 1.2 }),
  role("stayBack", "FB", "수비형 풀백", "수비형 풀백", "공격 시에도 후방에 남아 상대 윙어와 측면 역습을 막습니다", "공격 지역에서 측면 패스 선택지와 크로스 숫자가 줄어듭니다", { dribbleIntent: 0.75, passRisk: -0.06, advance: -4, pressWeight: 0.9 }),
  role("overlappingFullback", "FB", "오버래핑 풀백", "오버래핑 풀백", "윙어 바깥쪽으로 전진해 측면 패스와 크로스 기회를 늘립니다", "복귀가 늦어 측면 뒷공간이 열리고 체력 소모가 커집니다", { dribbleIntent: 1.69, passRisk: 0.34, advance: 8, widthScale: 1.16, receiveWeight: 1.2, workload: 0.22 }),
  role("invertedFullback", "FB", "인버티드 풀백", "인버티드 풀백", "공격 시 중앙 미드필더 위치로 이동해 중앙 패스 숫자를 늘립니다", "터치라인 쪽 공격 폭이 좁아지고 상대 윙어 대응이 늦어집니다", { dribbleIntent: 1.06, passRisk: 0.42, advance: 4, widthScale: 0.66, receiveWeight: 1.16, workload: 0.12 }),
  role("anchor", "DM", "앵커맨", "앵커맨", "센터백 앞에 머물며 중앙 침투와 역습 경로를 차단합니다", "전진 패스와 페널티 박스 공격 지원이 줄어듭니다", { dribbleIntent: 0.62, passRisk: -0.1, advance: -3, pressWeight: 0.9 }),
  role("ballWinner", "DM", "볼 위닝 미드필더", "볼 위닝 미드필더", "공을 가진 상대에게 빠르게 달라붙어 태클과 탈취를 시도합니다", "자리를 비우는 횟수와 체력 소모가 함께 늘어납니다", { dribbleIntent: 0.87, passRisk: 0.04, advance: 2, pressWeight: 1.3, workload: 0.2 }),
  role("deepPlaymaker", "DM", "후방 플레이메이커", "후방 플레이메이커", "수비 앞에서 패스를 자주 받아 경기 방향과 전개 속도를 조절합니다", "상대와의 수비 경합과 적극적인 압박 참여가 줄어듭니다", { dribbleIntent: 1.12, passRisk: 0.6, receiveWeight: 1.32, pressWeight: 0.82 }),
  role("boxToBox", "CM", "박스 투 박스", "박스 투 박스", "수비 진영부터 상대 박스까지 오가며 공격과 수비에 모두 가담합니다", "활동 범위가 넓어 후반 체력 저하가 빠르게 찾아옵니다", { dribbleIntent: 1.38, passRisk: 0.3, advance: 3, receiveWeight: 1.1, pressWeight: 1.12, workload: 0.25 }),
  role("centralSupport", "CM", "중앙 지원 미드필더", "중앙 지원 미드필더", "중앙 위치를 지키며 수비와 공격 사이의 짧은 패스를 안정적으로 연결합니다", "과감한 침투와 결정적인 전진 패스 빈도가 낮아집니다"),
  role("centralPlaymaker", "CM", "중앙 플레이메이커", "중앙 플레이메이커", "중원에서 공을 자주 받아 창의적인 전진 패스와 기회 창출을 맡습니다", "공을 받기 위해 움직이면서 압박과 수비 가담이 줄어듭니다", { dribbleIntent: 1.44, passRisk: 0.66, receiveWeight: 1.35, pressWeight: 0.8 }),
  role("advancedPlaymaker", "AM", "공격형 플레이메이커", "공격형 플레이메이커", "상대 수비와 미드필더 사이에서 공을 받아 결정적인 패스를 시도합니다", "공을 소유하지 않을 때 수비 가담과 압박 강도가 낮아집니다", { dribbleIntent: 1.5, passRisk: 0.72, advance: 2, receiveWeight: 1.38, pressWeight: 0.78 }),
  role("shadowStriker", "AM", "쉐도우 스트라이커", "쉐도우 스트라이커", "최전방 공격수 뒤에서 박스 안으로 침투해 직접 슈팅을 노립니다", "중원으로 내려와 패스를 연결하는 움직임이 줄어듭니다", { dribbleIntent: 1.44, passRisk: 0.37, advance: 6, shotIntent: 1.35, receiveWeight: 1.12, workload: 0.14 }),
  role("freeRole", "AM", "프리롤 플레이메이커", "프리롤 플레이메이커", "정해진 구역을 벗어나 빈 공간으로 이동하며 패스 전개에 참여합니다", "지정된 위치를 비워 팀 간격과 수비 대형이 흐트러질 수 있습니다", { dribbleIntent: 1.62, passRisk: 0.58, advance: 2, widthScale: 1.08, receiveWeight: 1.25, workload: 0.1 }),
  role("winger", "W", "정통 윙어", "정통 윙어", "터치라인 가까이 넓게 서서 돌파와 크로스로 기회를 만듭니다", "중앙과 박스 안으로 들어가는 득점 움직임이 줄어듭니다", { dribbleIntent: 1.94, passRisk: 0.32, widthScale: 1.18, receiveWeight: 1.16, workload: 0.12 }),
  role("insideForward", "W", "인사이드 포워드", "인사이드 포워드", "측면에서 중앙과 박스 안으로 침투해 직접 슈팅을 시도합니다", "터치라인 쪽 공격 폭과 크로스 빈도가 줄어듭니다", { dribbleIntent: 1.81, passRisk: 0.27, advance: 3, widthScale: 0.7, shotIntent: 1.35, receiveWeight: 1.12, workload: 0.15 }),
  role("widePlaymaker", "W", "와이드 플레이메이커", "와이드 플레이메이커", "측면에서 공을 자주 받아 크로스와 중앙 패스로 공격을 설계합니다", "공 없이 뒷공간을 파고드는 침투와 직접 슈팅이 줄어듭니다", { dribbleIntent: 1.38, passRisk: 0.62, widthScale: 1.04, shotIntent: 0.82, receiveWeight: 1.34 }),
  role("poacher", "ST", "침투형 공격수", "침투형 공격수", "수비 라인 뒤와 박스 안으로 침투해 슈팅 기회를 우선적으로 노립니다", "중원으로 내려오는 연계와 전방 압박 참여가 줄어듭니다", { dribbleIntent: 1.06, passRisk: 0.17, advance: 3, shotIntent: 1.34, receiveWeight: 1.16, pressWeight: 0.78 }),
  role("targetForward", "ST", "타깃맨", "타깃맨", "전방에서 긴 패스를 받아 지키고 동료에게 연결하는 기준점이 됩니다", "빠르게 수비 뒤로 침투하는 움직임과 속공 전개가 줄어듭니다", { dribbleIntent: 0.69, passRisk: 0.1, advance: -1, receiveWeight: 1.36, shotIntent: 1.06 }),
  role("falseNine", "ST", "펄스 나인", "펄스 나인", "최전방에서 중원으로 내려와 패스를 연결하고 동료의 침투 공간을 만듭니다", "본인이 박스 안에 머무는 시간이 줄어 슈팅 숫자가 감소합니다", { dribbleIntent: 1.44, passRisk: 0.64, advance: -7, shotIntent: 0.78, receiveWeight: 1.4 }),
  role("pressingForward", "ST", "압박형 공격수", "압박형 공격수", "상대 센터백과 골키퍼를 적극적으로 압박해 전방 탈취를 노립니다", "체력 소모가 크고 좋은 슈팅 위치를 지키기 어려워집니다", { dribbleIntent: 1.12, passRisk: 0.14, advance: -1, shotIntent: 0.92, pressWeight: 1.4, workload: 0.28 }),
];

const ROLE_MAP = new Map(PLAYER_ROLES.map((definition) => [definition.key, definition]));
const HIDDEN_ROLE_KEYS = new Set<PlayerRole>(["pressingForward"]);

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
  return PLAYER_ROLES.filter(
    (definition) => definition.group === group && !HIDDEN_ROLE_KEYS.has(definition.key),
  );
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
