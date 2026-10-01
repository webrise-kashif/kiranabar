import { ConflictException, Injectable, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import type { PublicUser } from "@kiranabar/types";
import { AppConfigService } from "../config/app-config.service";
import { toPublicUser } from "../users/user.mapper";
import { UsersService } from "../users/users.service";
import { PasswordService } from "./password.service";
import { RefreshTokenService } from "./refresh-token.service";
import type { JwtPayload } from "./types/jwt-payload";

export interface AuthSession {
  user: PublicUser;
  accessToken: string;
  refreshToken: string;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly passwordService: PasswordService,
    private readonly refreshTokenService: RefreshTokenService,
    private readonly jwtService: JwtService,
    private readonly config: AppConfigService,
  ) {}

  async register(email: string, password: string): Promise<AuthSession> {
    const existing = await this.usersService.findByEmailWithPassword(email);

    if (existing) {
      throw new ConflictException("An account with this email already exists");
    }

    const passwordHash = await this.passwordService.hash(password);
    const user = await this.usersService.createWithPassword(email, passwordHash);

    return this.issueSession(user);
  }

  async login(email: string, password: string): Promise<AuthSession> {
    const user = await this.usersService.findByEmailWithPassword(email);

    // Same error whether the email is unknown or the password is wrong --
    // don't reveal which part of the credential pair was incorrect.
    if (!user || !(await this.passwordService.verify(user.passwordHash, password))) {
      throw new UnauthorizedException("Invalid email or password");
    }

    return this.issueSession(toPublicUser(user));
  }

  async refresh(presentedRefreshToken: string): Promise<AuthSession> {
    const rotated = await this.refreshTokenService.rotate(presentedRefreshToken);
    const user = await this.usersService.findPublicById(rotated.userId);

    if (!user) {
      throw new UnauthorizedException("User no longer exists");
    }

    return {
      user,
      accessToken: this.signAccessToken(user),
      refreshToken: rotated.token,
    };
  }

  async logout(presentedRefreshToken: string | undefined): Promise<void> {
    if (presentedRefreshToken) {
      await this.refreshTokenService.revoke(presentedRefreshToken);
    }
  }

  private async issueSession(user: PublicUser): Promise<AuthSession> {
    const { token: refreshToken } = await this.refreshTokenService.issue(user.id);
    return { user, accessToken: this.signAccessToken(user), refreshToken };
  }

  private signAccessToken(user: PublicUser): string {
    const payload: JwtPayload = { sub: user.id, role: user.role };
    return this.jwtService.sign(payload, {
      secret: this.config.auth.accessTokenSecret,
      expiresIn: this.config.auth.accessTokenTtl,
    });
  }
}
