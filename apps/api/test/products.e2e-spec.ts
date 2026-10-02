import { VersioningType, type INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import cookieParser from "cookie-parser";
import { ZodValidationPipe } from "nestjs-zod";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "../src/app.module";
import { HttpExceptionFilter } from "../src/common/filters/http-exception.filter";
import { ResponseEnvelopeInterceptor } from "../src/common/interceptors/response-envelope.interceptor";
import { PrismaService } from "../src/prisma/prisma.service";

// Requires a reachable PostgreSQL with all migrations applied and the dev
// seed run (admin@example.com / customer@example.com, password
// "dev-password-123" -- see prisma/seed.ts).
describe("Products (e2e)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let adminCookies: string[];
  let customerCookies: string[];

  const RUN_ID = Date.now();
  const slug = `prod-spec-${RUN_ID}`;
  const sku = `PROD-SPEC-${RUN_ID}`;
  let productId: string;

  function extractCookies(res: request.Response): string[] {
    const raw: unknown = res.headers["set-cookie"];
    return Array.isArray(raw) ? raw : typeof raw === "string" ? [raw] : [];
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix("api");
    app.enableVersioning({ type: VersioningType.URI, defaultVersion: "1" });
    app.use(cookieParser());
    app.useGlobalPipes(new ZodValidationPipe());
    app.useGlobalInterceptors(new ResponseEnvelopeInterceptor());
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();

    prisma = app.get(PrismaService);

    const adminLogin = await request(app.getHttpServer())
      .post("/api/v1/auth/login")
      .send({ email: "admin@example.com", password: "dev-password-123" })
      .expect(200);
    adminCookies = extractCookies(adminLogin);

    const customerLogin = await request(app.getHttpServer())
      .post("/api/v1/auth/login")
      .send({ email: "customer@example.com", password: "dev-password-123" })
      .expect(200);
    customerCookies = extractCookies(customerLogin);
  });

  afterAll(async () => {
    await prisma.product.deleteMany({ where: { slug } });
    await app.close();
  });

  describe("creation and validation", () => {
    it("rejects create for a CUSTOMER", async () => {
      await request(app.getHttpServer())
        .post("/api/v1/products")
        .set("Cookie", customerCookies)
        .send({ name: "Spec Product", slug, sku, price: "29.99" })
        .expect(403);
    });

    it("rejects a salePrice that is not less than price", async () => {
      await request(app.getHttpServer())
        .post("/api/v1/products")
        .set("Cookie", adminCookies)
        .send({ name: "Spec Product", slug, sku, price: "10.00", salePrice: "12.00" })
        .expect(400);
    });

    it("rejects a currency other than the store currency, so a cart can never mix currencies", async () => {
      const res = await request(app.getHttpServer())
        .post("/api/v1/products")
        .set("Cookie", adminCookies)
        .send({ name: "Spec Product", slug, sku, price: "10.00", currency: "EUR" })
        .expect(400);

      expect(res.body.error.details).toEqual([
        expect.objectContaining({ path: ["currency"], message: "Only USD is supported" }),
      ]);
    });

    it("ADMIN creates a product with initial images and stock", async () => {
      const res = await request(app.getHttpServer())
        .post("/api/v1/products")
        .set("Cookie", adminCookies)
        .send({
          name: "Spec Product",
          slug,
          sku,
          price: "29.99",
          salePrice: "24.99",
          status: "ACTIVE",
          initialQuantity: 15,
          images: [
            { url: "https://cdn.example.com/spec-a.jpg" },
            { url: "https://cdn.example.com/spec-b.jpg" },
          ],
        })
        .expect(201);

      productId = res.body.data.id as string;

      expect(res.body.data.price).toBe("29.99");
      expect(res.body.data.salePrice).toBe("24.99");
      expect(res.body.data.images).toHaveLength(2);
      expect(res.body.data.images[0].isPrimary).toBe(true);
      expect(res.body.data.inventory).toEqual({
        quantityAvailable: 15,
        quantityReserved: 0,
        version: 0,
      });
    });

    it("rejects a duplicate SKU with 409", async () => {
      await request(app.getHttpServer())
        .post("/api/v1/products")
        .set("Cookie", adminCookies)
        .send({ name: "Dup", slug: `${slug}-dup`, sku, price: "1.00" })
        .expect(409);
    });

    it("clears salePrice and description with null, even while lowering price below the old sale price", async () => {
      await request(app.getHttpServer())
        .patch(`/api/v1/products/${productId}`)
        .set("Cookie", adminCookies)
        .send({ description: "Soft cotton" })
        .expect(200);

      // Old sale price is 24.99; lowering price to 19.99 is only valid
      // because the sale price is being removed in the same update.
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/products/${productId}`)
        .set("Cookie", adminCookies)
        .send({ price: "19.99", salePrice: null, description: null })
        .expect(200);

      expect(res.body.data).toMatchObject({ price: "19.99", salePrice: null, description: null });
    });
  });

  describe("visibility", () => {
    it("public browsing sees the ACTIVE product", async () => {
      const res = await request(app.getHttpServer()).get(`/api/v1/products/${slug}`).expect(200);

      expect(res.body.data.id).toBe(productId);
    });

    it("archiving hides the product from public browsing but not from admins", async () => {
      await request(app.getHttpServer())
        .patch(`/api/v1/products/${productId}`)
        .set("Cookie", adminCookies)
        .send({ status: "DRAFT" })
        .expect(200);

      await request(app.getHttpServer()).get(`/api/v1/products/${slug}`).expect(404);

      const adminView = await request(app.getHttpServer())
        .get(`/api/v1/products/${slug}`)
        .set("Cookie", adminCookies)
        .expect(200);
      expect(adminView.body.data.status).toBe("DRAFT");

      // restore to ACTIVE for the remaining tests
      await request(app.getHttpServer())
        .patch(`/api/v1/products/${productId}`)
        .set("Cookie", adminCookies)
        .send({ status: "ACTIVE" })
        .expect(200);
    });

    it("a CUSTOMER-supplied status filter cannot leak an actually-DRAFT product", async () => {
      await request(app.getHttpServer())
        .patch(`/api/v1/products/${productId}`)
        .set("Cookie", adminCookies)
        .send({ status: "DRAFT" })
        .expect(200);

      const res = await request(app.getHttpServer())
        .get("/api/v1/products")
        .set("Cookie", customerCookies)
        .query({ status: "DRAFT" })
        .expect(200);

      expect(res.body.data.items.some((item: { id: string }) => item.id === productId)).toBe(false);

      // admin, on the other hand, can use the same filter to find it
      const adminRes = await request(app.getHttpServer())
        .get("/api/v1/products")
        .set("Cookie", adminCookies)
        .query({ status: "DRAFT" })
        .expect(200);
      expect(adminRes.body.data.items.some((item: { id: string }) => item.id === productId)).toBe(
        true,
      );

      // restore to ACTIVE for the remaining tests
      await request(app.getHttpServer())
        .patch(`/api/v1/products/${productId}`)
        .set("Cookie", adminCookies)
        .send({ status: "ACTIVE" })
        .expect(200);
    });

    it("search finds the product by (partial, case-insensitive) name", async () => {
      const res = await request(app.getHttpServer())
        .get("/api/v1/products")
        .query({ search: "spec product" })
        .expect(200);

      expect(res.body.data.items.some((item: { id: string }) => item.id === productId)).toBe(true);
    });
  });

  describe("images", () => {
    let secondImageId: string;

    it("adding a new primary image demotes the previous primary", async () => {
      const added = await request(app.getHttpServer())
        .post(`/api/v1/products/${productId}/images`)
        .set("Cookie", adminCookies)
        .send({ url: "https://cdn.example.com/spec-c.jpg", isPrimary: true })
        .expect(201);

      secondImageId = added.body.data.id as string;

      const product = await request(app.getHttpServer()).get(`/api/v1/products/${slug}`);
      const primaryImages = product.body.data.images.filter(
        (image: { isPrimary: boolean }) => image.isPrimary,
      );
      expect(primaryImages).toHaveLength(1);
      expect(primaryImages[0].id).toBe(secondImageId);
    });

    it("clears an image's alt text with null", async () => {
      await request(app.getHttpServer())
        .patch(`/api/v1/products/${productId}/images/${secondImageId}`)
        .set("Cookie", adminCookies)
        .send({ altText: "Front view" })
        .expect(200);

      const res = await request(app.getHttpServer())
        .patch(`/api/v1/products/${productId}/images/${secondImageId}`)
        .set("Cookie", adminCookies)
        .send({ altText: null })
        .expect(200);

      expect(res.body.data.altText).toBeNull();
    });

    it("rejects write access to images for a CUSTOMER", async () => {
      await request(app.getHttpServer())
        .delete(`/api/v1/products/${productId}/images/${secondImageId}`)
        .set("Cookie", customerCookies)
        .expect(403);
    });

    it("removes an image", async () => {
      await request(app.getHttpServer())
        .delete(`/api/v1/products/${productId}/images/${secondImageId}`)
        .set("Cookie", adminCookies)
        .expect(200);

      const product = await request(app.getHttpServer()).get(`/api/v1/products/${slug}`);
      expect(
        product.body.data.images.some((image: { id: string }) => image.id === secondImageId),
      ).toBe(false);
    });
  });

  describe("inventory", () => {
    it("CUSTOMER cannot read inventory", async () => {
      await request(app.getHttpServer())
        .get(`/api/v1/products/${productId}/inventory`)
        .set("Cookie", customerCookies)
        .expect(403);
    });

    it("ADMIN adjusts stock with the current version", async () => {
      const before = await request(app.getHttpServer())
        .get(`/api/v1/products/${productId}/inventory`)
        .set("Cookie", adminCookies)
        .expect(200);

      const adjusted = await request(app.getHttpServer())
        .patch(`/api/v1/products/${productId}/inventory`)
        .set("Cookie", adminCookies)
        .send({ quantityAvailable: 12, version: before.body.data.version })
        .expect(200);

      expect(adjusted.body.data).toEqual({
        quantityAvailable: 12,
        quantityReserved: 0,
        version: before.body.data.version + 1,
      });
    });

    it("rejects a stale version with 409 (optimistic concurrency)", async () => {
      const current = await request(app.getHttpServer())
        .get(`/api/v1/products/${productId}/inventory`)
        .set("Cookie", adminCookies);
      const staleVersion = current.body.data.version - 1;

      await request(app.getHttpServer())
        .patch(`/api/v1/products/${productId}/inventory`)
        .set("Cookie", adminCookies)
        .send({ quantityAvailable: 99, version: staleVersion })
        .expect(409);

      // confirm the rejected write had no effect
      const after = await request(app.getHttpServer())
        .get(`/api/v1/products/${productId}/inventory`)
        .set("Cookie", adminCookies);
      expect(after.body.data.quantityAvailable).not.toBe(99);
    });
  });

  describe("variants", () => {
    let variantId: string;

    it("rejects write access for a CUSTOMER", async () => {
      await request(app.getHttpServer())
        .post(`/api/v1/products/${productId}/variants`)
        .set("Cookie", customerCookies)
        .send({ sku: `${sku}-RED-M`, price: "29.99", attributes: { color: "Red", size: "M" } })
        .expect(403);
    });

    it("ADMIN creates a variant with its own SKU, price, and stock", async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/products/${productId}/variants`)
        .set("Cookie", adminCookies)
        .send({
          sku: `${sku}-RED-M`,
          price: "29.99",
          attributes: { color: "Red", size: "M" },
          initialQuantity: 4,
        })
        .expect(201);

      variantId = res.body.data.id as string;

      expect(res.body.data.price).toBe("29.99");
      expect(res.body.data.attributes).toEqual({ color: "Red", size: "M" });
      expect(res.body.data.inventory).toEqual({
        quantityAvailable: 4,
        quantityReserved: 0,
        version: 0,
      });

      const product = await request(app.getHttpServer()).get(`/api/v1/products/${slug}`);
      expect(product.body.data.variants).toHaveLength(1);
      expect(product.body.data.variants[0].id).toBe(variantId);
      // The variant is additive -- it never overwrites the product's own sku/price.
      expect(product.body.data.sku).toBe(sku);
    });

    it("rejects a duplicate variant SKU with 409", async () => {
      await request(app.getHttpServer())
        .post(`/api/v1/products/${productId}/variants`)
        .set("Cookie", adminCookies)
        .send({ sku: `${sku}-RED-M`, price: "19.99", attributes: { color: "Blue" } })
        .expect(409);
    });

    it("ADMIN updates a variant", async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/products/${productId}/variants/${variantId}`)
        .set("Cookie", adminCookies)
        .send({ price: "27.99" })
        .expect(200);

      expect(res.body.data.price).toBe("27.99");
    });

    it("clears a variant's salePrice with null, even while lowering price below it", async () => {
      await request(app.getHttpServer())
        .patch(`/api/v1/products/${productId}/variants/${variantId}`)
        .set("Cookie", adminCookies)
        .send({ salePrice: "25.00" })
        .expect(200);

      const res = await request(app.getHttpServer())
        .patch(`/api/v1/products/${productId}/variants/${variantId}`)
        .set("Cookie", adminCookies)
        .send({ price: "20.00", salePrice: null })
        .expect(200);

      expect(res.body.data).toMatchObject({ price: "20.00", salePrice: null });
    });

    it("ADMIN adjusts the variant's own stock, independent of the product's", async () => {
      const before = await request(app.getHttpServer())
        .get(`/api/v1/products/${productId}/variants/${variantId}/inventory`)
        .set("Cookie", adminCookies)
        .expect(200);
      expect(before.body.data.quantityAvailable).toBe(4);

      const adjusted = await request(app.getHttpServer())
        .patch(`/api/v1/products/${productId}/variants/${variantId}/inventory`)
        .set("Cookie", adminCookies)
        .send({ quantityAvailable: 9, version: before.body.data.version })
        .expect(200);
      expect(adjusted.body.data.quantityAvailable).toBe(9);

      // The product's own inventory (set up in the "inventory" describe
      // block above) is untouched by adjusting the variant's.
      const productInventory = await request(app.getHttpServer())
        .get(`/api/v1/products/${productId}/inventory`)
        .set("Cookie", adminCookies)
        .expect(200);
      expect(productInventory.body.data.quantityAvailable).toBe(12);
    });

    it("rejects a hard delete of a variant that isn't archived", async () => {
      await request(app.getHttpServer())
        .delete(`/api/v1/products/${productId}/variants/${variantId}/permanent`)
        .set("Cookie", adminCookies)
        .expect(409);
    });

    it("archives, then permanently deletes the variant", async () => {
      const archived = await request(app.getHttpServer())
        .delete(`/api/v1/products/${productId}/variants/${variantId}`)
        .set("Cookie", adminCookies)
        .expect(200);
      expect(archived.body.data.status).toBe("ARCHIVED");

      await request(app.getHttpServer())
        .delete(`/api/v1/products/${productId}/variants/${variantId}/permanent`)
        .set("Cookie", adminCookies)
        .expect(200);

      const product = await request(app.getHttpServer()).get(`/api/v1/products/${slug}`);
      expect(product.body.data.variants.some((v: { id: string }) => v.id === variantId)).toBe(
        false,
      );
    });
  });

  describe("deletion", () => {
    it("rejects a hard delete while the product is still ACTIVE", async () => {
      await request(app.getHttpServer())
        .delete(`/api/v1/products/${productId}/permanent`)
        .set("Cookie", adminCookies)
        .expect(409);
    });

    it("rejects a hard delete for a CUSTOMER", async () => {
      await request(app.getHttpServer())
        .delete(`/api/v1/products/${productId}/permanent`)
        .set("Cookie", customerCookies)
        .expect(403);
    });

    it("archives, then permanently deletes the product", async () => {
      await request(app.getHttpServer())
        .delete(`/api/v1/products/${productId}`)
        .set("Cookie", adminCookies)
        .expect(200);

      await request(app.getHttpServer())
        .delete(`/api/v1/products/${productId}/permanent`)
        .set("Cookie", adminCookies)
        .expect(200);

      await request(app.getHttpServer())
        .get(`/api/v1/products/${slug}`)
        .set("Cookie", adminCookies)
        .expect(404);
    });
  });
});
