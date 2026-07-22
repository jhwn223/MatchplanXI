import { useDraggable } from "@dnd-kit/core";
import type { ConditionBreakdown } from "../data/conditionEngine";
import type { Player } from "../data/types";
import { PlayerCardVisual } from "./PlayerCardVisual";

interface Props {
  player: Player;
  condition?: ConditionBreakdown;
  variant: "bench" | "slot";
  dragFrom: string; // "bench" or slotId, carried in draggable data
  ineligible?: boolean;
  onSelect?: (player: Player) => void;
}

export function PlayerCard({ player, condition, variant, dragFrom, ineligible, onSelect }: Props) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `player-${player.player_id}`,
    data: { playerId: player.player_id, from: dragFrom },
    disabled: ineligible,
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
      ineligible={ineligible}
      onSelect={onSelect}
    />
  );
}
