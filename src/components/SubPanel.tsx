import {
  DndContext,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import type { Player, Position } from "../data/types";

export interface OnPitchEntry {
  slotId: string;
  label: string;
  position: Position;
  player: Player;
}

interface Props {
  onPitch: OnPitchEntry[];
  bench: Player[];
  subsUsed: number;
  maxSubs: number;
  canPlaceInSlot: (playerPos: Position, slotPos: Position) => boolean;
  onSub: (slotId: string, inId: number) => void;
}

export function SubPanel({ onPitch, bench, subsUsed, maxSubs, canPlaceInSlot, onSub }: Props) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));
  const done = subsUsed >= maxSubs;

  function handleDragEnd(e: DragEndEvent) {
    if (done) return;
    const inId = e.active.data.current?.playerId as number | undefined;
    if (inId == null || !e.over) return;
    const slotId = String(e.over.id);
    const target = onPitch.find((o) => o.slotId === slotId);
    const inPlayer = bench.find((p) => p.player_id === inId);
    if (!target || !inPlayer) return;
    if (!canPlaceInSlot(inPlayer.position, target.position)) return;
    onSub(slotId, inId);
  }

  return (
    <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
      <div style={wrap}>
        <div style={header}>
          <strong>선수 교체</strong>
          <span style={{ color: done ? "#e5484d" : "#9fb4c9" }}>
            교체 {subsUsed}/{maxSubs}{done ? " · 소진" : ""}
          </span>
        </div>
        <p style={hint}>벤치 선수를 뛰는 선수 위로 드래그하세요 (인접 포지션만)</p>
        <div style={cols}>
          <div style={col}>
            <div style={colTitle}>뛰는 선수</div>
            <div style={list}>
              {onPitch.map((o) => (
                <PitchRow key={o.slotId} entry={o} />
              ))}
            </div>
          </div>
          <div style={col}>
            <div style={colTitle}>벤치 ({bench.length})</div>
            <div style={list}>
              {bench.length === 0 && <div style={{ color: "#6b7f93", fontSize: 12 }}>남은 선수 없음</div>}
              {bench.map((p) => (
                <BenchRow key={p.player_id} player={p} disabled={done} />
              ))}
            </div>
          </div>
        </div>
      </div>
    </DndContext>
  );
}

function PitchRow({ entry }: { entry: OnPitchEntry }) {
  const { setNodeRef, isOver } = useDroppable({ id: entry.slotId });
  return (
    <div
      ref={setNodeRef}
      style={{
        ...row,
        borderColor: isOver ? "#4fd1c5" : "rgba(255,255,255,0.12)",
        background: isOver ? "rgba(79,209,197,0.15)" : "rgba(255,255,255,0.04)",
      }}
    >
      <span style={pos}>{entry.label}</span>
      <span style={name}>{entry.player.player_name}</span>
    </div>
  );
}

function BenchRow({ player, disabled }: { player: Player; disabled: boolean }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `sub-${player.player_id}`,
    data: { playerId: player.player_id },
    disabled,
  });
  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      style={{
        ...row,
        cursor: disabled ? "not-allowed" : "grab",
        opacity: isDragging ? 0.4 : disabled ? 0.5 : 1,
        touchAction: "none",
      }}
    >
      <span style={pos}>{player.position}</span>
      <span style={name}>{player.player_name}</span>
    </div>
  );
}

const wrap: React.CSSProperties = {
  position: "absolute",
  inset: 0,
  background: "rgba(6,20,28,0.92)",
  backdropFilter: "blur(2px)",
  padding: 16,
  display: "flex",
  flexDirection: "column",
  gap: 8,
  zIndex: 5,
  overflow: "hidden",
};
const header: React.CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "center", color: "#eaf2f8", fontSize: 15 };
const hint: React.CSSProperties = { margin: 0, fontSize: 12, color: "#9fb4c9" };
const cols: React.CSSProperties = { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, flex: 1, minHeight: 0 };
const col: React.CSSProperties = { display: "flex", flexDirection: "column", gap: 6, minHeight: 0 };
const colTitle: React.CSSProperties = { fontSize: 12, color: "#7d93a8", fontWeight: 700 };
const list: React.CSSProperties = { display: "flex", flexDirection: "column", gap: 6, overflowY: "auto", paddingRight: 4 };
const row: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  padding: "6px 10px",
  borderRadius: 8,
  border: "1px solid rgba(255,255,255,0.12)",
  background: "rgba(255,255,255,0.04)",
  color: "#eaf2f8",
  fontSize: 13,
};
const pos: React.CSSProperties = { fontSize: 11, fontWeight: 700, color: "#4fd1c5", minWidth: 34 };
const name: React.CSSProperties = { whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" };