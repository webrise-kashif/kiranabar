import { createHash, randomBytes } from "node:crypto";
import { Injectable, UnauthorizedException } from "@nestjs/common";
import { AppConfigService } from "../config/app-config.service";
import { PrismaService } from "../prisma/prisma.service";
import { parseDurationMs } from "./duration.util";

export interface IssuedRefreshToken {
  token: string;
  expiresAt: Date;
}

/**
 * Owns the lifecycle of opaque refresh tokens: issuing, rotating (with
 * reuse detection), and revoking. See docs/authentication.md for the full
 * design -- summarized here: only a SHA-256 hash of the token is ever
 * stored, rotation revokes the presented token and issues a new one in the
 * same operation, and presenting an already-revoked token revokes every
 * refresh token the user has (treated as evidence of token theft/replay).
 */
@Injectable()
export class RefreshTokenService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfigService,
  ) {}

  private hash(token: string): string {
    return createHash("sha256").update(token).digest("hex");
  }

  async issue(userId: string): Promise<IssuedRefreshToken> {
    const token = randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + parseDurationMs(this.config.auth.refreshTokenTtl));

    await this.prisma.refreshToken.create({
      data: { userId, tokenHash: this.hash(token), expiresAt },
    });

    return { token, expiresAt };
  }

  async rotate(presentedToken: string): Promise<{ userId: string } & IssuedRefreshToken> {
    const existing = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: this.hash(presentedToken) },
    });

    if (!existing) {
      throw new UnauthorizedException("Invalid refresh token");
    }

    if (existing.revokedAt) {
      await this.revokeAllForUser(existing.userId);
      throw new UnauthorizedException("Refresh token has already been used");
    }

    if (existing.expiresAt.getTime() < Date.now()) {
      throw new UnauthorizedException("Refresh token has expired");
    }

    await this.prisma.refreshToken.update({
      where: { id: existing.id },
      data: { revokedAt: new Date() },
    });

    const next = await this.issue(existing.userId);
    return { userId: existing.userId, ...next };
  }

  async revoke(presentedToken: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash: this.hash(presentedToken), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async revokeAllForUser(userId: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
}
