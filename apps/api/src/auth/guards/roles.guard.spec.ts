import type { ExecutionContext } from "@nestjs/common";
import type { Reflector } from "@nestjs/core";
import type { PublicUser, UserRole } from "@kiranabar/types";
import { describe, expect, it, vi } from "vitest";
import { RolesGuard } from "./roles.guard";

function buildContext(user: PublicUser | undefined): ExecutionContext {
  return {
    getHandler: () => vi.fn(),
    getClass: () => vi.fn(),
    switchToHttp: () => ({
      getRequest: () => ({ user }),
    }),
  } as unknown as ExecutionContext;
}

function buildGuard(requiredRoles: UserRole[] | undefined): RolesGuard {
  const reflector = {
    getAllAndOverride: vi.fn().mockReturnValue(requiredRoles),
  } as unknown as Reflector;

  return new RolesGuard(reflector);
}

const CUSTOMER: PublicUser = {
  id: "1",
  email: "customer@example.com",
  role: "CUSTOMER",
  createdAt: "2026-01-01T00:00:00.000Z",
};
const ADMIN: PublicUser = { ...CUSTOMER, id: "2", role: "ADMIN" };
const SUPER_ADMIN: PublicUser = { ...CUSTOMER, id: "3", role: "SUPER_ADMIN" };

describe("RolesGuard", () => {
  it("allows any authenticated user when no @Roles() is set", () => {
    const guard = buildGuard(undefined);

    expect(guard.canActivate(buildContext(CUSTOMER))).toBe(true);
  });

  it("allows a CUSTOMER through a CUSTOMER-gated route", () => {
    const guard = buildGuard(["CUSTOMER"]);

    expect(guard.canActivate(buildContext(CUSTOMER))).toBe(true);
  });

  it("allows ADMIN and SUPER_ADMIN through an ADMIN-or-above route", () => {
    const guard = buildGuard(["ADMIN", "SUPER_ADMIN"]);

    expect(guard.canActivate(buildContext(ADMIN))).toBe(true);
    expect(guard.canActivate(buildContext(SUPER_ADMIN))).toBe(true);
  });

  it("rejects a CUSTOMER on an ADMIN-or-above route", () => {
    const guard = buildGuard(["ADMIN", "SUPER_ADMIN"]);

    expect(() => guard.canActivate(buildContext(CUSTOMER))).toThrow("You do not have permission");
  });

  it("rejects ADMIN on a SUPER_ADMIN-only route", () => {
    const guard = buildGuard(["SUPER_ADMIN"]);

    expect(() => guard.canActivate(buildContext(ADMIN))).toThrow("You do not have permission");
  });

  it("rejects when there is no authenticated user at all", () => {
    const guard = buildGuard(["CUSTOMER"]);

    expect(() => guard.canActivate(buildContext(undefined))).toThrow("You do not have permission");
  });
});
