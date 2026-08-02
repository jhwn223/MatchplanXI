import { useDroppable } from "@dnd-kit/core";
import { motion } from "framer-motion";
import type { FormationSlot, PitchCoordinate } from "../data/formation";
import type { ConditionBreakdown } from "../data/conditionEngine";
import type { Player } from "../data/types";
import { PlayerCard } from "./PlayerCard";
import type { PlayerDiscipline } from "./playerDiscipline";

interface Props {
  slot: FormationSlot;
  player: Player | null;
  condition?: ConditionBreakdown;
  onSelectPlayer?: (player: Player) => void;
  coordinate: PitchCoordinate;
  positionMode?: boolean;
  discipline?: PlayerDiscipline;
}

export function Slot({ slot, player, condition, onSelectPlayer, coordinate, positionMode, discipline }: Props) {
  const { setNodeRef, isOver } = useDroppable({ id: slot.id });

  return (
    <div
      ref={setNodeRef}
      className="pitch-slot"
      style={{ left: `${coordinate.x}%`, top: `${coordinate.y}%` }}
      data-over={isOver || undefined}
      data-filled={player ? true : undefined}
      data-position-mode={positionMode || undefined}
    >
      {player ? (
        <PlayerCard
          player={player}
          condition={condition}
          variant="slot"
          dragFrom={slot.id}
          onSelect={onSelectPlayer}
          discipline={discipline}
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
