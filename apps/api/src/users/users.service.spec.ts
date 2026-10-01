import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PrismaService } from "../prisma/prisma.service";
import { UsersService } from "./users.service";

const DB_USER = {
  id: "user-1",
  email: "user@example.com",
  passwordHash: "stored-hash",
  role: "CUSTOMER" as const,
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-01T00:00:00.000Z"),
};

function buildPrismaMock() {
  return {
    user: {
      findUnique: vi.fn(),
      create: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
      update: vi.fn(),
    },
  };
}

describe("UsersService", () => {
  let prisma: ReturnType<typeof buildPrismaMock>;
  let service: UsersService;

  beforeEach(() => {
    prisma = buildPrismaMock();
    service = new UsersService(prisma as unknown as PrismaService);
  });

  it("findByEmailWithPassword returns the full row, including passwordHash", async () => {
    prisma.user.findUnique.mockResolvedValue(DB_USER);

    const result = await service.findByEmailWithPassword("user@example.com");

    expect(result).toEqual(DB_USER);
    expect(prisma.user.findUnique).toHaveBeenCalledWith({ where: { email: "user@example.com" } });
  });

  it("createWithPassword never returns passwordHash", async () => {
    const { passwordHash: _passwordHash, ...withoutHash } = DB_USER;
    prisma.user.create.mockResolvedValue(withoutHash);

    const result = await service.createWithPassword("user@example.com", "some-hash");

    expect(prisma.user.create).toHaveBeenCalledWith({
      data: { email: "user@example.com", passwordHash: "some-hash" },
      omit: { passwordHash: true },
    });
    expect(result).not.toHaveProperty("passwordHash");
    expect(result).toEqual({
      id: "user-1",
      email: "user@example.com",
      role: "CUSTOMER",
      createdAt: "2026-01-01T00:00:00.000Z",
    });
  });

  it("findPublicById returns null when the user does not exist", async () => {
    prisma.user.findUnique.mockResolvedValue(null);

    await expect(service.findPublicById("missing")).resolves.toBeNull();
  });

  it("list paginates and never returns passwordHash", async () => {
    const { passwordHash: _passwordHash, ...withoutHash } = DB_USER;
    prisma.user.findMany.mockResolvedValue([withoutHash]);
    prisma.user.count.mockResolvedValue(1);

    const result = await service.list({ page: 2, pageSize: 10 });

    expect(prisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 10, take: 10, omit: { passwordHash: true } }),
    );
    expect(result).toEqual({
      items: [
        {
          id: "user-1",
          email: "user@example.com",
          role: "CUSTOMER",
          createdAt: "2026-01-01T00:00:00.000Z",
        },
      ],
      total: 1,
      page: 2,
      pageSize: 10,
    });
  });

  it("updateRole throws NotFoundException for a missing user", async () => {
    prisma.user.findUnique.mockResolvedValue(null);

    await expect(service.updateRole("missing", "ADMIN")).rejects.toThrow("User not found");
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it("updateRole updates and returns the public shape", async () => {
    prisma.user.findUnique.mockResolvedValue({ id: "user-1" });
    const { passwordHash: _passwordHash, ...withoutHash } = { ...DB_USER, role: "ADMIN" as const };
    prisma.user.update.mockResolvedValue(withoutHash);

    const result = await service.updateRole("user-1", "ADMIN");

    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: "user-1" },
      data: { role: "ADMIN" },
      omit: { passwordHash: true },
    });
    expect(result.role).toBe("ADMIN");
  });
});
