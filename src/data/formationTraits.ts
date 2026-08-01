import { FORMATIONS, slotsOf, type FormationKey } from "./formation";

/**
 * Strengths and weaknesses read out of the shape itself.
 *
 * The curated `pros`/`cons` prose on each formation is not wired to anything:
 * the engine only ever sees slot coordinates. That left the two free to drift,
 * and a claim like "중원 숫자 우위" was true only for as long as nobody moved a
 * slot. These traits are derived from the same numbers the simulation reads —
 * how many players the shape commits to each third and how wide it sits — so
 * the description cannot disagree with what the match actually does.
 */

/** Mirrors `thirdOf` in the match engine, including its 34/67 boundaries. */
function thirdOfSlotY(slotY: number) {
  const canonicalX = 100 - slotY;
  return canonicalX < 34 ? 0 : canonicalX < 67 ? 1 : 2;
}

export interface FormationTraits {
  /** Outfield players committed to [defensive, middle, attacking] third. */
  commitment: [number, number, number];
  /** Mean distance of outfield players from the central lane, 0 to 50. */
  width: number;
  attackBias: number;
  pros: string[];
  cons: string[];
}

const TONE = {
  defence: {
    high: "수비 5명으로 실점을 억제",
    low: "수비 3명, 뒷공간이 노출됨",
  },
  midfield: {
    high: "중원 숫자 우위로 점유와 전개에서 유리",
    low: "중원 숫자 열세, 중앙을 내주기 쉬움",
  },
  attack: {
    high: "최전방 인원이 많아 슈팅 기회가 많음",
    low: "최전방 1명, 고립되어 마무리 인원이 부족",
  },
  width: {
    high: "좌우 폭이 넓어 측면 공략과 수비 커버에 유리",
    low: "폭이 좁아 측면을 내주기 쉬움",
  },
} as const;

export function formationTraits(key: FormationKey): FormationTraits {
  const outfield = slotsOf(key).filter((slot) => slot.position !== "GK");
  const commitment: [number, number, number] = [0, 0, 0];
  for (const slot of outfield) commitment[thirdOfSlotY(slot.y)]++;
  const width =
    outfield.reduce((sum, slot) => sum + Math.abs(slot.x - 50), 0) / outfield.length;

  const [defence, midfield, attack] = commitment;
  const pros: string[] = [];
  const cons: string[] = [];

  if (defence >= 5) pros.push(TONE.defence.high);
  if (defence <= 3) cons.push(TONE.defence.low);
  if (midfield >= 5) pros.push(TONE.midfield.high);
  if (midfield <= 3) cons.push(TONE.midfield.low);
  if (attack >= 3) pros.push(TONE.attack.high);
  if (attack <= 1) cons.push(TONE.attack.low);
  // Measured across the shipped formations the mean lateral spread runs from
  // 16 to 22, so the thresholds sit at the ends of that range rather than at
  // guessed absolutes — otherwise every shape reads as narrow.
  if (width >= 21.5) pros.push(TONE.width.high);
  if (width <= 18) cons.push(TONE.width.low);

  // Every shape trades something. A perfectly ordinary 4-4-2 triggers none of
  // the thresholds above, so name the balance rather than showing nothing.
  if (pros.length === 0) pros.push("한 지역에도 치우치지 않은 균형 배치");
  if (cons.length === 0) cons.push("어느 지역에서도 수적 우위를 만들지 못함");

  return { commitment, width, attackBias: FORMATIONS[key].attackBias, pros, cons };
}

export function attackBiasLabel(bias: number): string {
  if (bias >= 0.7) return "초공격";
  if (bias >= 0.3) return "공격";
  if (bias <= -0.5) return "수비";
  if (bias <= -0.2) return "안정";
  return "균형";
}
