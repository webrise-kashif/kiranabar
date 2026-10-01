import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type {
  PaginatedResult,
  Product,
  ProductImage,
  ProductStatus,
  ProductVariant,
} from "@kiranabar/types";
import type {
  CreateProductImageInput,
  CreateProductInput,
  CreateProductVariantInput,
  ProductQuery,
  UpdateProductImageInput,
  UpdateProductInput,
  UpdateProductVariantInput,
} from "@kiranabar/validation";
import { Prisma } from "@prisma/client";
import { CategoriesService } from "../categories/categories.service";
import { PrismaService } from "../prisma/prisma.service";
import { PRODUCT_INCLUDE, toProduct, toProductImage, toProductVariant } from "./product.mapper";

const VARIANT_INCLUDE = { inventory: true, images: true } as const;

interface NormalizedImageInput {
  url: string;
  altText: string | undefined;
  position: number;
  isPrimary: boolean;
}

/**
 * At most one image ends up `isPrimary`. If the caller marked one, that one
 * wins (later duplicates are demoted); if none did, the first image
 * defaults to primary. Not database-constrained -- see docs/database.md.
 */
function normalizeInitialImages(images: CreateProductImageInput[]): NormalizedImageInput[] {
  const mapped = images.map((image, index) => ({
    url: image.url,
    altText: image.altText,
    position: image.position ?? index,
    isPrimary: image.isPrimary ?? false,
  }));

  const firstPrimaryIndex = mapped.findIndex((image) => image.isPrimary);

  return mapped.map((image, index) => ({
    ...image,
    isPrimary: firstPrimaryIndex === -1 ? index === 0 : index === firstPrimaryIndex,
  }));
}

