import { Test } from "@nestjs/testing";
import { describe, expect, it } from "vitest";
import { AppModule } from "./app.module";

// Requires DATABASE_URL to be set (see .env.example) because AppConfigModule
// validates the environment eagerly -- this is a fast DI-graph check, not a
// live-database test (compare test/app.e2e-spec.ts, which also boots Prisma).
describe("AppModule", () => {
  it("compiles with every foundation module wired in", async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();

    expect(moduleRef).toBeDefined();
  });
});
