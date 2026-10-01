import type { ProductInventory } from "@kiranabar/types";
import type { Inventory as PrismaInventory } from "@prisma/client";

export function toInventory(inventory: PrismaInventory): ProductInventory {
  return {
    quantityAvailable: inventory.quantityAvailable,
    quantityReserved: inventory.quantityReserved,
    version: inventory.version,
  };
}
