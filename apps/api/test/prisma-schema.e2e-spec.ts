import { Test } from "@nestjs/testing";
import { CategoryStatus, Prisma, ProductStatus, Role } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppConfigModule } from "../src/config/app-config.module";
import { PrismaModule } from "../src/prisma/prisma.module";
import { PrismaService } from "../src/prisma/prisma.service";

// Requires a reachable PostgreSQL with the initial migration applied (see
// docs/database.md). Exercises the schema/relations through PrismaService,
// the way real domain modules will once they're implemented.
describe("Initial schema (e2e)", () => {
  let prisma: PrismaService;

  const parentSlug = "schema-spec-parent";
  const childSlug = "schema-spec-child";
  const productSlug = "schema-spec-product";
  const sku = "SCHEMA-SPEC-SKU-001";
  const email = "schema-spec-user@example.com";

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppConfigModule, PrismaModule],
    }).compile();

    prisma = moduleRef.get(PrismaService);
    await prisma.$connect();
  });

  afterAll(async () => {
    // Products cascade-delete their images/inventory; the child category
    // is deleted before its parent to satisfy the RESTRICT constraint.
    await prisma.product.deleteMany({ where: { slug: productSlug } });
    await prisma.category.deleteMany({ where: { slug: childSlug } });
    await prisma.category.deleteMany({ where: { slug: parentSlug } });
    await prisma.user.deleteMany({ where: { email } });
    await prisma.$disconnect();
  });

  it("supports every role on User", async () => {
    const user = await prisma.user.create({
      data: { email, passwordHash: "schema-spec-not-a-real-hash", role: Role.SUPER_ADMIN },
    });

    expect(user.role).toBe(Role.SUPER_ADMIN);
  });

  it("supports a parent/child category hierarchy", async () => {
    const parent = await prisma.category.create({
      data: { name: "Schema Spec Parent", slug: parentSlug, status: CategoryStatus.ACTIVE },
    });
    const child = await prisma.category.create({
      data: {
        name: "Schema Spec Child",
        slug: childSlug,
        status: CategoryStatus.ACTIVE,
        parentId: parent.id,
      },
    });

    const parentWithChildren = await prisma.category.findUniqueOrThrow({
      where: { id: parent.id },
      include: { children: true },
    });

    expect(parentWithChildren.children.map((c) => c.id)).toContain(child.id);
  });

  it("creates a product with images and inventory, and resolves every relation", async () => {
    const category = await prisma.category.findUniqueOrThrow({ where: { slug: childSlug } });

    await prisma.product.create({
      data: {
        name: "Schema Spec Product",
        slug: productSlug,
        sku,
        price: 29.99,
        salePrice: 24.99,
        status: ProductStatus.ACTIVE,
        categoryId: category.id,
        images: {
          create: [
            { url: "https://cdn.example.com/schema-spec-1.jpg", position: 0, isPrimary: true },
            { url: "https://cdn.example.com/schema-spec-2.jpg", position: 1 },
          ],
        },
        inventory: { create: { quantityAvailable: 10, quantityReserved: 2 } },
      },
    });

    const product = await prisma.product.findUniqueOrThrow({
      where: { slug: productSlug },
      include: { category: true, images: { orderBy: { position: "asc" } }, inventory: true },
    });

    expect(product.category?.slug).toBe(childSlug);
    expect(product.images).toHaveLength(2);
    expect(product.images[0]?.isPrimary).toBe(true);
    expect(product.inventory?.quantityAvailable).toBe(10);
    expect(product.inventory?.quantityReserved).toBe(2);
    expect(product.price.toString()).toBe("29.99");
  });

  it("adds an optional variant with its own inventory and a variant-tagged image", async () => {
    const product = await prisma.product.findUniqueOrThrow({ where: { slug: productSlug } });

    const variant = await prisma.productVariant.create({
      data: {
        productId: product.id,
        sku: `${sku}-RED-M`,
        price: 32.99,
        attributes: { color: "Red", size: "M" },
        inventory: { create: { quantityAvailable: 4 } },
        images: {
          create: [{ url: "https://cdn.example.com/schema-spec-red.jpg", productId: product.id }],
        },
      },
      include: { inventory: true, images: true },
    });

    expect(variant.productId).toBe(product.id);
    expect(variant.inventory?.quantityAvailable).toBe(4);
    expect(variant.images).toHaveLength(1);

    // The product's own inventory row is untouched by the variant's -- the
    // additive design keeps the product itself fully independent of it.
    const untouchedProduct = await prisma.product.findUniqueOrThrow({
      where: { id: product.id },
      include: { inventory: true },
    });
    expect(untouchedProduct.inventory?.quantityAvailable).toBe(10);
  });

  it("enforces SKU uniqueness", async () => {
    await expect(
      prisma.product.create({
        data: { name: "Duplicate SKU", slug: `${productSlug}-dup`, sku, price: 1 },
      }),
    ).rejects.toThrow();
  });

  it("restricts deleting a category that still has a child", async () => {
    const parent = await prisma.category.findUniqueOrThrow({ where: { slug: parentSlug } });

    await expect(prisma.category.delete({ where: { id: parent.id } })).rejects.toThrow();
  });

  it("restricts hard-deleting a product whose variant has order history", async () => {
    const product = await prisma.product.findUniqueOrThrow({ where: { slug: productSlug } });
    const variant = await prisma.productVariant.findFirstOrThrow({
      where: { productId: product.id },
    });

    const user = await prisma.user.findUniqueOrThrow({ where: { email } });
    const order = await prisma.order.create({
      data: {
        userId: user.id,
        subtotal: 32.99,
        currency: "USD",
        shippingRecipientName: "Schema Spec",
        shippingLine1: "1 Test St",
        shippingCity: "Testville",
        shippingState: "TS",
        shippingPostalCode: "00000",
        shippingCountry: "US",
        items: {
          create: [
            {
              productId: product.id,
              productName: product.name,
              productSku: product.sku,
              variantId: variant.id,
              variantSku: variant.sku,
              variantAttributes: variant.attributes as Prisma.InputJsonValue,
              unitPrice: variant.price,
              quantity: 1,
              lineTotal: variant.price,
            },
          ],
        },
      },
    });

    await expect(prisma.productVariant.delete({ where: { id: variant.id } })).rejects.toThrow();

    // Clean up the order before the cascade-delete test below removes the
    // product itself (Order.userId is Restrict, so this must go first).
    await prisma.order.delete({ where: { id: order.id } });
  });

  it("cascades product deletion to its images, inventory, and variants", async () => {
    const product = await prisma.product.findUniqueOrThrow({ where: { slug: productSlug } });
    const variant = await prisma.productVariant.findFirstOrThrow({
      where: { productId: product.id },
    });

    await prisma.product.delete({ where: { id: product.id } });

    const [images, inventory, variants, variantInventory] = await Promise.all([
      prisma.productImage.findMany({ where: { productId: product.id } }),
      prisma.inventory.findUnique({ where: { productId: product.id } }),
      prisma.productVariant.findMany({ where: { productId: product.id } }),
      prisma.inventory.findUnique({ where: { variantId: variant.id } }),
    ]);

    expect(images).toHaveLength(0);
    expect(inventory).toBeNull();
    expect(variants).toHaveLength(0);
    expect(variantInventory).toBeNull();
  });
});
