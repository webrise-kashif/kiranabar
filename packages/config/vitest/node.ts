import { defineConfig } from "vitest/config";

/** Base Vitest configuration for Node-based packages and the NestJS API. */
export const nodeVitestConfig = defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.{test,spec}.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
    },
  },
});
