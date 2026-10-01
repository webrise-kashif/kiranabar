import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UnauthorizedException,
} from "@nestjs/common";
import type { PublicUser } from "@kiranabar/types";
import type { Request, Response } from "express";
import { CartService } from "../cart/cart.service";
import { AppConfigService } from "../config/app-config.service";
import { GUEST_CART_TOKEN_COOKIE } from "../cart/guest-cart-cookie.util";
import { AuthService, type AuthSession } from "./auth.service";
import {
  ACCESS_TOKEN_COOKIE,
  buildAccessTokenCookieOptions,
  buildRefreshTokenCookieOptions,
  REFRESH_TOKEN_COOKIE,
} from "./cookie.util";
import {
  CurrentClientPlatform,
  type ClientPlatform,
} from "./decorators/current-client-platform.decorator";
import { CurrentUser } from "./decorators/current-user.decorator";
import { Public } from "./decorators/public.decorator";
import { LoginDto } from "./dto/login.dto";
import { RefreshDto } from "./dto/refresh.dto";
import { RegisterDto } from "./dto/register.dto";

interface AuthResponseBody {
  user: PublicUser;
  accessToken?: string;
  refreshToken?: string;
}

@Controller("auth")
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly cartService: CartService,
    private readonly config: AppConfigService,
  ) {}

  @Public()
  @Post("register")
  @HttpCode(HttpStatus.CREATED)
  async register(
    @Body() dto: RegisterDto,
    @CurrentClientPlatform() platform: ClientPlatform,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthResponseBody> {
    const session = await this.authService.register(dto.email, dto.password);
    await this.mergeGuestCart(req, res, session.user.id);
    return this.respondWithSession(session, platform, res);
  }

  @Public()
  @Post("login")
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() dto: LoginDto,
    @CurrentClientPlatform() platform: ClientPlatform,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthResponseBody> {
    const session = await this.authService.login(dto.email, dto.password);
    await this.mergeGuestCart(req, res, session.user.id);
    return this.respondWithSession(session, platform, res);
  }

  @Public()
  @Post("refresh")
  @HttpCode(HttpStatus.OK)
  async refresh(
    @Body() dto: RefreshDto,
    @Req() req: Request,
    @CurrentClientPlatform() platform: ClientPlatform,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthResponseBody> {
    const presented = this.extractRefreshToken(req, dto);

    if (!presented) {
      throw new UnauthorizedException("Refresh token is required");
    }

    const session = await this.authService.refresh(presented);
    return this.respondWithSession(session, platform, res);
  }

  /**
   * Deliberately not behind JwtAuthGuard -- "log me out" must succeed even
   * if the access token has already expired. Only the refresh token
   * matters for identifying which session to revoke, and this is
   * idempotent: it always returns success, even if there was nothing to
   * revoke.
   */
  @Public()
  @Post("logout")
  @HttpCode(HttpStatus.OK)
  async logout(
    @Body() dto: RefreshDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ success: true }> {
    const presented = this.extractRefreshToken(req, dto);
    await this.authService.logout(presented);

    res.clearCookie(ACCESS_TOKEN_COOKIE, { path: "/" });
    res.clearCookie(REFRESH_TOKEN_COOKIE, { path: "/api/v1/auth" });

    return { success: true };
  }

  @Get("me")
  me(@CurrentUser() user: PublicUser): { user: PublicUser } {
    return { user };
  }

  private extractRefreshToken(req: Request, dto: RefreshDto): string | undefined {
    return req.cookies?.[REFRESH_TOKEN_COOKIE] ?? dto.refreshToken;
  }

  /** Folds a guest cart (if any) into the now-authenticated user's cart. See CartService. */
  private async mergeGuestCart(req: Request, res: Response, userId: string): Promise<void> {
    const guestToken = req.cookies?.[GUEST_CART_TOKEN_COOKIE] as string | undefined;

    if (!guestToken) {
      return;
    }

    await this.cartService.mergeGuestCartIntoUser(guestToken, userId);
    res.clearCookie(GUEST_CART_TOKEN_COOKIE, { path: "/" });
  }

  private respondWithSession(
    session: AuthSession,
    platform: ClientPlatform,
    res: Response,
  ): AuthResponseBody {
    res.cookie(
      ACCESS_TOKEN_COOKIE,
      session.accessToken,
      buildAccessTokenCookieOptions(this.config),
    );
    res.cookie(
      REFRESH_TOKEN_COOKIE,
      session.refreshToken,
      buildRefreshTokenCookieOptions(this.config),
    );

    if (platform === "mobile") {
      return session;
    }

    // Web: tokens travel only via the httpOnly cookies just set above --
    // never in the body, or httpOnly buys nothing against XSS.
    return { user: session.user };
  }
}
