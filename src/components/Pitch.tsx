import type { FormationSlot } from "../data/formation";
import type { ConditionBreakdown } from "../data/conditionEngine";
import type { Player } from "../data/types";
import { Slot } from "./Slot";

interface Props {
  formation: FormationSlot[];
  slots: Record<string, number | null>;
  playersById: Map<number, Player>;
  conditions: Map<number, ConditionBreakdown>;
}

export function Pitch({ formation, slots, playersById, conditions }: Props) {
  return (
    <div className="pitch">
      <div className="pitch__markings">
        <div className="pitch__center-circle" />
        <div className="pitch__center-line" />
        <div className="pitch__box pitch__box--top" />
        <div className="pitch__box pitch__box--bottom" />
      </div>
      {formation.map((slot) => {
        const playerId = slots[slot.id] ?? null;
        const player = playerId != null ? playersById.get(playerId) ?? null : null;
        return (
          <Slot
            key={slot.id}
            slot={slot}
            player={player}
            condition={player ? conditions.get(player.player_id) : undefined}
          />
        );
      })}
    </div>
  );
}
