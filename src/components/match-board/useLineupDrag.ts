import {
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import type { Dispatch, RefObject, SetStateAction } from "react";
import { BENCH_ZONE_ID, type FormationSlot } from "../../data/formation";
import { canPlaceInSlot } from "../../data/tactics";
import type { Player } from "../../data/types";
import type { Lineup } from "./types";

interface UseLineupDragOptions {
  formation: FormationSlot[];
  lineup: Lineup;
  onChangeLineup: (next: Lineup) => void;
  playersById: Map<number, Player>;
  pitchRef: RefObject<HTMLDivElement | null>;
  benchedOut: Set<number>;
  startingXI: Set<number> | null;
  maxSubs: number;
  maxOnPitch: number;
  playDrop: () => void;
  setBenchedOut: Dispatch<SetStateAction<Set<number>>>;
  setActiveDragId: Dispatch<SetStateAction<number | null>>;
}

export function useLineupDrag({
  formation,
  lineup,
  onChangeLineup,
  playersById,
  pitchRef,
  benchedOut,
  startingXI,
  maxSubs,
  maxOnPitch,
  playDrop,
  setBenchedOut,
  setActiveDragId,
}: UseLineupDragOptions) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  function handleDragStart(event: DragStartEvent) {
    const dragData = event.active.data.current as { playerId: number } | undefined;
    setActiveDragId(dragData?.playerId ?? null);
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveDragId(null);
    const { active, over, delta } = event;
    const dragData = active.data.current as { playerId: number; from: string };
    const player = playersById.get(dragData.playerId);
    if (!player) return;
    const targetId = over ? String(over.id) : null;

    if (dragData.from !== BENCH_ZONE_ID && targetId !== BENCH_ZONE_ID) {
      const sourceSlot = formation.find((slot) => slot.id === dragData.from);
      if (!sourceSlot) return;

      // Dropped on another slot: the two exchange places. Every pitch drag
      // used to be read as a free position nudge, so two starters could never
      // be swapped. The slots keep their own tactical coordinates — only the
      // players move.
      const targetSlot = targetId && targetId !== dragData.from
        ? formation.find((slot) => slot.id === targetId)
        : undefined;
      if (targetSlot) {
        const occupantId = lineup.slots[targetSlot.id];
        const occupant = occupantId != null ? playersById.get(occupantId) : null;
        if (!canPlaceInSlot(player.position, targetSlot.position)) return;
        if (occupant && !canPlaceInSlot(occupant.position, sourceSlot.position)) return;
        onChangeLineup({
          ...lineup,
          slots: {
            ...lineup.slots,
            [sourceSlot.id]: occupantId ?? null,
            [targetSlot.id]: dragData.playerId,
          },
          presetKey: null,
        });
        playDrop();
        return;
      }

      const pitchRect = pitchRef.current?.getBoundingClientRect();
      // The keeper stays on his line: only outfield positions are adjustable.
      // He can still be dragged to the bench to be substituted.
      if (sourceSlot.position === "GK" || !pitchRect) return;
      const current = lineup.positions?.[sourceSlot.id] ?? sourceSlot;
      onChangeLineup({
        ...lineup,
        positions: {
          ...lineup.positions,
          [sourceSlot.id]: {
            x: Math.min(93, Math.max(7, current.x + (delta.x / pitchRect.width) * 100)),
            y: Math.min(92, Math.max(6, current.y + (delta.y / pitchRect.height) * 100)),
          },
        },
        presetKey: null,
      });
      return;
    }

    if (!targetId || targetId === dragData.from || benchedOut.has(dragData.playerId)) return;
    if (targetId === BENCH_ZONE_ID) {
      if (dragData.from !== BENCH_ZONE_ID) {
        // Once the match has kicked off this permanently benches the player
        // (see the previousOccupant branch below for why) — confirm first so
        // a stray drag can't burn a substitution by accident.
        if (startingXI) {
          const confirmed = window.confirm(
            `${player.player_name} 선수를 교체하시겠습니까?\n한번 교체하면 되돌릴 수 없습니다.`
          );
          if (!confirmed) return;
        }
        onChangeLineup({ ...lineup, slots: { ...lineup.slots, [dragData.from]: null }, presetKey: null });
        if (startingXI) setBenchedOut((previous) => new Set(previous).add(dragData.playerId));
      }
      return;
    }

    const targetSlot = formation.find((slot) => slot.id === targetId);
    if (!targetSlot || !canPlaceInSlot(player.position, targetSlot.position)) return;
    const previousOccupant = lineup.slots[targetSlot.id];
    const next = { ...lineup.slots };
    if (dragData.from !== BENCH_ZONE_ID) next[dragData.from] = null;
    next[targetSlot.id] = dragData.playerId;

    if (startingXI) {
      const nextPlaced = new Set(Object.values(next).filter((id): id is number => id != null));
      if (nextPlaced.size > maxOnPitch) return;
      if ([...nextPlaced].filter((id) => !startingXI.has(id)).length > maxSubs) return;
    }

    // A real substitution (bench player replacing a starter, post-kickoff) is
    // irreversible — benchedOut only ever grows, by design, matching real
    // substitution rules. Confirm before it's locked in, since the drag
    // target can be misjudged and there's no way to undo it afterwards.
    if (startingXI && dragData.from === BENCH_ZONE_ID && previousOccupant != null) {
      const outgoing = playersById.get(previousOccupant);
      const confirmed = window.confirm(
        `${outgoing?.player_name ?? "선수"}을(를) 빼고 ${player.player_name} 선수를 투입하시겠습니까?\n한번 교체하면 되돌릴 수 없습니다.`
      );
      if (!confirmed) return;
    }

    onChangeLineup({ ...lineup, slots: next, presetKey: null });
    playDrop();
    if (startingXI && dragData.from === BENCH_ZONE_ID && previousOccupant != null) {
      setBenchedOut((previous) => new Set(previous).add(previousOccupant));
    }
  }

  return { sensors, handleDragStart, handleDragEnd };
}
