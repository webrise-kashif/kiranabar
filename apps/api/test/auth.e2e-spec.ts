import { VersioningType, type INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import cookieParser from "cookie-parser";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "../src/app.module";
import { HttpExceptionFilter } from "../src/common/filters/http-exception.filter";
import { ResponseEnvelopeInterceptor } from "../src/common/interceptors/response-envelope.interceptor";
import { RefreshTokenService } from "../src/auth/refresh-token.service";
import { PrismaService } from "../src/prisma/prisma.service";
import { ZodValidationPipe } from "nestjs-zod";

// Requires a reachable PostgreSQL with all migrations applied and the dev
// seed run (see docs/authentication.md and package.json's prisma:seed) --
// the SUPER_ADMIN-tier tests bootstrap through the seeded superadmin
// account, exactly the way a real deployment would provision its first
// elevated account.
describe("Auth (e2e)", () => {
  let app: INestApplication;
  let prisma: PrismaService;

  const RUN_ID = Date.now();
  const customerEmail = `auth-spec-customer-${RUN_ID}@example.com`;
  const adminCandidateEmail = `auth-spec-admin-${RUN_ID}@example.com`;
  const password = "correct horse battery staple";

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
  });

  afterAll(async () => {
    await prisma.user.deleteMany({
      where: { email: { in: [customerEmail, adminCandidateEmail] } },
    });
    await app.close();
  });

  describe("registration", () => {
    it("registers a new CUSTOMER and never returns the password hash", async () => {
      const res = await request(app.getHttpServer())
        .post("/api/v1/auth/register")
        .send({ email: customerEmail, password })
        .expect(201);

      expect(res.body.data.user).toMatchObject({ email: customerEmail, role: "CUSTOMER" });
      expect(res.body.data.user).not.toHaveProperty("passwordHash");
      expect(res.body.data).not.toHaveProperty("accessToken");
      expect(res.body.data).not.toHaveProperty("refreshToken");
      expect(JSON.stringify(res.body)).not.toContain(password);

      const cookies = extractCookies(res);
      expect(cookies.some((c) => c.startsWith("access_token="))).toBe(true);
      expect(cookies.some((c) => c.startsWith("refresh_token="))).toBe(true);
      expect(cookies.every((c) => /HttpOnly/i.test(c))).toBe(true);
    });

    it("rejects a duplicate email", async () => {
      const res = await request(app.getHttpServer())
        .post("/api/v1/auth/register")
        .send({ email: customerEmail, password })
        .expect(409);

      expect(res.body.error.message).toMatch(/already exists/i);
    });

    it("rejects an invalid email", async () => {
      await request(app.getHttpServer())
        .post("/api/v1/auth/register")
        .send({ email: "not-an-email", password })
        .expect(400);
    });

    it("rejects a too-short password", async () => {
      await request(app.getHttpServer())
        .post("/api/v1/auth/register")
        .send({ email: `short-${RUN_ID}@example.com`, password: "short" })
        .expect(400);
    });

    it("hashes the password -- the stored value is never the plaintext", async () => {
      const user = await prisma.user.findUniqueOrThrow({ where: { email: customerEmail } });

      expect(user.passwordHash).not.toBe(password);
      expect(user.passwordHash).toMatch(/^\$argon2id\$/);
    });
  });

  describe("login", () => {
    it("logs in with valid credentials", async () => {
      const res = await request(app.getHttpServer())
        .post("/api/v1/auth/login")
        .send({ email: customerEmail, password })
        .expect(200);

      expect(res.body.data.user).toMatchObject({ email: customerEmail });
    });

    it("rejects an unknown email", async () => {
      const res = await request(app.getHttpServer())
        .post("/api/v1/auth/login")
        .send({ email: "nobody-at-all@example.com", password })
        .expect(401);

      expect(res.body.error.message).toMatch(/invalid email or password/i);
    });

    it("rejects an invalid password", async () => {
      const res = await request(app.getHttpServer())
        .post("/api/v1/auth/login")
        .send({ email: customerEmail, password: "wrong-password" })
        .expect(401);

      expect(res.body.error.message).toMatch(/invalid email or password/i);
    });
  });

  describe("authenticated session", () => {
    it("GET /auth/me rejects a request with no credentials", async () => {
      await request(app.getHttpServer()).get("/api/v1/auth/me").expect(401);
    });

    it("GET /auth/me rejects an invalid/garbage token", async () => {
      await request(app.getHttpServer())
        .get("/api/v1/auth/me")
        .set("Cookie", "access_token=not-a-real-jwt")
        .expect(401);
    });

    it("GET /auth/me returns the current user for a valid session", async () => {
      const login = await request(app.getHttpServer())
        .post("/api/v1/auth/login")
        .send({ email: customerEmail, password });
      const cookies = extractCookies(login);

      const res = await request(app.getHttpServer())
        .get("/api/v1/auth/me")
        .set("Cookie", cookies)
        .expect(200);

      expect(res.body.data.user).toMatchObject({ email: customerEmail, role: "CUSTOMER" });
      expect(res.body.data.user).not.toHaveProperty("passwordHash");
    });

    it("also accepts a mobile-style Authorization: Bearer access token", async () => {
      const login = await request(app.getHttpServer())
        .post("/api/v1/auth/login")
        .set("X-Client-Platform", "mobile")
        .send({ email: customerEmail, password });

      expect(login.body.data.accessToken).toBeTypeOf("string");
      expect(login.body.data.refreshToken).toBeTypeOf("string");

      await request(app.getHttpServer())
        .get("/api/v1/auth/me")
        .set("Authorization", `Bearer ${login.body.data.accessToken as string}`)
        .expect(200);
    });
  });

  describe("refresh rotation and reuse detection", () => {
    it("rotates: the old refresh token stops working after one use", async () => {
      const login = await request(app.getHttpServer())
        .post("/api/v1/auth/login")
        .send({ email: customerEmail, password });
      const originalCookies = extractCookies(login);

      const refreshed = await request(app.getHttpServer())
        .post("/api/v1/auth/refresh")
        .set("Cookie", originalCookies)
        .send({})
        .expect(200);

      const newCookies = extractCookies(refreshed);
      expect(cookieMap(newCookies).refresh_token).not.toBe(
        cookieMap(originalCookies).refresh_token,
      );

      // Reusing the original (now-rotated-out) refresh token must fail.
      await request(app.getHttpServer())
        .post("/api/v1/auth/refresh")
        .set("Cookie", originalCookies)
        .send({})
        .expect(401);
    });

    it("reusing a rotated-out token revokes the whole session -- the newest token stops working too", async () => {
      const login = await request(app.getHttpServer())
        .post("/api/v1/auth/login")
        .send({ email: customerEmail, password });
      const firstCookies = extractCookies(login);

      const rotated = await request(app.getHttpServer())
        .post("/api/v1/auth/refresh")
        .set("Cookie", firstCookies)
        .send({});
      const secondCookies = extractCookies(rotated);

      // Reuse the already-rotated-out first token (simulating a stolen token).
      await request(app.getHttpServer())
        .post("/api/v1/auth/refresh")
        .set("Cookie", firstCookies)
        .send({})
        .expect(401);

      // The legitimately-rotated second token was revoked as a result.
      await request(app.getHttpServer())
        .post("/api/v1/auth/refresh")
        .set("Cookie", secondCookies)
        .send({})
        .expect(401);
    });

    it("rotates a token exactly once under truly concurrent rotations (real database locking)", async () => {
      // Called directly rather than over HTTP: HTTP requests arrive staggered
      // enough that a sub-millisecond rotation never overlaps another, while
      // these all issue their reads in the same tick.
      const refreshTokens = app.get(RefreshTokenService);
      const user = await prisma.user.findUniqueOrThrow({ where: { email: customerEmail } });
      // Isolate from sessions earlier tests left behind.
      await refreshTokens.revokeAllForUser(user.id);
      const { token } = await refreshTokens.issue(user.id);

      const results = await Promise.allSettled(
        Array.from({ length: 10 }, () => refreshTokens.rotate(token)),
      );

      expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
      // The losers count as reuse, so no token for this user survives --
      // including the replacement the winner was just issued.
      expect(await prisma.refreshToken.count({ where: { userId: user.id, revokedAt: null } })).toBe(
        0,
      );
    });

    it("rejects a missing refresh token", async () => {
      await request(app.getHttpServer()).post("/api/v1/auth/refresh").send({}).expect(401);
    });
  });

  describe("logout", () => {
    it("revokes the session and clears cookies; a revoked refresh token can no longer refresh", async () => {
      const login = await request(app.getHttpServer())
        .post("/api/v1/auth/login")
        .send({ email: customerEmail, password });
      const cookies = extractCookies(login);

      const logout = await request(app.getHttpServer())
        .post("/api/v1/auth/logout")
        .set("Cookie", cookies)
        .send({})
        .expect(200);

      expect(logout.body.data).toEqual({ success: true });

      await request(app.getHttpServer())
        .post("/api/v1/auth/refresh")
        .set("Cookie", cookies)
        .send({})
        .expect(401);
    });

    it("is idempotent -- succeeds even with no session to revoke", async () => {
      await request(app.getHttpServer()).post("/api/v1/auth/logout").send({}).expect(200);
    });
  });

  describe("role-based authorization", () => {
    let customerCookies: string[];
    let adminCookies: string[];
    let superAdminCookies: string[];

    beforeAll(async () => {
      const customerLogin = await request(app.getHttpServer())
        .post("/api/v1/auth/login")
        .send({ email: customerEmail, password });
      customerCookies = extractCookies(customerLogin);

      const superAdminLogin = await request(app.getHttpServer())
        .post("/api/v1/auth/login")
        .send({ email: "superadmin@example.com", password: "dev-password-123" })
        .expect(200);
      superAdminCookies = extractCookies(superAdminLogin);

      // Provision a real ADMIN account through the actual API, the way a
      // SUPER_ADMIN would in production -- not a direct DB shortcut.
      const adminCandidate = await request(app.getHttpServer())
        .post("/api/v1/auth/register")
        .send({ email: adminCandidateEmail, password });
      const adminCandidateId = adminCandidate.body.data.user.id as string;

      await request(app.getHttpServer())
        .patch(`/api/v1/users/${adminCandidateId}/role`)
        .set("Cookie", superAdminCookies)
        .send({ role: "ADMIN" })
        .expect(200);

      const adminLogin = await request(app.getHttpServer())
        .post("/api/v1/auth/login")
        .send({ email: adminCandidateEmail, password });
      adminCookies = extractCookies(adminLogin);
    });

    it("CUSTOMER cannot list users (ADMIN+ only)", async () => {
      await request(app.getHttpServer())
        .get("/api/v1/users")
        .set("Cookie", customerCookies)
        .expect(403);
    });

    it("ADMIN can list users", async () => {
      const res = await request(app.getHttpServer())
        .get("/api/v1/users")
        .set("Cookie", adminCookies)
        .expect(200);

      expect(res.body.data.items).toBeInstanceOf(Array);
      expect(
        res.body.data.items.every((u: { passwordHash?: unknown }) => !("passwordHash" in u)),
      ).toBe(true);
    });

    it("SUPER_ADMIN can list users too", async () => {
      await request(app.getHttpServer())
        .get("/api/v1/users")
        .set("Cookie", superAdminCookies)
        .expect(200);
    });

    it("ADMIN cannot change a user's role (SUPER_ADMIN only)", async () => {
      const res = await request(app.getHttpServer())
        .get("/api/v1/users")
        .set("Cookie", adminCookies);
      const targetId = res.body.data.items.find((u: { email: string }) => u.email === customerEmail)
        .id as string;

      await request(app.getHttpServer())
        .patch(`/api/v1/users/${targetId}/role`)
        .set("Cookie", adminCookies)
        .send({ role: "ADMIN" })
        .expect(403);
    });

    it("SUPER_ADMIN can change a user's role", async () => {
      const res = await request(app.getHttpServer())
        .get("/api/v1/users")
        .set("Cookie", superAdminCookies);
      const targetId = res.body.data.items.find((u: { email: string }) => u.email === customerEmail)
        .id as string;

      const patched = await request(app.getHttpServer())
        .patch(`/api/v1/users/${targetId}/role`)
        .set("Cookie", superAdminCookies)
        .send({ role: "CUSTOMER" })
        .expect(200);

      expect(patched.body.data.role).toBe("CUSTOMER");
    });

    it("unauthenticated requests are rejected before role checks even run", async () => {
      await request(app.getHttpServer()).get("/api/v1/users").expect(401);
    });
  });
});
