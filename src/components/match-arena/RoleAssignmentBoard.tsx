import { useEffect, useMemo, useState } from "react";
import { slotsOf, type FormationKey } from "../../data/formation";
import {
  resolvedRoleForSlot,
  roleDefinition,
  rolesForSlot,
  type PlayerRole,
  type SlotRoleAssignments,
} from "../../data/playerRoles";
import type { Player } from "../../data/types";

interface Props {
  formation: FormationKey;
  slots: Record<string, number | null>;
  playersById: Map<number, Player>;
  assignments?: SlotRoleAssignments;
  onChange: (slotId: string, role: PlayerRole) => void;
}

export function RoleAssignmentBoard({
  formation,
  slots,
  playersById,
  assignments,
  onChange,
}: Props) {
  const formationSlots = useMemo(() => slotsOf(formation), [formation]);
  const [selectedId, setSelectedId] = useState(formationSlots.find((slot) => slot.position === "FWD")?.id ?? formationSlots[0]?.id);

  useEffect(() => {
    if (!formationSlots.some((slot) => slot.id === selectedId)) {
      setSelectedId(formationSlots.find((slot) => slot.position === "FWD")?.id ?? formationSlots[0]?.id);
    }
  }, [formationSlots, selectedId]);

  const selected = formationSlots.find((slot) => slot.id === selectedId) ?? formationSlots[0];
  if (!selected) return null;
  const playerId = slots[selected.id];
  const player = playerId != null ? playersById.get(playerId) : undefined;
  const currentRole = resolvedRoleForSlot(assignments, selected);
  const options = rolesForSlot(selected);

  return (
    <div className="role-board">
      <div className="role-board__pitch" aria-label={`${formation} 포지션별 역할`}>
        <div className="role-board__markings" aria-hidden="true">
          <i /><b /><span /><em />
        </div>
        {formationSlots.map((slot) => {
          const assigned = resolvedRoleForSlot(assignments, slot);
          const definition = roleDefinition(assigned);
          const id = slots[slot.id];
          const slotPlayer = id != null ? playersById.get(id) : undefined;
          return (
            <button
              type="button"
              key={slot.id}
              className="role-board__slot"
              data-active={selected.id === slot.id || undefined}
              style={{ left: `${slot.x}%`, top: `${slot.y}%` }}
              onClick={() => setSelectedId(slot.id)}
              aria-label={`${slot.label} ${slotPlayer?.player_name ?? "미배치"}, ${definition.label}`}
            >
              <strong>{slot.label}</strong>
              <span>{slotPlayer?.player_name?.split(" ").at(-1) ?? "미배치"}</span>
              <small>{definition.shortLabel}</small>
            </button>
          );
        })}
      </div>

      <section className="role-board__editor">
        <header>
          <div>
            <small>{selected.label} POSITION ROLE</small>
            <h3>{player?.player_name ?? `${selected.label} 슬롯`}</h3>
          </div>
          <span>{roleDefinition(currentRole).shortLabel}</span>
        </header>
        <div className="role-board__options" role="radiogroup" aria-label={`${selected.label} 역할 선택`}>
          {options.map((option) => (
            <button
              type="button"
              key={option.key}
              role="radio"
              aria-checked={currentRole === option.key}
              data-active={currentRole === option.key || undefined}
              onClick={() => onChange(selected.id, option.key)}
            >
              <span className="role-board__check" aria-hidden="true">{currentRole === option.key ? "✓" : ""}</span>
              <span className="role-board__option-copy">
                <strong>{option.label}</strong>
                <small><b>{option.benefit}</b><i>{option.cost}</i></small>
              </span>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}
