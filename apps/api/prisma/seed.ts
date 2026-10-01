import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { CategoryStatus, PrismaClient, ProductStatus, Role } from "@prisma/client";
import * as argon2 from "argon2";

/**
 * Small development dataset that exercises every relationship introduced
 * by the initial schema: one user per role, a parent/child category pair,
 * and a product with images + inventory. Not production/demo data -- keep
 * it minimal, and re-runnable (upserts, not inserts).
 */
const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

// Dev-only placeholder password for every seeded user -- never a real
// credential, and never used outside a local/dev database.
const DEV_PASSWORD = "dev-password-123";

async function main(): Promise<void> {
  const passwordHash = await argon2.hash(DEV_PASSWORD, { type: argon2.argon2id });

  await Promise.all([
    prisma.user.upsert({
      where: { email: "customer@example.com" },
      update: {},
      create: { email: "customer@example.com", passwordHash, role: Role.CUSTOMER },
    }),
    prisma.user.upsert({
      where: { email: "admin@example.com" },
      update: {},
      create: { email: "admin@example.com", passwordHash, role: Role.ADMIN },
    }),
    prisma.user.upsert({
      where: { email: "superadmin@example.com" },
      update: {},
      create: { email: "superadmin@example.com", passwordHash, role: Role.SUPER_ADMIN },
    }),
  ]);

  const apparel = await prisma.category.upsert({
    where: { slug: "apparel" },
    update: {},
    create: { name: "Apparel", slug: "apparel", status: CategoryStatus.ACTIVE },
  });

  const shirts = await prisma.category.upsert({
    where: { slug: "shirts" },
    update: {},
    create: {
      name: "Shirts",
      slug: "shirts",
      status: CategoryStatus.ACTIVE,
      parentId: apparel.id,
    },
  });

  const product = await prisma.product.upsert({
    where: { slug: "classic-tee" },
    update: {},
    create: {
      name: "Classic Tee",
      slug: "classic-tee",
      description: "A classic crew-neck t-shirt.",
      sku: "TSHIRT-CLASSIC-001",
      price: 24.99,
      salePrice: 19.99,
      currency: "USD",
      status: ProductStatus.ACTIVE,
      categoryId: shirts.id,
      images: {
        create: [
          {
            url: "https://cdn.example.com/products/classic-tee-front.jpg",
            altText: "Classic Tee, front view",
            position: 0,
            isPrimary: true,
          },
          {
            url: "https://cdn.example.com/products/classic-tee-back.jpg",
            altText: "Classic Tee, back view",
            position: 1,
          },
        ],
      },
      inventory: {
        create: { quantityAvailable: 100, quantityReserved: 0 },
      },
    },
  });

  const [userCount, categoryCount, productCount] = await Promise.all([
    prisma.user.count(),
    prisma.category.count(),
    prisma.product.count(),
  ]);

  console.log(
    `Seeded ${userCount} user(s), ${categoryCount} categor${categoryCount === 1 ? "y" : "ies"}, ${productCount} product(s). ` +
      `Sample product: ${product.slug}. Every seeded user's password is "${DEV_PASSWORD}".`,
  );
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
