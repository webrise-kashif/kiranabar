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
import { OptionalUser } from "../auth/decorators/optional-user.decorator";
import { Public } from "../auth/decorators/public.decorator";
import { OptionalJwtAuthGuard } from "../auth/guards/optional-jwt-auth.guard";
import { AppConfigService } from "../config/app-config.service";
import type { CartOwner } from "./cart-owner";
import { CartService } from "./cart.service";
import { AddCartItemDto } from "./dto/add-cart-item.dto";
import { CartItemVariantQueryDto } from "./dto/cart-item-variant-query.dto";
import { UpdateCartItemDto } from "./dto/update-cart-item.dto";
import { buildGuestCartCookieOptions, GUEST_CART_TOKEN_COOKIE } from "./guest-cart-cookie.util";

/**
 * Public, role-aware like the catalog browsing endpoints -- a cart works
 * without an account (per docs/requirements.md). Every route resolves
 * "whose cart" from either the authenticated user or a guest cookie,
 * never a cart id in the URL.
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
  getCart(@OptionalUser() user: PublicUser | undefined, @Req() req: Request): Promise<Cart> {
    return this.cartService.getCart(this.readOwner(user, req));
  }

  @Public()
  @UseGuards(OptionalJwtAuthGuard)
  @Post("items")
  addItem(
    @Body() dto: AddCartItemDto,
    @OptionalUser() user: PublicUser | undefined,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<Cart> {
    return this.cartService.addItem(
      this.resolveOrCreateOwner(user, req, res),
      dto.productId,
      dto.quantity,
      dto.variantId,
    );
  }

  @Public()
  @UseGuards(OptionalJwtAuthGuard)
  @Patch("items/:productId")
  updateItem(
    @Param("productId") productId: string,
    @Body() dto: UpdateCartItemDto,
    @Query() query: CartItemVariantQueryDto,
    @OptionalUser() user: PublicUser | undefined,
    @Req() req: Request,
  ): Promise<Cart> {
    return this.cartService.updateItem(
      this.readOwner(user, req),
      productId,
      dto.quantity,
      query.variantId,
    );
  }

  @Public()
  @UseGuards(OptionalJwtAuthGuard)
  @Delete("items/:productId")
  removeItem(
    @Param("productId") productId: string,
    @Query() query: CartItemVariantQueryDto,
    @OptionalUser() user: PublicUser | undefined,
    @Req() req: Request,
  ): Promise<Cart> {
    return this.cartService.removeItem(this.readOwner(user, req), productId, query.variantId);
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

  /** For reads/updates: an absent guest cookie just means "no cart" -- never create one here. */
  private readOwner(user: PublicUser | undefined, req: Request): CartOwner {
    if (user) {
      return { userId: user.id };
    }
    return { guestToken: req.cookies?.[GUEST_CART_TOKEN_COOKIE] as string | undefined };
  }

  /** Only "add item" may start a new guest cart, so only it issues a fresh cookie. */
  private resolveOrCreateOwner(
    user: PublicUser | undefined,
    req: Request,
    res: Response,
  ): CartOwner {
    if (user) {
      return { userId: user.id };
    }

    const existingToken = req.cookies?.[GUEST_CART_TOKEN_COOKIE] as string | undefined;
    if (existingToken) {
      return { guestToken: existingToken };
    }

    const token = randomBytes(16).toString("hex");
    res.cookie(GUEST_CART_TOKEN_COOKIE, token, buildGuestCartCookieOptions(this.config));
    return { guestToken: token };
  }
}
