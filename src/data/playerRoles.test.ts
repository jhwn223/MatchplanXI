import { describe, expect, test } from "vitest";
import { slotsOf } from "./formation";
import {
  defaultRoleForSlot,
  resolvedRoleForSlot,
  roleDefinition,
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
    expect(rolesForSlot(striker).map((role) => role.key)).not.toContain("pressingForward");
    expect(roleGroupForSlot(leftBack)).toBe("FB");
    expect(rolesForSlot(leftBack).map((role) => role.key)).toContain("invertedFullback");
  });

  test("keeps assignments on slots and rejects an incompatible stale role", () => {
    const striker = formation.find((slot) => slot.label === "ST")!;
    expect(resolvedRoleForSlot({ [striker.id]: "pressingForward" }, striker)).toBe(defaultRoleForSlot(striker));
    expect(resolvedRoleForSlot({ [striker.id]: "lineKeeper" }, striker)).toBe(defaultRoleForSlot(striker));
  });

  test("uses full role names and explains both the action and its tradeoff", () => {
    const insideForward = roleDefinition("insideForward");

    expect(insideForward.label).toBe("인사이드 포워드");
    expect(insideForward.benefit).toContain("중앙과 박스 안");
    expect(insideForward.cost).toContain("공격 폭");
  });
});
