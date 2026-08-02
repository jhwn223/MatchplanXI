import { describe, expect, it } from "vitest";

import { FORMATIONS, type FormationKey } from "./formation";
import { switchFormationKeepPlayers, type Slots } from "./tactics";

describe("switchFormationKeepPlayers", () => {
  it("keeps the complete XI across every supported formation change", () => {
    const formations = Object.keys(FORMATIONS) as FormationKey[];

    for (const oldFormation of formations) {
      const oldSlots: Slots = Object.fromEntries(
        FORMATIONS[oldFormation].slots.map((slot, index) => [slot.id, index + 1])
      );

      for (const newFormation of formations) {
        const next = switchFormationKeepPlayers(oldFormation, oldSlots, newFormation);
        const assigned = Object.values(next).filter((playerId): playerId is number => playerId != null);

        expect(assigned, `${oldFormation} -> ${newFormation}`).toHaveLength(11);
        expect(new Set(assigned), `${oldFormation} -> ${newFormation}`).toEqual(
          new Set(Array.from({ length: 11 }, (_, index) => index + 1))
        );
      }
    }
  });
});
