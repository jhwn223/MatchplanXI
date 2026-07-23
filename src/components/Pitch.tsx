import type { RefObject } from "react";
import type { FormationSlot, SlotPositions } from "../data/formation";
import type { ConditionBreakdown } from "../data/conditionEngine";
import type { Player } from "../data/types";
import { Slot } from "./Slot";
import type { TeamTactics } from "./match-arena/tactics";

interface Props {
  formation: FormationSlot[];
  slots: Record<string, number | null>;
  playersById: Map<number, Player>;
  conditions: Map<number, ConditionBreakdown>;
  onSelectPlayer?: (player: Player) => void;
  positions?: SlotPositions;
  positionMode?: boolean;
  pitchRef?: RefObject<HTMLDivElement | null>;
  tactics?: TeamTactics;
}

export function tacticalCoordinate(
  coordinate: { x: number; y: number },
  slot: FormationSlot,
  tactics?: TeamTactics
) {
  if (!tactics || slot.position === "GK") return coordinate;
  const fluidityScale = { rigid: 0.96, balanced: 1, fluid: 1.04 }[tactics.fluidity];
  const focusScale = tactics.attackFocus === "central" ? 0.88 : 1;
  const widthScale = { narrow: 0.72, balanced: 1, wide: 1.14 }[tactics.width] * fluidityScale * focusScale;
  const lineShift =
    slot.position === "DEF"
      ? { low: 5, standard: 0, high: -7 }[tactics.defensiveLine] - (tactics.depth - 4) * 0.7
      : 0;
  const mentalityShift = {
    defensive: 3,
    cautious: 1.5,
    balanced: 0,
    positive: -1.5,
    attacking: -3,
  }[tactics.mentality];
  const pressingShift = { low: 1.5, standard: 0, high: -2.5 }[tactics.pressing];
  const strikerShift = slot.position === "FWD"
    ? { target: 1, poacher: -2, falseNine: 7 }[tactics.strikerRole]
    : 0;
  const isWideDefender =
    slot.position === "DEF" &&
    (slot.id.includes("lb") || slot.id.includes("rb") || slot.label.includes("WB"));
  const fullbackShift = isWideDefender
    ? { stay: 4, overlap: -6, inverted: -1 }[tactics.fullbackRole]
    : 0;
  let x = 50 + (coordinate.x - 50) * widthScale;
  if (isWideDefender && tactics.fullbackRole === "inverted") x = 50 + (x - 50) * 0.68;
  if (tactics.attackFocus === "left" && slot.position !== "DEF") x -= 3;
  if (tactics.attackFocus === "right" && slot.position !== "DEF") x += 3;
  return {
    x: Math.max(6, Math.min(94, x)),
    y: Math.max(
      8,
      Math.min(88, coordinate.y + lineShift + mentalityShift + pressingShift + strikerShift + fullbackShift)
    ),
  };
}

export function Pitch({
  formation,
  slots,
  playersById,
  conditions,
  onSelectPlayer,
  positions,
  positionMode,
  pitchRef,
  tactics,
}: Props) {
  return (
    <div
      ref={pitchRef}
      className="pitch"
      data-position-mode={positionMode || undefined}
      data-team-width={tactics?.width}
      data-defensive-line={tactics?.defensiveLine}
    >
      <div className="pitch__markings">
        <div className="pitch__center-circle" />
        <div className="pitch__center-line" />
        <div className="pitch__box pitch__box--top" />
        <div className="pitch__box pitch__box--bottom" />
      </div>
      {tactics && (
        <div className="pitch__tactic-guides" aria-hidden="true">
          <span className="pitch__press-zone">PRESSING ZONE</span>
          <span className="pitch__defense-line">DEFENSIVE LINE</span>
        </div>
      )}
      {formation.map((slot) => {
        const playerId = slots[slot.id] ?? null;
        const player = playerId != null ? playersById.get(playerId) ?? null : null;
        const coordinate = tacticalCoordinate(positions?.[slot.id] ?? slot, slot, tactics);
        return (
          <Slot
            key={slot.id}
            slot={slot}
            player={player}
            condition={player ? conditions.get(player.player_id) : undefined}
            onSelectPlayer={onSelectPlayer}
            coordinate={coordinate}
            positionMode={positionMode}
          />
        );
      })}
    </div>
  );
}
