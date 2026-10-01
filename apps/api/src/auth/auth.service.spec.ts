import type { JwtService } from "@nestjs/jwt";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AppConfigService } from "../config/app-config.service";
import type { UsersService } from "../users/users.service";
import { AuthService } from "./auth.service";
import type { PasswordService } from "./password.service";
import type { RefreshTokenService } from "./refresh-token.service";

const PUBLIC_USER = {
  id: "user-1",
  email: "user@example.com",
  role: "CUSTOMER" as const,
  createdAt: "2026-01-01T00:00:00.000Z",
};

// Mirrors the raw Prisma User shape (createdAt as a real Date, not the
// ISO string PublicUser uses) since toPublicUser() maps between them.
const FULL_USER = {
  ...PUBLIC_USER,
  createdAt: new Date(PUBLIC_USER.createdAt),
  updatedAt: new Date(PUBLIC_USER.createdAt),
  passwordHash: "stored-hash",
};

function buildDeps() {
  const usersService = {
    findByEmailWithPassword: vi.fn(),
    createWithPassword: vi.fn(),
    findPublicById: vi.fn(),
  };
  const passwordService = { hash: vi.fn(), verify: vi.fn() };
  const refreshTokenService = { issue: vi.fn(), rotate: vi.fn(), revoke: vi.fn() };
  const jwtService = { sign: vi.fn().mockReturnValue("signed-access-token") };
  const config = {
    auth: { accessTokenSecret: "access-secret", accessTokenTtl: "15m" },
  };

  return { usersService, passwordService, refreshTokenService, jwtService, config };
}

function buildService(deps: ReturnType<typeof buildDeps>): AuthService {
  return new AuthService(
    deps.usersService as unknown as UsersService,
    deps.passwordService as unknown as PasswordService,
    deps.refreshTokenService as unknown as RefreshTokenService,
    deps.jwtService as unknown as JwtService,
    deps.config as unknown as AppConfigService,
  );
}

describe("AuthService", () => {
  let deps: ReturnType<typeof buildDeps>;
  let service: AuthService;

  beforeEach(() => {
    deps = buildDeps();
    service = buildService(deps);
  });

  describe("register", () => {
    it("rejects a duplicate email", async () => {
      deps.usersService.findByEmailWithPassword.mockResolvedValue(FULL_USER);

      await expect(service.register("user@example.com", "password123")).rejects.toThrow(
        "already exists",
      );
      expect(deps.passwordService.hash).not.toHaveBeenCalled();
    });

    it("hashes the password and issues a session for a new email", async () => {
      deps.usersService.findByEmailWithPassword.mockResolvedValue(null);
      deps.passwordService.hash.mockResolvedValue("new-hash");
      deps.usersService.createWithPassword.mockResolvedValue(PUBLIC_USER);
      deps.refreshTokenService.issue.mockResolvedValue({
        token: "refresh-token",
        expiresAt: new Date(),
      });

      const result = await service.register("user@example.com", "password123");

      expect(deps.passwordService.hash).toHaveBeenCalledWith("password123");
      expect(deps.usersService.createWithPassword).toHaveBeenCalledWith(
        "user@example.com",
        "new-hash",
      );
      expect(result).toEqual({
        user: PUBLIC_USER,
        accessToken: "signed-access-token",
        refreshToken: "refresh-token",
      });
    });
  });

  describe("login", () => {
    it("rejects an unknown email with a generic message", async () => {
      deps.usersService.findByEmailWithPassword.mockResolvedValue(null);

      await expect(service.login("nobody@example.com", "password123")).rejects.toThrow(
        "Invalid email or password",
      );
    });

    it("rejects a wrong password with the same generic message", async () => {
      deps.usersService.findByEmailWithPassword.mockResolvedValue(FULL_USER);
      deps.passwordService.verify.mockResolvedValue(false);

      await expect(service.login("user@example.com", "wrong")).rejects.toThrow(
        "Invalid email or password",
      );
    });

    it("issues a session for valid credentials, without ever returning the password hash", async () => {
      deps.usersService.findByEmailWithPassword.mockResolvedValue(FULL_USER);
      deps.passwordService.verify.mockResolvedValue(true);
      deps.refreshTokenService.issue.mockResolvedValue({
        token: "refresh-token",
        expiresAt: new Date(),
      });

      const result = await service.login("user@example.com", "password123");

      expect(result.user).not.toHaveProperty("passwordHash");
      expect(result.user).toEqual(PUBLIC_USER);
      expect(result.accessToken).toBe("signed-access-token");
    });
  });

  describe("refresh", () => {
    it("signs a new access token for the rotated token's owner", async () => {
      deps.refreshTokenService.rotate.mockResolvedValue({
        userId: "user-1",
        token: "new-refresh-token",
        expiresAt: new Date(),
      });
      deps.usersService.findPublicById.mockResolvedValue(PUBLIC_USER);

      const result = await service.refresh("old-refresh-token");

      expect(result.refreshToken).toBe("new-refresh-token");
      expect(result.user).toEqual(PUBLIC_USER);
    });

    it("rejects if the rotated token's user no longer exists", async () => {
      deps.refreshTokenService.rotate.mockResolvedValue({
        userId: "deleted-user",
        token: "new-refresh-token",
        expiresAt: new Date(),
      });
      deps.usersService.findPublicById.mockResolvedValue(null);

      await expect(service.refresh("old-refresh-token")).rejects.toThrow("no longer exists");
    });
  });

  describe("logout", () => {
    it("revokes the presented token", async () => {
      await service.logout("some-refresh-token");

      expect(deps.refreshTokenService.revoke).toHaveBeenCalledWith("some-refresh-token");
    });

    it("does nothing (and does not throw) when no token was presented", async () => {
      await expect(service.logout(undefined)).resolves.toBeUndefined();
      expect(deps.refreshTokenService.revoke).not.toHaveBeenCalled();
    });
  });
});
