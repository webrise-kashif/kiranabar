import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import type { ProductInventory } from "@kiranabar/types";
import type { AdjustInventoryInput } from "@kiranabar/validation";
import type { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { toInventory } from "./inventory.mapper";

/** Exactly one of these is ever set -- see Inventory's productId/variantId in schema.prisma. */
type InventoryTarget = { productId: string } | { variantId: string };

function toWhere(target: InventoryTarget): Prisma.InventoryWhereUniqueInput {
  return "productId" in target ? { productId: target.productId } : { variantId: target.variantId };
}

function notFoundMessage(target: InventoryTarget): string {
  return "productId" in target
    ? "Inventory not found for this product"
    : "Inventory not found for this variant";
}

@Injectable()
export class InventoryService {
  constructor(private readonly prisma: PrismaService) {}

  async findByProductId(productId: string): Promise<ProductInventory> {
    return this.findByTarget({ productId });
  }

  async findByVariantId(variantId: string): Promise<ProductInventory> {
    return this.findByTarget({ variantId });
  }

  /**
   * Optimistic-concurrency update: succeeds only if `version` still matches
   * what the caller last read. A mismatch means another request updated
   * the row in between -- reject with 409 rather than silently overwriting
   * that change. See docs/database.md's Inventory section.
   */
  async adjust(productId: string, input: AdjustInventoryInput): Promise<ProductInventory> {
    return this.adjustByTarget({ productId }, input);
  }

  async adjustVariant(variantId: string, input: AdjustInventoryInput): Promise<ProductInventory> {
    return this.adjustByTarget({ variantId }, input);
  }

  private async findByTarget(target: InventoryTarget): Promise<ProductInventory> {
    const inventory = await this.prisma.inventory.findUnique({ where: toWhere(target) });

    if (!inventory) {
      throw new NotFoundException(notFoundMessage(target));
    }

    return toInventory(inventory);
  }

  private async adjustByTarget(
    target: InventoryTarget,
    input: AdjustInventoryInput,
  ): Promise<ProductInventory> {
    const existing = await this.prisma.inventory.findUnique({
      where: toWhere(target),
      select: { id: true },
    });

    if (!existing) {
      throw new NotFoundException(notFoundMessage(target));
    }

    const result = await this.prisma.inventory.updateMany({
      where: { ...toWhere(target), version: input.version },
      data: {
        ...(input.quantityAvailable !== undefined
          ? { quantityAvailable: input.quantityAvailable }
          : {}),
        ...(input.quantityReserved !== undefined
          ? { quantityReserved: input.quantityReserved }
          : {}),
        version: { increment: 1 },
      },
    });

    if (result.count === 0) {
      throw new ConflictException(
        "Inventory was updated by another request -- refetch and retry with the current version",
      );
    }

    return this.findByTarget(target);
  }
}