@Injectable()
export class ProductsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly categoriesService: CategoriesService,
  ) {}

  async create(input: CreateProductInput): Promise<Product> {
    if (input.categoryId) {
      await this.assertCategoryExists(input.categoryId);
    }

    try {
      const product = await this.prisma.product.create({
        data: {
          name: input.name,
          slug: input.slug,
          description: input.description,
          sku: input.sku,
          price: input.price,
          salePrice: input.salePrice,
          currency: input.currency,
          status: input.status,
          categoryId: input.categoryId,
          images: input.images?.length
            ? { create: normalizeInitialImages(input.images) }
            : undefined,
          inventory: { create: { quantityAvailable: input.initialQuantity } },
        },
        include: PRODUCT_INCLUDE,
      });

      return toProduct(product);
    } catch (error) {
      this.rethrowWriteError(error);
    }
  }

  async findMany(
    query: ProductQuery,
    includeAllStatuses: boolean,
  ): Promise<PaginatedResult<Product>> {
    const { page, pageSize, categoryId, search } = query;
    const statusFilter: ProductStatus | undefined = includeAllStatuses ? query.status : "ACTIVE";

    const where: Prisma.ProductWhereInput = {
      ...(categoryId ? { categoryId } : {}),
      ...(statusFilter ? { status: statusFilter } : {}),
      ...(search ? { name: { contains: search, mode: "insensitive" } } : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.product.findMany({
        where,
        include: PRODUCT_INCLUDE,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.product.count({ where }),
    ]);

    return { items: items.map(toProduct), total, page, pageSize };
  }

  async findOne(idOrSlug: string, includeAllStatuses: boolean): Promise<Product> {
    const product = await this.prisma.product.findFirst({
      where: { OR: [{ id: idOrSlug }, { slug: idOrSlug }] },
      include: PRODUCT_INCLUDE,
    });

    if (!product || (!includeAllStatuses && product.status !== "ACTIVE")) {
      throw new NotFoundException("Product not found");
    }

    return toProduct(product);
  }

  async update(id: string, input: UpdateProductInput): Promise<Product> {
    const existing = await this.prisma.product.findUnique({ where: { id } });

    if (!existing) {
      throw new NotFoundException("Product not found");
    }

    if (input.categoryId) {
      await this.assertCategoryExists(input.categoryId);
    }

    const resolvedPrice = input.price ?? existing.price.toString();
    const resolvedSalePrice = input.salePrice ?? existing.salePrice?.toString();

    if (resolvedSalePrice && Number(resolvedSalePrice) >= Number(resolvedPrice)) {
      throw new BadRequestException("salePrice must be less than price");
    }

    try {
      const product = await this.prisma.product.update({
        where: { id },
        data: input,
        include: PRODUCT_INCLUDE,
      });

      return toProduct(product);
    } catch (error) {
      this.rethrowWriteError(error);
    }
  }

  /** Soft delete: sets status to ARCHIVED rather than removing the row -- see docs/database.md. */
  async archive(id: string): Promise<Product> {
    await this.assertProductExists(id);

    const product = await this.prisma.product.update({
      where: { id },
      data: { status: "ARCHIVED" },
      include: PRODUCT_INCLUDE,
    });

    return toProduct(product);
  }

  /**
   * Hard delete: only ever allowed once a product is already archived, and
   * still blocked by the DB if the product has order history (`OrderItem.product`
   * is `onDelete: Restrict` -- see schema.prisma). Cart items referencing it
   * cascade-delete.
   */
  async remove(id: string): Promise<void> {
    const existing = await this.prisma.product.findUnique({
      where: { id },
      select: { status: true },
    });

    if (!existing) {
      throw new NotFoundException("Product not found");
    }

    if (existing.status !== "ARCHIVED") {
      throw new ConflictException("Product must be archived before it can be deleted");
    }

    try {
      await this.prisma.product.delete({ where: { id } });
    } catch (error) {
      this.rethrowDeleteError(error);
    }
  }

  async addImage(productId: string, input: CreateProductImageInput): Promise<ProductImage> {
    await this.assertProductExists(productId);
    if (input.variantId) {
      await this.assertVariantExists(productId, input.variantId);
    }

    if (input.isPrimary) {
      await this.prisma.productImage.updateMany({
        where: { productId, variantId: input.variantId ?? null, isPrimary: true },
        data: { isPrimary: false },
      });
    }

    const position = input.position ?? (await this.nextImagePosition(productId, input.variantId));

    const image = await this.prisma.productImage.create({
      data: {
        productId,
        variantId: input.variantId,
        url: input.url,
        altText: input.altText,
        position,
        isPrimary: input.isPrimary ?? false,
      },
    });

    return toProductImage(image);
  }

  async updateImage(
    productId: string,
    imageId: string,
    input: UpdateProductImageInput,
  ): Promise<ProductImage> {
    const existingImage = await this.assertImageExists(productId, imageId);
    if (input.variantId) {
      await this.assertVariantExists(productId, input.variantId);
    }

    if (input.isPrimary) {
      await this.prisma.productImage.updateMany({
        where: {
          productId,
          variantId: input.variantId ?? existingImage.variantId,
          isPrimary: true,
          NOT: { id: imageId },
        },
        data: { isPrimary: false },
      });
    }

    const image = await this.prisma.productImage.update({
      where: { id: imageId },
      data: input,
    });

    return toProductImage(image);
  }

  async removeImage(productId: string, imageId: string): Promise<void> {
    await this.assertImageExists(productId, imageId);
    await this.prisma.productImage.delete({ where: { id: imageId } });
  }

  async createVariant(
    productId: string,
    input: CreateProductVariantInput,
  ): Promise<ProductVariant> {
    await this.assertProductExists(productId);

    try {
      const variant = await this.prisma.productVariant.create({
        data: {
          productId,
          sku: input.sku,
          price: input.price,
          salePrice: input.salePrice,
          currency: input.currency,
          attributes: input.attributes,
          status: input.status,
          inventory: { create: { quantityAvailable: input.initialQuantity } },
        },
        include: VARIANT_INCLUDE,
      });

      return toProductVariant(variant);
    } catch (error) {
      this.rethrowVariantWriteError(error);
    }
  }

  async updateVariant(
    productId: string,
    variantId: string,
    input: UpdateProductVariantInput,
  ): Promise<ProductVariant> {
    const existing = await this.assertVariantExists(productId, variantId);

    const resolvedPrice = input.price ?? existing.price.toString();
    const resolvedSalePrice = input.salePrice ?? existing.salePrice?.toString();

    if (resolvedSalePrice && Number(resolvedSalePrice) >= Number(resolvedPrice)) {
      throw new BadRequestException("salePrice must be less than price");
    }

    try {
      const variant = await this.prisma.productVariant.update({
        where: { id: variantId },
        data: input,
        include: VARIANT_INCLUDE,
      });

      return toProductVariant(variant);
    } catch (error) {
      this.rethrowVariantWriteError(error);
    }
  }

  /** Soft delete: sets status to ARCHIVED rather than removing the row -- see docs/database.md. */
  async archiveVariant(productId: string, variantId: string): Promise<ProductVariant> {
    await this.assertVariantExists(productId, variantId);

    const variant = await this.prisma.productVariant.update({
      where: { id: variantId },
      data: { status: "ARCHIVED" },
      include: VARIANT_INCLUDE,
    });

    return toProductVariant(variant);
  }

  /**
   * Hard delete: only ever allowed once a variant is already archived, and
   * still blocked by the DB if it has order history (`OrderItem.variant` is
   * `onDelete: Restrict` -- see schema.prisma). Cart items referencing it
   * cascade-delete.
   */
  async removeVariant(productId: string, variantId: string): Promise<void> {
    const existing = await this.assertVariantExists(productId, variantId);

    if (existing.status !== "ARCHIVED") {
      throw new ConflictException("Variant must be archived before it can be deleted");
    }

    try {
      await this.prisma.productVariant.delete({ where: { id: variantId } });
    } catch (error) {
      this.rethrowVariantDeleteError(error);
    }
  }

  private async nextImagePosition(productId: string, variantId?: string): Promise<number> {
    const last = await this.prisma.productImage.findFirst({
      where: { productId, variantId: variantId ?? null },
      orderBy: { position: "desc" },
      select: { position: true },
    });

    return (last?.position ?? -1) + 1;
  }

  private async assertCategoryExists(categoryId: string): Promise<void> {
    if (!(await this.categoriesService.exists(categoryId))) {
      throw new NotFoundException("Category not found");
    }
  }

  private async assertProductExists(id: string): Promise<void> {
    const exists = await this.prisma.product.findUnique({ where: { id }, select: { id: true } });
    if (!exists) {
      throw new NotFoundException("Product not found");
    }
  }

  private async assertImageExists(
    productId: string,
    imageId: string,
  ): Promise<{ variantId: string | null }> {
    const image = await this.prisma.productImage.findUnique({
      where: { id: imageId },
      select: { productId: true, variantId: true },
    });

    if (!image || image.productId !== productId) {
      throw new NotFoundException("Image not found for this product");
    }

    return { variantId: image.variantId };
  }

  private async assertVariantExists(
    productId: string,
    variantId: string,
  ): Promise<{ price: Prisma.Decimal; salePrice: Prisma.Decimal | null; status: ProductStatus }> {
    const variant = await this.prisma.productVariant.findUnique({
      where: { id: variantId },
      select: { productId: true, price: true, salePrice: true, status: true },
    });

    if (!variant || variant.productId !== productId) {
      throw new NotFoundException("Variant not found for this product");
    }

    return variant;
  }

  private rethrowWriteError(error: unknown): never {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const target = Array.isArray(error.meta?.target) ? error.meta.target.join(", ") : "field";
      throw new ConflictException(`A product with this ${target} already exists`);
    }
    throw error as Error;
  }

  private rethrowDeleteError(error: unknown): never {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003") {
      throw new ConflictException(
        "Product cannot be deleted because it has existing order history",
      );
    }
    throw error as Error;
  }

  private rethrowVariantWriteError(error: unknown): never {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new ConflictException("A variant with this SKU already exists");
    }
    throw error as Error;
  }

  private rethrowVariantDeleteError(error: unknown): never {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003") {
      throw new ConflictException(
        "Variant cannot be deleted because it has existing order history",
      );
    }
    throw error as Error;
  }
}
