import { useDraggable } from "@dnd-kit/core";
import type { ConditionBreakdown } from "../data/conditionEngine";
import type { Player } from "../data/types";
import { PlayerCardVisual } from "./PlayerCardVisual";

interface Props {
  player: Player;
  condition?: ConditionBreakdown;
  variant: "bench" | "slot";
  dragFrom: string; // "bench" or slotId, carried in draggable data
}

export function PlayerCard({ player, condition, variant, dragFrom }: Props) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `player-${player.player_id}`,
    data: { playerId: player.player_id, from: dragFrom },
  });

  return (
    <PlayerCardVisual
      ref={setNodeRef}
      player={player}
      condition={condition}
      variant={variant}
      state={isDragging ? "dragging-source" : "idle"}
      listeners={listeners}
      attributes={attributes}
    />
  );
}
