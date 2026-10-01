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

  /** `client` lets `rotate()` issue inside its transaction; defaults to the root client. */
  async issue(
    userId: string,
    client: Pick<PrismaService, "refreshToken"> = this.prisma,
  ): Promise<IssuedRefreshToken> {
    const token = randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + parseDurationMs(this.config.auth.refreshTokenTtl));

    await client.refreshToken.create({
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

    // The checks above read a snapshot; two concurrent refreshes with the
    // same token both pass them. The conditional claim decides the winner:
    // it takes the row lock, so a concurrent loser waits for the winner's
    // whole transaction (claim + replacement token) to commit, then matches
    // no row. The loser is then treated as reuse -- and because the winner's
    // replacement is already committed, revokeAllForUser revokes it too.
    const next = await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.refreshToken.updateMany({
        where: { id: existing.id, revokedAt: null },
        data: { revokedAt: new Date() },
      });

      return claimed.count === 1 ? this.issue(existing.userId, tx) : null;
    });

    if (!next) {
      // Outside the transaction on purpose: a revoke inside it would be
      // rolled back along with the failed rotation.
      await this.revokeAllForUser(existing.userId);
      throw new UnauthorizedException("Refresh token has already been used");
    }

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
