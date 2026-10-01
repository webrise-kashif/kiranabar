import { describe, expect, it } from "vitest";
import { changeUserRoleSchema, loginSchema, registerSchema } from "./auth";

describe("registerSchema", () => {
  it("accepts a valid email/password and lowercases/trims the email", () => {
    const result = registerSchema.parse({ email: "  User@Example.com ", password: "correcthorse" });

    expect(result.email).toBe("user@example.com");
  });

  it("rejects an invalid email", () => {
    expect(() =>
      registerSchema.parse({ email: "not-an-email", password: "correcthorse" }),
    ).toThrow();
  });

  it("rejects a password shorter than 8 characters", () => {
    expect(() => registerSchema.parse({ email: "user@example.com", password: "short1" })).toThrow();
  });

  it("rejects a password longer than 128 characters", () => {
    expect(() =>
      registerSchema.parse({ email: "user@example.com", password: "a".repeat(129) }),
    ).toThrow();
  });
});

describe("loginSchema", () => {
  it("only requires presence of a password, not its strength", () => {
    const result = loginSchema.parse({ email: "user@example.com", password: "x" });

    expect(result.password).toBe("x");
  });

  it("rejects an empty password", () => {
    expect(() => loginSchema.parse({ email: "user@example.com", password: "" })).toThrow();
  });
});

describe("changeUserRoleSchema", () => {
  it("accepts a known role", () => {
    expect(changeUserRoleSchema.parse({ role: "ADMIN" })).toEqual({ role: "ADMIN" });
  });

  it("rejects an unknown role", () => {
    expect(() => changeUserRoleSchema.parse({ role: "OWNER" })).toThrow();
  });
});
