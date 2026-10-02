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
describe("Cart (e2e)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let adminCookies: string[];

  const RUN_ID = Date.now();
  const slug = `cart-spec-${RUN_ID}`;
  const sku = `CART-SPEC-${RUN_ID}`;
  let productId: string;
  let variantId: string;

  function extractCookies(res: request.Response): string[] {
    const raw: unknown = res.headers["set-cookie"];
    return Array.isArray(raw) ? raw : typeof raw === "string" ? [raw] : [];
  }

  function cookieMap(cookies: string[]): Record<string, string> {
    const map: Record<string, string> = {};
    for (const cookie of cookies) {
      const [pair] = cookie.split(";");
      const [name, value] = (pair ?? "").split("=");
      if (name && value !== undefined) map[name] = value;
    }
    return map;
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
        name: "Cart Spec Product",
        slug,
        sku,
        price: "10.00",
        status: "ACTIVE",
        initialQuantity: 3,
      })
      .expect(201);
    productId = product.body.data.id as string;

    const variant = await request(app.getHttpServer())
      .post(`/api/v1/products/${productId}/variants`)
      .set("Cookie", adminCookies)
      .send({
        sku: `${sku}-RED`,
        price: "12.00",
        attributes: { color: "Red" },
        initialQuantity: 2,
      })
      .expect(201);
    variantId = variant.body.data.id as string;
  });

  afterAll(async () => {
    // Removes the empty guest carts left behind by this run (the user cart
    // from the merge test below is already gone via that user's own
    // afterAll, since Cart cascades on User deletion).
    await prisma.cart.deleteMany({ where: { items: { none: {} } } });
    await prisma.product.deleteMany({ where: { slug } });
    await app.close();
  });

  describe("guest cart", () => {
    it("GET /cart is empty and sets no cookie before anything is added", async () => {
      const res = await request(app.getHttpServer()).get("/api/v1/cart").expect(200);

      expect(res.body.data).toEqual({ id: null, items: [], subtotal: "0.00", currency: "USD" });
      expect(extractCookies(res)).toHaveLength(0);
    });

    it("adding an item creates a guest cart and sets a cookie", async () => {
      const res = await request(app.getHttpServer())
        .post("/api/v1/cart/items")
        .send({ productId, quantity: 2 })
        .expect(201);

      expect(res.body.data.items).toHaveLength(1);
      expect(res.body.data.items[0]).toMatchObject({
        productId,
        quantity: 2,
        unitPrice: "10.00",
        lineTotal: "20.00",
      });
      expect(res.body.data.subtotal).toBe("20.00");

      const cookies = extractCookies(res);
      expect(cookies.some((c) => c.startsWith("guest_cart_token="))).toBe(true);
      expect(cookies.every((c) => /HttpOnly/i.test(c))).toBe(true);
    });

    it("the same guest cookie sees the same cart on a later request", async () => {
      const added = await request(app.getHttpServer())
        .post("/api/v1/cart/items")
        .send({ productId, quantity: 1 });
      const cookies = extractCookies(added);

      const res = await request(app.getHttpServer())
        .get("/api/v1/cart")
        .set("Cookie", cookies)
        .expect(200);

      expect(res.body.data.items[0].quantity).toBe(1);
    });

    it("a different guest (no cookie) does not see another guest's cart", async () => {
      const first = await request(app.getHttpServer())
        .post("/api/v1/cart/items")
        .send({ productId, quantity: 1 });
      expect(first.body.data.items).toHaveLength(1);

      const second = await request(app.getHttpServer()).get("/api/v1/cart").expect(200);
      expect(second.body.data).toEqual({ id: null, items: [], subtotal: "0.00", currency: "USD" });
    });

    it("adding the same product again increases the existing line's quantity", async () => {
      const first = await request(app.getHttpServer())
        .post("/api/v1/cart/items")
        .send({ productId, quantity: 1 });
      const cookies = extractCookies(first);

      const second = await request(app.getHttpServer())
        .post("/api/v1/cart/items")
        .set("Cookie", cookies)
        .send({ productId, quantity: 1 })
        .expect(201);

      expect(second.body.data.items).toHaveLength(1);
      expect(second.body.data.items[0].quantity).toBe(2);
    });

    it("rejects adding more than the available stock", async () => {
      await request(app.getHttpServer())
        .post("/api/v1/cart/items")
        .send({ productId, quantity: 99 })
        .expect(400);
    });

    it("updates and then removes an item", async () => {
      const added = await request(app.getHttpServer())
        .post("/api/v1/cart/items")
        .send({ productId, quantity: 1 });
      const cookies = extractCookies(added);

      const updated = await request(app.getHttpServer())
        .patch(`/api/v1/cart/items/${productId}`)
        .set("Cookie", cookies)
        .send({ quantity: 3 })
        .expect(200);
      expect(updated.body.data.items[0].quantity).toBe(3);

      const removed = await request(app.getHttpServer())
        .delete(`/api/v1/cart/items/${productId}`)
        .set("Cookie", cookies)
        .expect(200);
      expect(removed.body.data.items).toHaveLength(0);
    });

    it("404s updating an item that was never added", async () => {
      await request(app.getHttpServer())
        .patch(`/api/v1/cart/items/${productId}`)
        .send({ quantity: 1 })
        .expect(404);
    });

    it("clear is idempotent and empties the cart", async () => {
      const added = await request(app.getHttpServer())
        .post("/api/v1/cart/items")
        .send({ productId, quantity: 1 });
      const cookies = extractCookies(added);

      await request(app.getHttpServer()).delete("/api/v1/cart").set("Cookie", cookies).expect(200);
      await request(app.getHttpServer()).delete("/api/v1/cart").set("Cookie", cookies).expect(200);

      const res = await request(app.getHttpServer())
        .get("/api/v1/cart")
        .set("Cookie", cookies)
        .expect(200);
      expect(res.body.data.items).toHaveLength(0);
    });
  });

  describe("variants", () => {
    it("a variant line is distinct from the product's plain (no-variant) line", async () => {
      const plain = await request(app.getHttpServer())
        .post("/api/v1/cart/items")
        .send({ productId, quantity: 1 });
      const cookies = extractCookies(plain);

      const withVariant = await request(app.getHttpServer())
        .post("/api/v1/cart/items")
        .set("Cookie", cookies)
        .send({ productId, variantId, quantity: 1 })
        .expect(201);

      expect(withVariant.body.data.items).toHaveLength(2);
      const variantLine = withVariant.body.data.items.find(
        (item: { variantId: string | null }) => item.variantId === variantId,
      );
      expect(variantLine).toMatchObject({
        productId,
        variantId,
        quantity: 1,
        unitPrice: "12.00",
      });
    });

    it("caps quantity by the variant's own stock, not the product's", async () => {
      // Product has 3 available; the variant only has 2.
      await request(app.getHttpServer())
        .post("/api/v1/cart/items")
        .send({ productId, variantId, quantity: 3 })
        .expect(400);
    });

    it("rejects an unknown variantId for the product", async () => {
      await request(app.getHttpServer())
        .post("/api/v1/cart/items")
        .send({ productId, variantId: "00000000-0000-0000-0000-000000000000", quantity: 1 })
        .expect(404);
    });

    it("updates and removes the specific variant line via ?variantId=", async () => {
      const added = await request(app.getHttpServer())
        .post("/api/v1/cart/items")
        .send({ productId, variantId, quantity: 1 });
      const cookies = extractCookies(added);
      await request(app.getHttpServer())
        .post("/api/v1/cart/items")
        .set("Cookie", cookies)
        .send({ productId, quantity: 1 }); // also add the no-variant line

      const updated = await request(app.getHttpServer())
        .patch(`/api/v1/cart/items/${productId}`)
        .query({ variantId })
        .set("Cookie", cookies)
        .send({ quantity: 2 })
        .expect(200);
      const updatedVariantLine = updated.body.data.items.find(
        (item: { variantId: string | null }) => item.variantId === variantId,
      );
      expect(updatedVariantLine.quantity).toBe(2);
      const untouchedPlainLine = updated.body.data.items.find(
        (item: { variantId: string | null }) => item.variantId === null,
      );
      expect(untouchedPlainLine.quantity).toBe(1);

      const removed = await request(app.getHttpServer())
        .delete(`/api/v1/cart/items/${productId}`)
        .query({ variantId })
        .set("Cookie", cookies)
        .expect(200);
      expect(
        removed.body.data.items.some(
          (item: { variantId: string | null }) => item.variantId === variantId,
        ),
      ).toBe(false);
      expect(removed.body.data.items).toHaveLength(1);
    });
  });

  describe("logged-in cart and guest-to-user merge", () => {
    const email = `cart-spec-customer-${RUN_ID}@example.com`;
    const password = "correct horse battery staple";

    afterAll(async () => {
      await prisma.user.deleteMany({ where: { email } });
    });

    it("a guest cart (including a variant line) is merged into the account on register", async () => {
      const guestAdd = await request(app.getHttpServer())
        .post("/api/v1/cart/items")
        .send({ productId, quantity: 2 });
      const guestCookies = extractCookies(guestAdd);
      await request(app.getHttpServer())
        .post("/api/v1/cart/items")
        .set("Cookie", guestCookies)
        .send({ productId, variantId, quantity: 1 });

      const registered = await request(app.getHttpServer())
        .post("/api/v1/auth/register")
        .set("Cookie", guestCookies)
        .send({ email, password })
        .expect(201);
      const userCookies = extractCookies(registered);

      // the guest cookie is cleared on merge
      expect(cookieMap(userCookies).guest_cart_token).toBe("");

      const cart = await request(app.getHttpServer())
        .get("/api/v1/cart")
        .set("Cookie", userCookies)
        .expect(200);
      expect(cart.body.data.items).toHaveLength(2);
      expect(cart.body.data.items).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ productId, variantId: null, quantity: 2 }),
          expect.objectContaining({ productId, variantId, quantity: 1 }),
        ]),
      );
    });

    it("the merged cart persists across a fresh login (tied to the account, not a cookie)", async () => {
      const login = await request(app.getHttpServer())
        .post("/api/v1/auth/login")
        .send({ email, password })
        .expect(200);
      const cookies = extractCookies(login);

      const cart = await request(app.getHttpServer())
        .get("/api/v1/cart")
        .set("Cookie", cookies)
        .expect(200);
      expect(cart.body.data.items).toHaveLength(2);
      expect(
        cart.body.data.items.some(
          (item: { variantId: string | null; quantity: number }) =>
            item.variantId === null && item.quantity === 2,
        ),
      ).toBe(true);
    });

    it("logging in with no guest cookie does not disturb the existing account cart", async () => {
      const login = await request(app.getHttpServer())
        .post("/api/v1/auth/login")
        .send({ email, password })
        .expect(200);
      const cookies = extractCookies(login);

      const cart = await request(app.getHttpServer())
        .get("/api/v1/cart")
        .set("Cookie", cookies)
        .expect(200);
      expect(cart.body.data.items).toHaveLength(2);
    });
  });

  // The future React Native app has no cookie jar: like auth tokens, its
  // guest-cart token travels in the JSON body (out) and a request header
  // (back in), selected by X-Client-Platform: mobile.
  describe("mobile guest cart (no cookies)", () => {
    const email = `cart-spec-mobile-${RUN_ID}@example.com`;
    const password = "correct horse battery staple";
    let guestCartToken: string;

    afterAll(async () => {
      await prisma.user.deleteMany({ where: { email } });
    });

    it("returns the guest cart token in the body for a mobile client", async () => {
      const res = await request(app.getHttpServer())
        .post("/api/v1/cart/items")
        .set("X-Client-Platform", "mobile")
        .send({ productId, quantity: 1 })
        .expect(201);

      expect(res.body.data.guestCartToken).toEqual(expect.any(String));
      guestCartToken = res.body.data.guestCartToken as string;
    });

    it("identifies the same cart from the X-Guest-Cart-Token header on later requests", async () => {
      await request(app.getHttpServer())
        .patch(`/api/v1/cart/items/${productId}`)
        .set("X-Client-Platform", "mobile")
        .set("X-Guest-Cart-Token", guestCartToken)
        .send({ quantity: 3 })
        .expect(200);

      const cart = await request(app.getHttpServer())
        .get("/api/v1/cart")
        .set("X-Client-Platform", "mobile")
        .set("X-Guest-Cart-Token", guestCartToken)
        .expect(200);

      expect(cart.body.data.items).toEqual([
        expect.objectContaining({ productId, variantId: null, quantity: 3 }),
      ]);
      expect(cart.body.data.guestCartToken).toBe(guestCartToken);
    });

    it("never puts the token in the body for a web client (it stays in the httpOnly cookie)", async () => {
      const res = await request(app.getHttpServer())
        .post("/api/v1/cart/items")
        .send({ productId, quantity: 1 })
        .expect(201);

      expect(res.body.data).not.toHaveProperty("guestCartToken");
    });

    it("merges the guest cart into the account on mobile register via X-Guest-Cart-Token", async () => {
      const registered = await request(app.getHttpServer())
        .post("/api/v1/auth/register")
        .set("X-Client-Platform", "mobile")
        .set("X-Guest-Cart-Token", guestCartToken)
        .send({ email, password })
        .expect(201);
      const accessToken = registered.body.data.accessToken as string;

      const cart = await request(app.getHttpServer())
        .get("/api/v1/cart")
        .set("X-Client-Platform", "mobile")
        .set("Authorization", `Bearer ${accessToken}`)
        .expect(200);
      expect(cart.body.data.items).toEqual([
        expect.objectContaining({ productId, variantId: null, quantity: 3 }),
      ]);
      // A signed-in cart belongs to the account, so there is no guest token.
      expect(cart.body.data).not.toHaveProperty("guestCartToken");

      // The guest cart was consumed by the merge.
      const oldGuestCart = await request(app.getHttpServer())
        .get("/api/v1/cart")
        .set("X-Client-Platform", "mobile")
        .set("X-Guest-Cart-Token", guestCartToken)
        .expect(200);
      expect(oldGuestCart.body.data.items).toHaveLength(0);
    });
  });
});
