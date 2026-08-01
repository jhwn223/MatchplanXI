import { describe, expect, test } from "vitest";
import { slotsOf } from "./formation";
import {
  defaultRoleForSlot,
  resolvedRoleForSlot,
  roleGroupForSlot,
  rolesForSlot,
} from "./playerRoles";

describe("formation slot roles", () => {
  const formation = slotsOf("4-2-3-1");

  test("offers roles that match each formation slot", () => {
    const striker = formation.find((slot) => slot.label === "ST")!;
    const leftBack = formation.find((slot) => slot.label === "LB")!;

    expect(roleGroupForSlot(striker)).toBe("ST");
    expect(rolesForSlot(striker).map((role) => role.key)).toContain("falseNine");
    expect(roleGroupForSlot(leftBack)).toBe("FB");
    expect(rolesForSlot(leftBack).map((role) => role.key)).toContain("invertedFullback");
  });

  test("keeps assignments on slots and rejects an incompatible stale role", () => {
    const striker = formation.find((slot) => slot.label === "ST")!;
    expect(resolvedRoleForSlot({ [striker.id]: "pressingForward" }, striker)).toBe("pressingForward");
    expect(resolvedRoleForSlot({ [striker.id]: "lineKeeper" }, striker)).toBe(defaultRoleForSlot(striker));
  });
});
