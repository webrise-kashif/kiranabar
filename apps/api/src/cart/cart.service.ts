import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import type { Cart, Product, ProductVariant } from "@kiranabar/types";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { PRODUCT_INCLUDE } from "../products/product.mapper";
import { ProductsService } from "../products/products.service";
import type { CartOwner } from "./cart-owner";
import { emptyCart, toCart } from "./cart.mapper";

const CART_INCLUDE = {
  items: {
    include: {
      product: { include: PRODUCT_INCLUDE },
      variant: { include: { inventory: true, images: true } },
    },
  },
} as const;

@Injectable()
export class CartService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly productsService: ProductsService,
  ) {}

  async getCart(owner: CartOwner): Promise<Cart> {
    const cart = await this.findExistingCart(owner);
    return cart ? toCart(cart) : emptyCart();
  }

  async addItem(
    owner: CartOwner,
    productId: string,
    quantity: number,
    variantId?: string,
  ): Promise<Cart> {
    // Must be currently ACTIVE and visible -- same rule as browsing.
    const product = await this.productsService.findOne(productId, false);
    const variant = this.resolveVariant(product, variantId, { requireActive: true });

    const cart = await this.findOrCreateCart(owner);
    const existing = await this.prisma.cartItem.findFirst({
      where: this.itemFilter(cart.id, productId, variantId),
    });
    this.assertWithinStock(product, variant, (existing?.quantity ?? 0) + quantity);

    await this.upsertItemQuantity(cart.id, productId, variantId, quantity, "increment", existing);

    return this.getCartOrThrow(cart.id);
  }

  async updateItem(
    owner: CartOwner,
    productId: string,
    quantity: number,
    variantId?: string,
  ): Promise<Cart> {
    const cart = await this.findExistingCart(owner);
    const item = cart?.items.find((cartItem) => this.matchesLine(cartItem, productId, variantId));

    if (!cart || !item) {
      throw new NotFoundException("Item not found in cart");
    }

    // Tolerates a since-archived/draft product or variant (the customer can
    // still adjust/remove it) -- only a fresh add requires it to be ACTIVE.
    const product = await this.productsService.findOne(productId, true);
    const variant = this.resolveVariant(product, variantId, { requireActive: false });
    this.assertWithinStock(product, variant, quantity);

    await this.prisma.cartItem.update({ where: { id: item.id }, data: { quantity } });

    return this.getCartOrThrow(cart.id);
  }

  async removeItem(owner: CartOwner, productId: string, variantId?: string): Promise<Cart> {
    const cart = await this.findExistingCart(owner);
    const item = cart?.items.find((cartItem) => this.matchesLine(cartItem, productId, variantId));

    if (!cart || !item) {
      throw new NotFoundException("Item not found in cart");
    }

    await this.prisma.cartItem.delete({ where: { id: item.id } });

    return this.getCartOrThrow(cart.id);
  }

  /** Idempotent, like logout -- clearing an already-empty/nonexistent cart is not an error. */
  async clear(owner: CartOwner): Promise<void> {
    const cart = await this.findExistingCart(owner);
    if (cart) {
      await this.prisma.cart.delete({ where: { id: cart.id } });
    }
  }

  /**
   * Called from AuthService on login/register. Folds a guest cart's items
   * into the now-authenticated user's cart (creating one if needed), then
   * removes the guest cart. A no-op if there's no guest cart to merge.
   */
  async mergeGuestCartIntoUser(guestToken: string | undefined, userId: string): Promise<void> {
    if (!guestToken) {
      return;
    }

    const guestCart = await this.prisma.cart.findUnique({
      where: { guestToken },
      include: { items: true },
    });

    if (!guestCart) {
      return;
    }

    if (guestCart.items.length > 0) {
      const userCart = await this.prisma.cart.upsert({
        where: { userId },
        create: { userId },
        update: {},
      });

      for (const item of guestCart.items) {
        await this.upsertItemQuantity(
          userCart.id,
          item.productId,
          item.variantId ?? undefined,
          item.quantity,
          "increment",
        );
      }
    }

    await this.prisma.cart.delete({ where: { id: guestCart.id } });
  }

  private assertWithinStock(
    product: Product,
    variant: ProductVariant | undefined,
    quantity: number,
  ): void {
    const inventory = variant?.inventory ?? product.inventory;
    if (inventory && quantity > inventory.quantityAvailable) {
      throw new BadRequestException(
        `Only ${inventory.quantityAvailable} unit(s) of "${product.name}" available`,
      );
    }
  }

  /** A variant, when given, must belong to the product; `requireActive` mirrors the same rule already applied to fresh adds of the product itself. */
  private resolveVariant(
    product: Product,
    variantId: string | undefined,
    options: { requireActive: boolean },
  ): ProductVariant | undefined {
    if (!variantId) {
      return undefined;
    }

    const variant = product.variants.find((candidate) => candidate.id === variantId);

    if (!variant || (options.requireActive && variant.status !== "ACTIVE")) {
      throw new NotFoundException("Variant not found for this product");
    }

    return variant;
  }

  private matchesLine(
    item: { productId: string; variantId: string | null },
    productId: string,
    variantId: string | undefined,
  ): boolean {
    return item.productId === productId && item.variantId === (variantId ?? null);
  }

  /**
   * A plain multi-field filter, not the `cartId_productId_variantId`
   * compound-unique shortcut -- Prisma's generated compound-unique input
   * types require every field non-null, so it can't express "the no-variant
   * line" (`variantId: null`). The `@@unique` DB constraint still enforces
   * one row per (cart, product, variant) at the data level; this is purely
   * about which query shape can express a null variantId.
   */
  private itemFilter(
    cartId: string,
    productId: string,
    variantId: string | undefined,
  ): Prisma.CartItemWhereInput {
    return { cartId, productId, variantId: variantId ?? null };
  }

  /**
   * Find-then-write, not an atomic `upsert` -- the compound-unique shortcut
   * an atomic upsert needs can't express a null variantId (see itemFilter).
   * Falls back to folding into the winning row on a `P2002` from the
   * `@@unique` constraint when it fires -- which, for a variant-specific
   * line (variantId set), fully closes the race. For the no-variant case
   * (variantId null), Postgres's unique constraint never fires at all --
   * NULL is never considered equal to NULL, even within a multi-column
   * index -- so a rare concurrent double-add there can still produce two
   * separate no-variant lines; see schema.prisma's CartItem for why this
   * is an accepted trade-off rather than a partial-index migration.
   */
  private async upsertItemQuantity(
    cartId: string,
    productId: string,
    variantId: string | undefined,
    quantity: number,
    mode: "increment" | "set",
    /** Pass an already-fetched row to skip a redundant lookup (e.g. addItem's stock check already found it). */
    knownExisting?: { id: string } | null,
  ): Promise<void> {
    const filter = this.itemFilter(cartId, productId, variantId);
    const existing =
      knownExisting !== undefined
        ? knownExisting
        : await this.prisma.cartItem.findFirst({ where: filter });

    if (existing) {
      await this.prisma.cartItem.update({
        where: { id: existing.id },
        data: { quantity: mode === "increment" ? { increment: quantity } : quantity },
      });
      return;
    }

    try {
      await this.prisma.cartItem.create({
        data: { cartId, productId, variantId: variantId ?? null, quantity },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        const winner = await this.prisma.cartItem.findFirstOrThrow({ where: filter });
        await this.prisma.cartItem.update({
          where: { id: winner.id },
          data: { quantity: mode === "increment" ? { increment: quantity } : quantity },
        });
        return;
      }
      throw error as Error;
    }
  }

  private async getCartOrThrow(cartId: string): Promise<Cart> {
    const cart = await this.prisma.cart.findUniqueOrThrow({
      where: { id: cartId },
      include: CART_INCLUDE,
    });

    return toCart(cart);
  }

  /**
   * Never spreads `owner` into a Prisma `where` -- an `undefined` field
   * value there means "don't filter", not "IS NULL", which could match an
   * unrelated cart. Branch explicitly instead.
   */
  private findExistingCart(owner: CartOwner) {
    if (owner.userId) {
      return this.prisma.cart.findUnique({
        where: { userId: owner.userId },
        include: CART_INCLUDE,
      });
    }
    if (owner.guestToken) {
      return this.prisma.cart.findUnique({
        where: { guestToken: owner.guestToken },
        include: CART_INCLUDE,
      });
    }
    return Promise.resolve(null);
  }

  private async findOrCreateCart(owner: CartOwner) {
    const existing = await this.findExistingCart(owner);
    if (existing) {
      return existing;
    }

    if (owner.userId) {
      return this.prisma.cart.create({ data: { userId: owner.userId }, include: CART_INCLUDE });
    }
    if (owner.guestToken) {
      return this.prisma.cart.create({
        data: { guestToken: owner.guestToken },
        include: CART_INCLUDE,
      });
    }

    throw new Error("Cart owner must have either a userId or a guestToken");
  }
}
