import { forwardRef } from "react";
import type { FormationSlot } from "../data/formation";
import type { ConditionBreakdown } from "../data/conditionEngine";
import type { Player } from "../data/types";
import { Slot } from "./Slot";
import { Heatmap, slotPoints } from "./Heatmap";

interface Props {
  formation: FormationSlot[];
  slots: Record<string, number | null>;
  playersById: Map<number, Player>;
  conditions: Map<number, ConditionBreakdown>;
  /** slots to render the heatmap against; defaults to `slots` (pass a preview map while dragging). */
  heatmapSlots?: Record<string, number | null>;
  /** formation (with x/y) to render the heatmap against; defaults to `formation`
   *  (pass a copy with one slot's x/y moved for a live free-drag preview). */
  heatmapFormation?: FormationSlot[];
}

export const Pitch = forwardRef<HTMLDivElement, Props>(
  ({ formation, slots, playersById, conditions, heatmapSlots, heatmapFormation }, ref) => {
    return (
      <div className="pitch" ref={ref}>
        <div className="pitch__markings">
          <div className="pitch__center-circle" />
          <div className="pitch__center-line" />
          <div className="pitch__box pitch__box--top" />
          <div className="pitch__box pitch__box--bottom" />
        </div>
        <Heatmap points={slotPoints(heatmapFormation ?? formation, heatmapSlots ?? slots)} />
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
);
Pitch.displayName = "Pitch";
