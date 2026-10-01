import { Injectable, NotFoundException } from "@nestjs/common";
import type { PaginatedResult, PublicUser } from "@kiranabar/types";
import type { PaginationQuery } from "@kiranabar/validation";
import type { Role, User } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { toPublicUser } from "./user.mapper";

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  /** Includes passwordHash -- for AuthModule's login/registration checks only. */
  async findByEmailWithPassword(email: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { email } });
  }

  async createWithPassword(email: string, passwordHash: string): Promise<PublicUser> {
    const user = await this.prisma.user.create({
      data: { email, passwordHash },
      omit: { passwordHash: true },
    });

    return toPublicUser(user);
  }

  async findPublicById(id: string): Promise<PublicUser | null> {
    const user = await this.prisma.user.findUnique({
      where: { id },
      omit: { passwordHash: true },
    });

    return user ? toPublicUser(user) : null;
  }

  async list(pagination: PaginationQuery): Promise<PaginatedResult<PublicUser>> {
    const { page, pageSize } = pagination;

    const [items, total] = await Promise.all([
      this.prisma.user.findMany({
        omit: { passwordHash: true },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.user.count(),
    ]);

    return { items: items.map(toPublicUser), total, page, pageSize };
  }

  async updateRole(id: string, role: Role): Promise<PublicUser> {
    const exists = await this.prisma.user.findUnique({ where: { id }, select: { id: true } });

    if (!exists) {
      throw new NotFoundException("User not found");
    }

    const user = await this.prisma.user.update({
      where: { id },
      data: { role },
      omit: { passwordHash: true },
    });

    return toPublicUser(user);
  }
}
