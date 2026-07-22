import { useDroppable } from "@dnd-kit/core";
import { motion } from "framer-motion";
import type { FormationSlot } from "../data/formation";
import type { ConditionBreakdown } from "../data/conditionEngine";
import type { Player } from "../data/types";
import { PlayerCard } from "./PlayerCard";

interface Props {
  slot: FormationSlot;
  player: Player | null;
  condition?: ConditionBreakdown;
  onSelectPlayer?: (player: Player) => void;
}

export function Slot({ slot, player, condition, onSelectPlayer }: Props) {
  const { setNodeRef, isOver } = useDroppable({ id: slot.id });

  return (
    <div
      ref={setNodeRef}
      className="pitch-slot"
      style={{ left: `${slot.x}%`, top: `${slot.y}%` }}
      data-over={isOver || undefined}
      data-filled={player ? true : undefined}
    >
      {player ? (
        <PlayerCard
          player={player}
          condition={condition}
          variant="slot"
          dragFrom={slot.id}
          onSelect={onSelectPlayer}
        />
      ) : (
        <motion.div
          className="pitch-slot__placeholder"
          animate={{ scale: isOver ? 1.15 : 1, opacity: isOver ? 1 : 0.6 }}
          transition={{ type: "spring", stiffness: 400, damping: 24 }}
        >
          {slot.label}
        </motion.div>
      )}
    </div>
  );
}
