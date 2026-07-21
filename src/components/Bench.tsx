import { useDroppable } from "@dnd-kit/core";
import { AnimatePresence } from "framer-motion";
import { BENCH_ZONE_ID } from "../data/formation";
import type { ConditionBreakdown } from "../data/conditionEngine";
import type { Player, Position } from "../data/types";
import { PlayerCard } from "./PlayerCard";

interface Props {
  benchPlayers: Player[];
  conditions: Map<number, ConditionBreakdown>;
}

const POSITION_ORDER: Position[] = ["GK", "DEF", "MID", "FWD"];

export function Bench({ benchPlayers, conditions }: Props) {
  const { setNodeRef, isOver } = useDroppable({ id: BENCH_ZONE_ID });

  return (
    <div ref={setNodeRef} className="bench" data-over={isOver || undefined}>
      <h2 className="bench__title">벤치</h2>
      {POSITION_ORDER.map((pos) => {
        const group = benchPlayers.filter((p) => p.position === pos);
        if (group.length === 0) return null;
        return (
          <div key={pos} className="bench__group">
            <h3 className="bench__group-title">{pos}</h3>
            <div className="bench__cards">
              <AnimatePresence>
                {group.map((player) => (
                  <PlayerCard
                    key={player.player_id}
                    player={player}
                    condition={conditions.get(player.player_id)}
                    variant="bench"
                    dragFrom={BENCH_ZONE_ID}
                  />
                ))}
              </AnimatePresence>
            </div>
          </div>
        );
      })}
    </div>
  );
}
