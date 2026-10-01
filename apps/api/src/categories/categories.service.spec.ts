import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";
import type { PrismaService } from "../prisma/prisma.service";
import { CategoriesService } from "./categories.service";

const DB_CATEGORY = {
  id: "cat-1",
  name: "Apparel",
  slug: "apparel",
  description: null,
  status: "ACTIVE" as const,
  parentId: null,
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-01T00:00:00.000Z"),
};

function buildPrismaMock() {
  return {
    category: {
      create: vi.fn(),
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
  };
}

describe("CategoriesService", () => {
  let prisma: ReturnType<typeof buildPrismaMock>;
  let service: CategoriesService;

  beforeEach(() => {
    prisma = buildPrismaMock();
    service = new CategoriesService(prisma as unknown as PrismaService);
  });

  describe("create", () => {
    it("creates a root category when no parentId is given", async () => {
      prisma.category.create.mockResolvedValue(DB_CATEGORY);

      const result = await service.create({ name: "Apparel", slug: "apparel", status: "DRAFT" });

      expect(prisma.category.findUnique).not.toHaveBeenCalled();
      expect(result.slug).toBe("apparel");
    });

    it("validates the parent exists before creating a child", async () => {
      prisma.category.findUnique.mockResolvedValue(null);

      await expect(
        service.create({ name: "Shirts", slug: "shirts", status: "DRAFT", parentId: "missing" }),
      ).rejects.toThrow("Category not found");
      expect(prisma.category.create).not.toHaveBeenCalled();
    });

    it("maps a unique constraint violation to a 409", async () => {
      prisma.category.create.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError("duplicate", {
          code: "P2002",
          clientVersion: "test",
        }),
      );

      await expect(
        service.create({ name: "Apparel", slug: "apparel", status: "DRAFT" }),
      ).rejects.toThrow("already exists");
    });
  });

  describe("findMany", () => {
    it("forces ACTIVE-only for non-staff regardless of a requested status", async () => {
      prisma.category.findMany.mockResolvedValue([]);
      prisma.category.count.mockResolvedValue(0);

      await service.findMany({ page: 1, pageSize: 20, status: "DRAFT" }, false);

      expect(prisma.category.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ status: "ACTIVE" }) }),
      );
    });

    it("allows staff to see every status by default", async () => {
      prisma.category.findMany.mockResolvedValue([]);
      prisma.category.count.mockResolvedValue(0);

      await service.findMany({ page: 1, pageSize: 20 }, true);

      const call = prisma.category.findMany.mock.calls[0]?.[0] as {
        where: Record<string, unknown>;
      };
      expect(call.where).not.toHaveProperty("status");
    });

    it("lets staff filter to a specific status", async () => {
      prisma.category.findMany.mockResolvedValue([]);
      prisma.category.count.mockResolvedValue(0);

      await service.findMany({ page: 1, pageSize: 20, status: "DRAFT" }, true);

      expect(prisma.category.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ status: "DRAFT" }) }),
      );
    });
  });

  describe("findOne", () => {
    it("returns 404 for a DRAFT category when the caller is not staff", async () => {
      prisma.category.findFirst.mockResolvedValue({
        ...DB_CATEGORY,
        status: "DRAFT",
        children: [],
      });

      await expect(service.findOne("apparel", false)).rejects.toThrow("Category not found");
    });

    it("filters non-ACTIVE children for a non-staff caller", async () => {
      prisma.category.findFirst.mockResolvedValue({
        ...DB_CATEGORY,
        children: [
          { ...DB_CATEGORY, id: "child-active", status: "ACTIVE" },
          { ...DB_CATEGORY, id: "child-draft", status: "DRAFT" },
        ],
      });

      const result = await service.findOne("apparel", false);

      expect(result.children.map((c) => c.id)).toEqual(["child-active"]);
    });
  });

  describe("update", () => {
    it("rejects setting a category as its own parent", async () => {
      prisma.category.findUnique.mockResolvedValue({ id: "cat-1" });

      await expect(service.update("cat-1", { parentId: "cat-1" })).rejects.toThrow(
        "cannot be its own parent",
      );
    });

    it("throws 404 for a missing category", async () => {
      prisma.category.findUnique.mockResolvedValue(null);

      await expect(service.update("missing", { name: "New name" })).rejects.toThrow(
        "Category not found",
      );
    });
  });

  describe("archive", () => {
    it("sets status to ARCHIVED rather than deleting the row", async () => {
      prisma.category.findUnique.mockResolvedValue({ id: "cat-1" });
      prisma.category.update.mockResolvedValue({ ...DB_CATEGORY, status: "ARCHIVED" });

      const result = await service.archive("cat-1");

      expect(prisma.category.update).toHaveBeenCalledWith({
        where: { id: "cat-1" },
        data: { status: "ARCHIVED" },
      });
      expect(result.status).toBe("ARCHIVED");
    });
  });

  describe("remove", () => {
    it("throws 404 for a missing category", async () => {
      prisma.category.findUnique.mockResolvedValue(null);

      await expect(service.remove("missing")).rejects.toThrow("Category not found");
      expect(prisma.category.delete).not.toHaveBeenCalled();
    });

    it("rejects deleting a category that isn't archived", async () => {
      prisma.category.findUnique.mockResolvedValue({ status: "ACTIVE" });

      await expect(service.remove("cat-1")).rejects.toThrow(
        "Category must be archived before it can be deleted",
      );
      expect(prisma.category.delete).not.toHaveBeenCalled();
    });

    it("deletes an archived category", async () => {
      prisma.category.findUnique.mockResolvedValue({ status: "ARCHIVED" });
      prisma.category.delete.mockResolvedValue(DB_CATEGORY);

      await service.remove("cat-1");

      expect(prisma.category.delete).toHaveBeenCalledWith({ where: { id: "cat-1" } });
    });

    it("maps a restrict violation (existing child categories) to a 409", async () => {
      prisma.category.findUnique.mockResolvedValue({ status: "ARCHIVED" });
      prisma.category.delete.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError("restricted", {
          code: "P2003",
          clientVersion: "test",
        }),
      );

      await expect(service.remove("cat-1")).rejects.toThrow("child categories");
    });
  });
});
