import { Body, Controller, Get, Param, Patch } from "@nestjs/common";
import type { ProductInventory } from "@kiranabar/types";
import { Roles } from "../auth/decorators/roles.decorator";
import { AdjustInventoryDto } from "./dto/adjust-inventory.dto";
import { InventoryService } from "./inventory.service";

/** Nested under Product on purpose -- Inventory has no meaning outside its product/variant. */
@Controller("products/:productId")
export class InventoryController {
  constructor(private readonly inventoryService: InventoryService) {}

  @Roles("ADMIN", "SUPER_ADMIN")
  @Get("inventory")
  findOne(@Param("productId") productId: string): Promise<ProductInventory> {
    return this.inventoryService.findByProductId(productId);
  }

  @Roles("ADMIN", "SUPER_ADMIN")
  @Patch("inventory")
  adjust(
    @Param("productId") productId: string,
    @Body() dto: AdjustInventoryDto,
  ): Promise<ProductInventory> {
    return this.inventoryService.adjust(productId, dto);
  }

  @Roles("ADMIN", "SUPER_ADMIN")
  @Get("variants/:variantId/inventory")
  findOneForVariant(@Param("variantId") variantId: string): Promise<ProductInventory> {
    return this.inventoryService.findByVariantId(variantId);
  }

  @Roles("ADMIN", "SUPER_ADMIN")
  @Patch("variants/:variantId/inventory")
  adjustForVariant(
    @Param("variantId") variantId: string,
    @Body() dto: AdjustInventoryDto,
  ): Promise<ProductInventory> {
    return this.inventoryService.adjustVariant(variantId, dto);
  }
}
