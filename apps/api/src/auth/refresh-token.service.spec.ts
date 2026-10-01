import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AppConfigService } from "../config/app-config.service";
import type { PrismaService } from "../prisma/prisma.service";
import { RefreshTokenService } from "./refresh-token.service";

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function buildPrismaMock() {
  const tx = {
    refreshToken: {
      create: vi.fn(),
      updateMany: vi.fn(),
    },
  };

  return {
    tx,
    refreshToken: {
      create: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    $transaction: vi.fn(async (cb: (txArg: typeof tx) => unknown) => cb(tx)),
  };
}

function buildConfigMock(): AppConfigService {
  return { auth: { refreshTokenTtl: "30d" } } as unknown as AppConfigService;
}

describe("RefreshTokenService", () => {
  let prisma: ReturnType<typeof buildPrismaMock>;
  let service: RefreshTokenService;

  beforeEach(() => {
    prisma = buildPrismaMock();
    service = new RefreshTokenService(prisma as unknown as PrismaService, buildConfigMock());
  });

  describe("issue", () => {
    it("stores only a SHA-256 hash of the token, never the raw value", async () => {
      const { token } = await service.issue("user-1");

      expect(prisma.refreshToken.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: "user-1",
          tokenHash: sha256(token),
        }),
      });
      const createCallArg = prisma.refreshToken.create.mock.calls[0]?.[0] as {
        data: { tokenHash: string };
      };
      expect(createCallArg.data.tokenHash).not.toBe(token);
    });

    it("sets an expiry roughly refreshTokenTtl from now", async () => {
      const before = Date.now();
      const { expiresAt } = await service.issue("user-1");
      const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;

      expect(expiresAt.getTime()).toBeGreaterThanOrEqual(before + thirtyDaysMs - 1000);
      expect(expiresAt.getTime()).toBeLessThanOrEqual(before + thirtyDaysMs + 5000);
    });
  });

  describe("rotate", () => {
    it("rejects an unknown token", async () => {
      prisma.refreshToken.findUnique.mockResolvedValue(null);

      await expect(service.rotate("unknown-token")).rejects.toThrow("Invalid refresh token");
    });

    it("rejects an expired token", async () => {
      prisma.refreshToken.findUnique.mockResolvedValue({
        id: "rt-1",
        userId: "user-1",
        revokedAt: null,
        expiresAt: new Date(Date.now() - 1000),
      });

      await expect(service.rotate("expired-token")).rejects.toThrow("expired");
    });

    it("revokes the presented token and issues a new one on success", async () => {
      prisma.refreshToken.findUnique.mockResolvedValue({
        id: "rt-1",
        userId: "user-1",
        revokedAt: null,
        expiresAt: new Date(Date.now() + 1000),
      });

      prisma.tx.refreshToken.updateMany.mockResolvedValue({ count: 1 });

      const result = await service.rotate("valid-token");

      // Claim (revoke only if still unrevoked) and issue the replacement in
      // one transaction, so a concurrent loser can't revoke-all in between.
      expect(prisma.$transaction).toHaveBeenCalledOnce();
      expect(prisma.tx.refreshToken.updateMany).toHaveBeenCalledWith({
        where: { id: "rt-1", revokedAt: null },
        data: { revokedAt: expect.any(Date) },
      });
      expect(prisma.tx.refreshToken.create).toHaveBeenCalledOnce();
      expect(prisma.refreshToken.create).not.toHaveBeenCalled();
      expect(result.userId).toBe("user-1");
      expect(result.token).not.toBe("valid-token");
    });

    it("treats losing a concurrent rotation of the same token as reuse", async () => {
      // Both requests read the token as unrevoked; this one's claim then
      // matches no row because the winner revoked it first.
      prisma.refreshToken.findUnique.mockResolvedValue({
        id: "rt-1",
        userId: "user-1",
        revokedAt: null,
        expiresAt: new Date(Date.now() + 1000),
      });
      prisma.tx.refreshToken.updateMany.mockResolvedValue({ count: 0 });

      await expect(service.rotate("raced-token")).rejects.toThrow("already been used");

      expect(prisma.tx.refreshToken.create).not.toHaveBeenCalled();
      // Outside the (rolled-back) transaction, so it isn't undone.
      expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
        where: { userId: "user-1", revokedAt: null },
        data: { revokedAt: expect.any(Date) },
      });
    });

    it("revokes every token for the user when a rotated-out (revoked) token is reused", async () => {
      prisma.refreshToken.findUnique.mockResolvedValue({
        id: "rt-1",
        userId: "user-1",
        revokedAt: new Date(),
        expiresAt: new Date(Date.now() + 1000),
      });

      await expect(service.rotate("reused-token")).rejects.toThrow("already been used");

      expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
        where: { userId: "user-1", revokedAt: null },
        data: { revokedAt: expect.any(Date) },
      });
    });
  });

  describe("revoke", () => {
    it("revokes only the matching, not-already-revoked token", async () => {
      await service.revoke("some-token");

      expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
        where: { tokenHash: sha256("some-token"), revokedAt: null },
        data: { revokedAt: expect.any(Date) },
      });
    });
  });
});
