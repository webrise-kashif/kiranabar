import swc from "unplugin-swc";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    root: "./",
    include: ["src/**/*.spec.ts"],
    environment: "node",
  },
  plugins: [swc.vite()],
});
