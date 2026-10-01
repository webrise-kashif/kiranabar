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
describe("Orders (e2e)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let adminCookies: string[];

  const RUN_ID = Date.now();
  const slug = `order-spec-${RUN_ID}`;
  const sku = `ORDER-SPEC-${RUN_ID}`;
  const emailA = `order-spec-a-${RUN_ID}@example.com`;
  const emailB = `order-spec-b-${RUN_ID}@example.com`;
  const emailC = `order-spec-c-${RUN_ID}@example.com`;
  const emailD = `order-spec-d-${RUN_ID}@example.com`;
  const password = "correct horse battery staple";

  let productId: string;
  let variantId: string;
  let userACookies: string[];
  let userBCookies: string[];

  const SHIPPING_ADDRESS = {
    recipientName: "Jane Doe",
    line1: "123 Main St",
    city: "Springfield",
    state: "IL",
    postalCode: "62704",
    country: "US",
  };

  function extractCookies(res: request.Response): string[] {
    const raw: unknown = res.headers["set-cookie"];
    return Array.isArray(raw) ? raw : typeof raw === "string" ? [raw] : [];
  }

  async function registerAndLogin(email: string): Promise<string[]> {
    const registered = await request(app.getHttpServer())
      .post("/api/v1/auth/register")
      .send({ email, password })
      .expect(201);
    return extractCookies(registered);
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

    const product = await request(app.getHttpServer())
      .post("/api/v1/products")
      .set("Cookie", adminCookies)
      .send({
        name: "Order Spec Product",
        slug,
        sku,
        price: "15.00",
        status: "ACTIVE",
        initialQuantity: 10,
      })
      .expect(201);
    productId = product.body.data.id as string;

    const variant = await request(app.getHttpServer())
      .post(`/api/v1/products/${productId}/variants`)
      .set("Cookie", adminCookies)
      .send({
        sku: `${sku}-RED`,
        price: "18.00",
        attributes: { color: "Red" },
        initialQuantity: 4,
      })
      .expect(201);
    variantId = variant.body.data.id as string;

    userACookies = await registerAndLogin(emailA);
    userBCookies = await registerAndLogin(emailB);
  });

  afterAll(async () => {
    await prisma.order.deleteMany({
      where: { user: { email: { in: [emailA, emailB, emailC, emailD] } } },
    });
    await prisma.cart.deleteMany({
      where: { user: { email: { in: [emailA, emailB, emailC, emailD] } } },
    });
    await prisma.user.deleteMany({ where: { email: { in: [emailA, emailB, emailC, emailD] } } });
    await prisma.product.deleteMany({ where: { slug } });
    await app.close();
  });

  async function getInventory(): Promise<{ quantityAvailable: number; version: number }> {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/products/${productId}/inventory`)
      .set("Cookie", adminCookies)
      .expect(200);
    return res.body.data;
  }

  async function getVariantInventory(): Promise<{ quantityAvailable: number; version: number }> {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/products/${productId}/variants/${variantId}/inventory`)
      .set("Cookie", adminCookies)
      .expect(200);
    return res.body.data;
  }

  it("rejects checkout when not authenticated", async () => {
    await request(app.getHttpServer())
      .post("/api/v1/orders/checkout")
      .send({ shippingAddress: SHIPPING_ADDRESS })
      .expect(401);
  });

  it("rejects checkout with an empty cart", async () => {
    await request(app.getHttpServer())
      .post("/api/v1/orders/checkout")
      .set("Cookie", userACookies)
      .send({ shippingAddress: SHIPPING_ADDRESS })
      .expect(400);
  });

  let orderId: string;

  it("checks out the cart into an order, decrements stock, and clears the cart", async () => {
    await request(app.getHttpServer())
      .post("/api/v1/cart/items")
      .set("Cookie", userACookies)
      .send({ productId, quantity: 3 })
      .expect(201);

    const before = await getInventory();
    expect(before.quantityAvailable).toBe(10);

    const checkout = await request(app.getHttpServer())
      .post("/api/v1/orders/checkout")
      .set("Cookie", userACookies)
      .send({ shippingAddress: SHIPPING_ADDRESS })
      .expect(201);

    orderId = checkout.body.data.id as string;
    expect(checkout.body.data.status).toBe("PLACED");
    expect(checkout.body.data.subtotal).toBe("45.00");
    expect(checkout.body.data.currency).toBe("USD");
    expect(checkout.body.data.items).toEqual([
      expect.objectContaining({
        productId,
        productSku: sku,
        unitPrice: "15.00",
        quantity: 3,
        lineTotal: "45.00",
      }),
    ]);
    expect(checkout.body.data.shippingAddress).toMatchObject({
      recipientName: "Jane Doe",
      city: "Springfield",
      country: "US",
      line2: null,
      phone: null,
    });

    const cart = await request(app.getHttpServer())
      .get("/api/v1/cart")
      .set("Cookie", userACookies)
      .expect(200);
    expect(cart.body.data.items).toHaveLength(0);

    const after = await getInventory();
    expect(after.quantityAvailable).toBe(7);
    expect(after.version).toBe(before.version + 1);
  });

  it("lists the order for its owner and returns it by id", async () => {
    const list = await request(app.getHttpServer())
      .get("/api/v1/orders")
      .set("Cookie", userACookies)
      .expect(200);
    expect(list.body.data.items.map((o: { id: string }) => o.id)).toContain(orderId);
    expect(list.body.data.total).toBeGreaterThanOrEqual(1);

    const found = await request(app.getHttpServer())
      .get(`/api/v1/orders/${orderId}`)
      .set("Cookie", userACookies)
      .expect(200);
    expect(found.body.data.id).toBe(orderId);
  });

  it("does not let a different user see or fetch another user's order", async () => {
    const list = await request(app.getHttpServer())
      .get("/api/v1/orders")
      .set("Cookie", userBCookies)
      .expect(200);
    expect(list.body.data.items.map((o: { id: string }) => o.id)).not.toContain(orderId);

    await request(app.getHttpServer())
      .get(`/api/v1/orders/${orderId}`)
      .set("Cookie", userBCookies)
      .expect(404);

    await request(app.getHttpServer())
      .patch(`/api/v1/orders/${orderId}/cancel`)
      .set("Cookie", userBCookies)
      .expect(404);
  });

  it("blocks a hard delete of a product referenced by an order (RESTRICT)", async () => {
    await expect(prisma.product.delete({ where: { id: productId } })).rejects.toThrow();
  });

  it("cancels a PLACED order and restores stock", async () => {
    const before = await getInventory();

    const cancelled = await request(app.getHttpServer())
      .patch(`/api/v1/orders/${orderId}/cancel`)
      .set("Cookie", userACookies)
      .expect(200);
    expect(cancelled.body.data.status).toBe("CANCELLED");

    const after = await getInventory();
    expect(after.quantityAvailable).toBe(before.quantityAvailable + 3);
  });

  it("rejects cancelling an order that is no longer PLACED", async () => {
    // Already cancelled by the previous test -- cancel is only valid from PLACED.
    await request(app.getHttpServer())
      .patch(`/api/v1/orders/${orderId}/cancel`)
      .set("Cookie", userACookies)
      .expect(403);
  });

  let secondOrderId: string;

  it("rejects cancelling an order that has moved on to PAID", async () => {
    await request(app.getHttpServer())
      .post("/api/v1/cart/items")
      .set("Cookie", userACookies)
      .send({ productId, quantity: 1 })
      .expect(201);

    const checkout = await request(app.getHttpServer())
      .post("/api/v1/orders/checkout")
      .set("Cookie", userACookies)
      .send({ shippingAddress: SHIPPING_ADDRESS })
      .expect(201);
    secondOrderId = checkout.body.data.id as string;

    await request(app.getHttpServer())
      .patch(`/api/v1/orders/${secondOrderId}/status`)
      .set("Cookie", adminCookies)
      .send({ status: "PAID" })
      .expect(200);

    await request(app.getHttpServer())
      .patch(`/api/v1/orders/${secondOrderId}/cancel`)
      .set("Cookie", userACookies)
      .expect(403);
  });

  it("restores stock exactly once when the same order is cancelled concurrently", async () => {
    const userCCookies = await registerAndLogin(emailC);

    await request(app.getHttpServer())
      .post("/api/v1/cart/items")
      .set("Cookie", userCCookies)
      .send({ productId, quantity: 2 })
      .expect(201);

    const checkout = await request(app.getHttpServer())
      .post("/api/v1/orders/checkout")
      .set("Cookie", userCCookies)
      .send({ shippingAddress: SHIPPING_ADDRESS })
      .expect(201);
    const raceOrderId = checkout.body.data.id as string;

    const before = await getInventory();

    const responses = await Promise.all(
      Array.from({ length: 5 }, () =>
        request(app.getHttpServer())
          .patch(`/api/v1/orders/${raceOrderId}/cancel`)
          .set("Cookie", userCCookies),
      ),
    );

    const statuses = responses.map((res) => res.status).sort();
    expect(statuses).toEqual([200, 403, 403, 403, 403]);

    const after = await getInventory();
    expect(after.quantityAvailable).toBe(before.quantityAvailable + 2);
  });

  describe("variant checkout", () => {
    // Uses userB, whose cart/orders are otherwise untouched by the main
    // sequential flow above, to stay isolated from that flow's state.
    let variantOrderId: string;

    it("checks out a variant line, decrementing the variant's own stock (not the product's)", async () => {
      await request(app.getHttpServer())
        .post("/api/v1/cart/items")
        .set("Cookie", userBCookies)
        .send({ productId, variantId, quantity: 2 })
        .expect(201);

      const productBefore = await getInventory();
      const variantBefore = await getVariantInventory();
      expect(variantBefore.quantityAvailable).toBe(4);

      const checkout = await request(app.getHttpServer())
        .post("/api/v1/orders/checkout")
        .set("Cookie", userBCookies)
        .send({ shippingAddress: SHIPPING_ADDRESS })
        .expect(201);

      variantOrderId = checkout.body.data.id as string;
      expect(checkout.body.data.items).toEqual([
        expect.objectContaining({
          productId,
          productSku: sku,
          variantId,
          variantSku: `${sku}-RED`,
          variantAttributes: { color: "Red" },
          unitPrice: "18.00",
          quantity: 2,
          lineTotal: "36.00",
        }),
      ]);

      const productAfter = await getInventory();
      const variantAfter = await getVariantInventory();
      expect(variantAfter.quantityAvailable).toBe(2);
      // The product's own stock is untouched by a variant-line checkout.
      expect(productAfter.quantityAvailable).toBe(productBefore.quantityAvailable);
    });

    it("rejects adding more than the variant's remaining stock after the decrement above", async () => {
      await request(app.getHttpServer())
        .post("/api/v1/cart/items")
        .set("Cookie", userBCookies)
        .send({ productId, variantId, quantity: 3 }) // only 2 left
        .expect(400);
    });

    it("cancels the order and restores the variant's own stock", async () => {
      const before = await getVariantInventory();

      const cancelled = await request(app.getHttpServer())
        .patch(`/api/v1/orders/${variantOrderId}/cancel`)
        .set("Cookie", userBCookies)
        .expect(200);
      expect(cancelled.body.data.status).toBe("CANCELLED");

      const after = await getVariantInventory();
      expect(after.quantityAvailable).toBe(before.quantityAvailable + 2);
    });

    it("still blocks a hard delete of the variant (RESTRICT survives cancellation -- order history remains)", async () => {
      await expect(prisma.productVariant.delete({ where: { id: variantId } })).rejects.toThrow();
    });
  });

  describe("admin order management", () => {
    it("rejects a non-admin updating order status", async () => {
      await request(app.getHttpServer())
        .patch(`/api/v1/orders/${secondOrderId}/status`)
        .set("Cookie", userACookies)
        .send({ status: "SHIPPED" })
        .expect(403);
    });

    it("lists every order for an admin, and scopes to a single customer via ?userId", async () => {
      const all = await request(app.getHttpServer())
        .get("/api/v1/orders")
        .set("Cookie", adminCookies)
        .expect(200);
      const allIds: string[] = all.body.data.items.map((o: { id: string }) => o.id);
      expect(allIds).toContain(orderId);
      expect(allIds).toContain(secondOrderId);

      const users = await request(app.getHttpServer())
        .get("/api/v1/users")
        .set("Cookie", adminCookies)
        .query({ pageSize: 100 })
        .expect(200);
      const userA = users.body.data.items.find((u: { email: string }) => u.email === emailA) as {
        id: string;
      };
      const userB = users.body.data.items.find((u: { email: string }) => u.email === emailB) as {
        id: string;
      };

      const scopedToA = await request(app.getHttpServer())
        .get("/api/v1/orders")
        .set("Cookie", adminCookies)
        .query({ userId: userA.id })
        .expect(200);
      const scopedToAIds: string[] = scopedToA.body.data.items.map((o: { id: string }) => o.id);
      expect(scopedToAIds).toEqual(expect.arrayContaining([orderId, secondOrderId]));

      const scopedToB = await request(app.getHttpServer())
        .get("/api/v1/orders")
        .set("Cookie", adminCookies)
        .query({ userId: userB.id })
        .expect(200);
      // userB's only order is the one from the "variant checkout" block above --
      // neither of userA's orders should leak in when scoped to userB.
      const scopedToBIds: string[] = scopedToB.body.data.items.map((o: { id: string }) => o.id);
      expect(scopedToBIds).not.toEqual(expect.arrayContaining([orderId, secondOrderId]));
    });

    it("fetches any order by id for an admin, regardless of owner", async () => {
      const found = await request(app.getHttpServer())
        .get(`/api/v1/orders/${secondOrderId}`)
        .set("Cookie", adminCookies)
        .expect(200);
      expect(found.body.data.id).toBe(secondOrderId);
    });

    it("walks an order forward one stage at a time and rejects skipping a stage", async () => {
      await request(app.getHttpServer())
        .patch(`/api/v1/orders/${secondOrderId}/status`)
        .set("Cookie", adminCookies)
        .send({ status: "DELIVERED" })
        .expect(409); // currently PAID -- DELIVERED skips SHIPPED

      const shipped = await request(app.getHttpServer())
        .patch(`/api/v1/orders/${secondOrderId}/status`)
        .set("Cookie", adminCookies)
        .send({ status: "SHIPPED" })
        .expect(200);
      expect(shipped.body.data.status).toBe("SHIPPED");

      const delivered = await request(app.getHttpServer())
        .patch(`/api/v1/orders/${secondOrderId}/status`)
        .set("Cookie", adminCookies)
        .send({ status: "DELIVERED" })
        .expect(200);
      expect(delivered.body.data.status).toBe("DELIVERED");
    });

    it("rejects updating a terminal DELIVERED order any further", async () => {
      await request(app.getHttpServer())
        .patch(`/api/v1/orders/${secondOrderId}/status`)
        .set("Cookie", adminCookies)
        .send({ status: "PAID" })
        .expect(409);
    });

    it("rejects updating a CANCELLED order", async () => {
      await request(app.getHttpServer())
        .patch(`/api/v1/orders/${orderId}/status`)
        .set("Cookie", adminCookies)
        .send({ status: "PAID" })
        .expect(409);
    });

    describe("concurrent status changes", () => {
      let userDCookies: string[];

      beforeAll(async () => {
        userDCookies = await registerAndLogin(emailD);
      });

      async function placeOrder(quantity: number): Promise<string> {
        await request(app.getHttpServer())
          .post("/api/v1/cart/items")
          .set("Cookie", userDCookies)
          .send({ productId, quantity })
          .expect(201);
        const checkout = await request(app.getHttpServer())
          .post("/api/v1/orders/checkout")
          .set("Cookie", userDCookies)
          .send({ shippingAddress: SHIPPING_ADDRESS })
          .expect(201);
        return checkout.body.data.id as string;
      }

      function markPaid(id: string): request.Test {
        return request(app.getHttpServer())
          .patch(`/api/v1/orders/${id}/status`)
          .set("Cookie", adminCookies)
          .send({ status: "PAID" });
      }

      it("lets exactly one of several concurrent identical advances succeed", async () => {
        const raceOrderId = await placeOrder(1);

        const responses = await Promise.all(Array.from({ length: 5 }, () => markPaid(raceOrderId)));

        const statuses = responses.map((res) => res.status).sort();
        expect(statuses).toEqual([200, 409, 409, 409, 409]);
      });
    });
  });
});
