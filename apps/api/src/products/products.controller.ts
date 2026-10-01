import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import type {
  PaginatedResult,
  Product,
  ProductImage,
  ProductVariant,
  PublicUser,
} from "@kiranabar/types";
import { OptionalUser } from "../auth/decorators/optional-user.decorator";
import { Public } from "../auth/decorators/public.decorator";
import { Roles } from "../auth/decorators/roles.decorator";
import { OptionalJwtAuthGuard } from "../auth/guards/optional-jwt-auth.guard";
import { isStaff } from "../auth/is-staff.util";
import { CreateProductImageDto } from "./dto/create-product-image.dto";
import { CreateProductDto } from "./dto/create-product.dto";
import { CreateProductVariantDto } from "./dto/create-product-variant.dto";
import { ProductQueryDto } from "./dto/product-query.dto";
import { UpdateProductImageDto } from "./dto/update-product-image.dto";
import { UpdateProductDto } from "./dto/update-product.dto";
import { UpdateProductVariantDto } from "./dto/update-product-variant.dto";
import { ProductsService } from "./products.service";

@Controller("products")
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  /** Public: anonymous/CUSTOMER callers see ACTIVE only; ADMIN/SUPER_ADMIN see everything. */
  @Public()
  @UseGuards(OptionalJwtAuthGuard)
  @Get()
  list(
    @Query() query: ProductQueryDto,
    @OptionalUser() user: PublicUser | undefined,
  ): Promise<PaginatedResult<Product>> {
    return this.productsService.findMany(query, isStaff(user));
  }

  /** :idOrSlug matches either the product's id or its slug. */
  @Public()
  @UseGuards(OptionalJwtAuthGuard)
  @Get(":idOrSlug")
  findOne(
    @Param("idOrSlug") idOrSlug: string,
    @OptionalUser() user: PublicUser | undefined,
  ): Promise<Product> {
    return this.productsService.findOne(idOrSlug, isStaff(user));
  }

  @Roles("ADMIN", "SUPER_ADMIN")
  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Body() dto: CreateProductDto): Promise<Product> {
    return this.productsService.create(dto);
  }

  @Roles("ADMIN", "SUPER_ADMIN")
  @Patch(":id")
  update(@Param("id") id: string, @Body() dto: UpdateProductDto): Promise<Product> {
    return this.productsService.update(id, dto);
  }

  /** Soft delete -- sets status to ARCHIVED. See docs/database.md. */
  @Roles("ADMIN", "SUPER_ADMIN")
  @Delete(":id")
  archive(@Param("id") id: string): Promise<Product> {
    return this.productsService.archive(id);
  }

  /** Hard delete -- only allowed once the product is already ARCHIVED. See docs/architecture.md. */
  @Roles("ADMIN", "SUPER_ADMIN")
  @Delete(":id/permanent")
  async remove(@Param("id") id: string): Promise<{ success: true }> {
    await this.productsService.remove(id);
    return { success: true };
  }

  @Roles("ADMIN", "SUPER_ADMIN")
  @Post(":id/images")
  @HttpCode(HttpStatus.CREATED)
  addImage(@Param("id") id: string, @Body() dto: CreateProductImageDto): Promise<ProductImage> {
    return this.productsService.addImage(id, dto);
  }

  @Roles("ADMIN", "SUPER_ADMIN")
  @Patch(":id/images/:imageId")
  updateImage(
    @Param("id") id: string,
    @Param("imageId") imageId: string,
    @Body() dto: UpdateProductImageDto,
  ): Promise<ProductImage> {
    return this.productsService.updateImage(id, imageId, dto);
  }

  @Roles("ADMIN", "SUPER_ADMIN")
  @Delete(":id/images/:imageId")
  async removeImage(
    @Param("id") id: string,
    @Param("imageId") imageId: string,
  ): Promise<{ success: true }> {
    await this.productsService.removeImage(id, imageId);
    return { success: true };
  }

  @Roles("ADMIN", "SUPER_ADMIN")
  @Post(":id/variants")
  @HttpCode(HttpStatus.CREATED)
  createVariant(
    @Param("id") id: string,
    @Body() dto: CreateProductVariantDto,
  ): Promise<ProductVariant> {
    return this.productsService.createVariant(id, dto);
  }

  @Roles("ADMIN", "SUPER_ADMIN")
  @Patch(":id/variants/:variantId")
  updateVariant(
    @Param("id") id: string,
    @Param("variantId") variantId: string,
    @Body() dto: UpdateProductVariantDto,
  ): Promise<ProductVariant> {
    return this.productsService.updateVariant(id, variantId, dto);
  }

  /** Soft delete -- sets status to ARCHIVED. See docs/database.md. */
  @Roles("ADMIN", "SUPER_ADMIN")
  @Delete(":id/variants/:variantId")
  archiveVariant(
    @Param("id") id: string,
    @Param("variantId") variantId: string,
  ): Promise<ProductVariant> {
    return this.productsService.archiveVariant(id, variantId);
  }

  /** Hard delete -- only allowed once the variant is already ARCHIVED. See docs/architecture.md. */
  @Roles("ADMIN", "SUPER_ADMIN")
  @Delete(":id/variants/:variantId/permanent")
  async removeVariant(
    @Param("id") id: string,
    @Param("variantId") variantId: string,
  ): Promise<{ success: true }> {
    await this.productsService.removeVariant(id, variantId);
    return { success: true };
  }
}
