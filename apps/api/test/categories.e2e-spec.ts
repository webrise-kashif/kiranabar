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
describe("Categories (e2e)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let adminCookies: string[];
  let customerCookies: string[];

  const RUN_ID = Date.now();
  const rootSlug = `cat-spec-root-${RUN_ID}`;
  const childSlug = `cat-spec-child-${RUN_ID}`;
  let rootId: string;

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
    await prisma.category.deleteMany({ where: { slug: { in: [childSlug, rootSlug] } } });
    await app.close();
  });

  it("rejects create for an unauthenticated caller", async () => {
    await request(app.getHttpServer())
      .post("/api/v1/categories")
      .send({ name: "Root", slug: rootSlug })
      .expect(401);
  });

  it("rejects create for a CUSTOMER", async () => {
    await request(app.getHttpServer())
      .post("/api/v1/categories")
      .set("Cookie", customerCookies)
      .send({ name: "Root", slug: rootSlug })
      .expect(403);
  });

  it("ADMIN creates a root category, DRAFT by default", async () => {
    const res = await request(app.getHttpServer())
      .post("/api/v1/categories")
      .set("Cookie", adminCookies)
      .send({ name: "Spec Root", slug: rootSlug })
      .expect(201);

    expect(res.body.data.status).toBe("DRAFT");
    rootId = res.body.data.id as string;
  });

  it("rejects a duplicate slug with 409", async () => {
    await request(app.getHttpServer())
      .post("/api/v1/categories")
      .set("Cookie", adminCookies)
      .send({ name: "Duplicate", slug: rootSlug })
      .expect(409);
  });

  it("public browsing 404s on the DRAFT category", async () => {
    await request(app.getHttpServer()).get(`/api/v1/categories/${rootSlug}`).expect(404);
  });

  it("ADMIN can see the DRAFT category by slug", async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/categories/${rootSlug}`)
      .set("Cookie", adminCookies)
      .expect(200);

    expect(res.body.data.id).toBe(rootId);
  });

  it("ADMIN activates the root and creates an ACTIVE child under it", async () => {
    await request(app.getHttpServer())
      .patch(`/api/v1/categories/${rootId}`)
      .set("Cookie", adminCookies)
      .send({ status: "ACTIVE" })
      .expect(200);

    await request(app.getHttpServer())
      .post("/api/v1/categories")
      .set("Cookie", adminCookies)
      .send({ name: "Spec Child", slug: childSlug, status: "ACTIVE", parentId: rootId })
      .expect(201);
  });

  it("public browsing now sees the ACTIVE root with its ACTIVE child nested", async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/categories/${rootSlug}`)
      .expect(200);

    expect(res.body.data.children.map((c: { slug: string }) => c.slug)).toContain(childSlug);
  });

  it("rejects a category being set as its own parent", async () => {
    await request(app.getHttpServer())
      .patch(`/api/v1/categories/${rootId}`)
      .set("Cookie", adminCookies)
      .send({ parentId: rootId })
      .expect(409);
  });

  it("archiving (soft delete) sets status to ARCHIVED, not a hard delete", async () => {
    const res = await request(app.getHttpServer())
      .delete(`/api/v1/categories/${rootId}`)
      .set("Cookie", adminCookies)
      .expect(200);

    expect(res.body.data.status).toBe("ARCHIVED");

    const stillExists = await prisma.category.findUnique({ where: { id: rootId } });
    expect(stillExists).not.toBeNull();
  });

  it("an archived category no longer appears in public browsing", async () => {
    await request(app.getHttpServer()).get(`/api/v1/categories/${rootSlug}`).expect(404);
  });

  describe("deletion", () => {
    it("rejects a hard delete for a CUSTOMER", async () => {
      await request(app.getHttpServer())
        .delete(`/api/v1/categories/${rootId}/permanent`)
        .set("Cookie", customerCookies)
        .expect(403);
    });

    it("rejects a hard delete while the child category still isn't archived", async () => {
      await request(app.getHttpServer())
        .delete(`/api/v1/categories/${childSlug}/permanent`)
        .set("Cookie", adminCookies)
        .expect(404); // :id must be an id, not a slug -- confirms this route isn't slug-aware
    });

    it("rejects a hard delete of the (already-archived) root while a child still references it", async () => {
      await request(app.getHttpServer())
        .delete(`/api/v1/categories/${rootId}/permanent`)
        .set("Cookie", adminCookies)
        .expect(409);

      const stillExists = await prisma.category.findUnique({ where: { id: rootId } });
      expect(stillExists).not.toBeNull();
    });

    it("archives, then permanently deletes the child, then the now-childless root", async () => {
      const child = await prisma.category.findUnique({ where: { slug: childSlug } });
      const childId = child?.id as string;

      await request(app.getHttpServer())
        .delete(`/api/v1/categories/${childId}`)
        .set("Cookie", adminCookies)
        .expect(200);

      await request(app.getHttpServer())
        .delete(`/api/v1/categories/${childId}/permanent`)
        .set("Cookie", adminCookies)
        .expect(200);

      await request(app.getHttpServer())
        .delete(`/api/v1/categories/${rootId}/permanent`)
        .set("Cookie", adminCookies)
        .expect(200);

      const rootStillExists = await prisma.category.findUnique({ where: { id: rootId } });
      expect(rootStillExists).toBeNull();
    });
  });
});
