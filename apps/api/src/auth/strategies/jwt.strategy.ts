import { Injectable, UnauthorizedException } from "@nestjs/common";
import { PassportStrategy } from "@nestjs/passport";
import type { PublicUser } from "@kiranabar/types";
import type { Request } from "express";
import { ExtractJwt, Strategy } from "passport-jwt";
import { AppConfigService } from "../../config/app-config.service";
import { UsersService } from "../../users/users.service";
import { ACCESS_TOKEN_COOKIE } from "../cookie.util";
import type { JwtPayload } from "../types/jwt-payload";

function cookieExtractor(req: Request): string | null {
  return req.cookies?.[ACCESS_TOKEN_COOKIE] ?? null;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: AppConfigService,
    private readonly usersService: UsersService,
  ) {
    super({
      // Mobile clients send Authorization: Bearer; web clients rely on the
      // access_token cookie -- checked in that order, first match wins.
      jwtFromRequest: ExtractJwt.fromExtractors([
        ExtractJwt.fromAuthHeaderAsBearerToken(),
        cookieExtractor,
      ]),
      ignoreExpiration: false,
      secretOrKey: config.auth.accessTokenSecret,
    });
  }

  /**
   * Re-fetches the user on every request rather than trusting the JWT's
   * embedded role. Costs one indexed primary-key lookup per authenticated
   * request; in exchange, a role change (or, once implemented, a ban)
   * takes effect immediately instead of waiting out the access token's
   * TTL. See docs/authentication.md for the trade-off.
   */
  async validate(payload: JwtPayload): Promise<PublicUser> {
    const user = await this.usersService.findPublicById(payload.sub);

    if (!user) {
      throw new UnauthorizedException("User no longer exists");
    }

    return user;
  }
}
