import { Injectable, type OnModuleDestroy, type OnModuleInit } from "@nestjs/common";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { AppConfigService } from "../config/app-config.service";

/**
 * The only part of the codebase allowed to know about PostgreSQL/Prisma.
 * No frontend ever talks to this directly -- everything goes through the
 * REST API. Prisma 7 requires an explicit driver adapter instead of an
 * inline `datasource.url` in schema.prisma.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor(config: AppConfigService) {
    super({ adapter: new PrismaPg({ connectionString: config.databaseUrl }) });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
