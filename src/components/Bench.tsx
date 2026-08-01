import { useDroppable } from "@dnd-kit/core";
import { AnimatePresence } from "framer-motion";
import { useState } from "react";
import { BENCH_ZONE_ID } from "../data/formation";
import type { ConditionBreakdown } from "../data/conditionEngine";
import type { Player, Position } from "../data/types";
import { PlayerCard } from "./PlayerCard";
import type { PlayerDiscipline } from "./playerDiscipline";

interface Props {
  benchPlayers: Player[];
  conditions: Map<number, ConditionBreakdown>;
  benchedOut?: Set<number>;
  onSelectPlayer?: (player: Player) => void;
  discipline?: Map<number, PlayerDiscipline>;
}

const POSITION_ORDER: Position[] = ["GK", "DEF", "MID", "FWD"];

export function Bench({ benchPlayers, conditions, benchedOut, onSelectPlayer, discipline }: Props) {
  const { setNodeRef, isOver } = useDroppable({ id: BENCH_ZONE_ID });
  const [filter, setFilter] = useState<"ALL" | Position>("ALL");
  const [query, setQuery] = useState("");
  const visiblePositions = filter === "ALL" ? POSITION_ORDER : [filter];
  const normalizedQuery = query.trim().toLocaleLowerCase();

  return (
    <div ref={setNodeRef} className="bench" data-over={isOver || undefined}>
      <div className="bench__head">
        <div><span>◉</span><h2 className="bench__title">선수단</h2></div>
        <small>{benchPlayers.length} PLAYERS</small>
      </div>
      <label className="bench__search">
        <span aria-hidden="true">⌕</span>
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="선수 검색"
          aria-label="선수 검색"
        />
      </label>
      <div className="bench__filters" aria-label="포지션 필터">
        {(["ALL", ...POSITION_ORDER] as const).map((position) => (
          <button
            key={position}
            type="button"
            data-active={filter === position || undefined}
            onClick={() => setFilter(position)}
          >
            {position}
          </button>
        ))}
      </div>
      {visiblePositions.map((pos) => {
        const group = benchPlayers.filter(
          (player) =>
            player.position === pos &&
            (!normalizedQuery || player.player_name.toLocaleLowerCase().includes(normalizedQuery))
        );
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
                    ineligible={benchedOut?.has(player.player_id)}
                    onSelect={onSelectPlayer}
                    discipline={discipline?.get(player.player_id)}
                  />
                ))}
              </AnimatePresence>
            </div>
          </div>
        );
      })}
      <div className="bench__footer">드래그하여 선발에 배치 · 클릭하여 상세 능력치 확인</div>
    </div>
  );
}
