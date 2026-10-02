import { randomBytes } from "node:crypto";
import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from "@nestjs/common";
import type { Cart, PublicUser } from "@kiranabar/types";
import type { Request, Response } from "express";
import {
  CurrentClientPlatform,
  type ClientPlatform,
} from "../auth/decorators/current-client-platform.decorator";
import { OptionalUser } from "../auth/decorators/optional-user.decorator";
import { Public } from "../auth/decorators/public.decorator";
import { OptionalJwtAuthGuard } from "../auth/guards/optional-jwt-auth.guard";
import { AppConfigService } from "../config/app-config.service";
import type { CartOwner } from "./cart-owner";
import { CartService } from "./cart.service";
import { AddCartItemDto } from "./dto/add-cart-item.dto";
import { CartItemVariantQueryDto } from "./dto/cart-item-variant-query.dto";
import { UpdateCartItemDto } from "./dto/update-cart-item.dto";
import {
  buildGuestCartCookieOptions,
  GUEST_CART_TOKEN_COOKIE,
  readGuestCartToken,
} from "./guest-cart-cookie.util";

/**
 * Public, role-aware like the catalog browsing endpoints -- a cart works
 * without an account (per docs/requirements.md). Every route resolves
 * "whose cart" from either the authenticated user or a guest token, never
 * a cart id in the URL. The guest token's transport follows the same
 * per-platform split as auth's: an httpOnly cookie for web clients, the
 * response body + `X-Guest-Cart-Token` request header for mobile clients
 * (no cookie jar).
 */
@Controller("cart")
export class CartController {
  constructor(
    private readonly cartService: CartService,
    private readonly config: AppConfigService,
  ) {}

  @Public()
  @UseGuards(OptionalJwtAuthGuard)
  @Get()
  async getCart(
    @OptionalUser() user: PublicUser | undefined,
    @CurrentClientPlatform() platform: ClientPlatform,
    @Req() req: Request,
  ): Promise<Cart> {
    const owner = this.readOwner(user, req);
    return this.withGuestToken(await this.cartService.getCart(owner), owner, platform);
  }

  @Public()
  @UseGuards(OptionalJwtAuthGuard)
  @Post("items")
  async addItem(
    @Body() dto: AddCartItemDto,
    @OptionalUser() user: PublicUser | undefined,
    @CurrentClientPlatform() platform: ClientPlatform,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<Cart> {
    const owner = this.resolveOrCreateOwner(user, platform, req, res);
    const cart = await this.cartService.addItem(owner, dto.productId, dto.quantity, dto.variantId);
    return this.withGuestToken(cart, owner, platform);
  }

  @Public()
  @UseGuards(OptionalJwtAuthGuard)
  @Patch("items/:productId")
  async updateItem(
    @Param("productId") productId: string,
    @Body() dto: UpdateCartItemDto,
    @Query() query: CartItemVariantQueryDto,
    @OptionalUser() user: PublicUser | undefined,
    @CurrentClientPlatform() platform: ClientPlatform,
    @Req() req: Request,
  ): Promise<Cart> {
    const owner = this.readOwner(user, req);
    const cart = await this.cartService.updateItem(owner, productId, dto.quantity, query.variantId);
    return this.withGuestToken(cart, owner, platform);
  }

  @Public()
  @UseGuards(OptionalJwtAuthGuard)
  @Delete("items/:productId")
  async removeItem(
    @Param("productId") productId: string,
    @Query() query: CartItemVariantQueryDto,
    @OptionalUser() user: PublicUser | undefined,
    @CurrentClientPlatform() platform: ClientPlatform,
    @Req() req: Request,
  ): Promise<Cart> {
    const owner = this.readOwner(user, req);
    const cart = await this.cartService.removeItem(owner, productId, query.variantId);
    return this.withGuestToken(cart, owner, platform);
  }

  @Public()
  @UseGuards(OptionalJwtAuthGuard)
  @Delete()
  async clear(
    @OptionalUser() user: PublicUser | undefined,
    @Req() req: Request,
  ): Promise<{ success: true }> {
    await this.cartService.clear(this.readOwner(user, req));
    return { success: true };
  }

  /** For reads/updates: an absent guest token just means "no cart" -- never create one here. */
  private readOwner(user: PublicUser | undefined, req: Request): CartOwner {
    if (user) {
      return { userId: user.id };
    }
    return { guestToken: readGuestCartToken(req) };
  }

  /** Only "add item" may start a new guest cart, so only it issues a fresh token. */
  private resolveOrCreateOwner(
    user: PublicUser | undefined,
    platform: ClientPlatform,
    req: Request,
    res: Response,
  ): CartOwner {
    if (user) {
      return { userId: user.id };
    }

    const existingToken = readGuestCartToken(req);
    if (existingToken) {
      return { guestToken: existingToken };
    }

    const token = randomBytes(16).toString("hex");
    // A mobile client has no cookie jar; it gets the token in the body instead.
    if (platform === "web") {
      res.cookie(GUEST_CART_TOKEN_COOKIE, token, buildGuestCartCookieOptions(this.config));
    }
    return { guestToken: token };
  }

  /**
   * A mobile guest needs its token in the body to send back later. Web
   * guests never get it there (it stays in the httpOnly cookie), and a
   * signed-in cart has no guest token at all.
   */
  private withGuestToken(cart: Cart, owner: CartOwner, platform: ClientPlatform): Cart {
    if (platform === "mobile" && !owner.userId && owner.guestToken) {
      return { ...cart, guestCartToken: owner.guestToken };
    }
    return cart;
  }
}
