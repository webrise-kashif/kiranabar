import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
  },
  // These are linked pnpm workspace packages, compiled to CommonJS (see
  // packages/config/tsconfig/node.json). Vite's dep optimizer skips
  // symlinked local packages by default, so without this they're served
  // straight to the browser as raw CJS and its native ESM loader can't
  // see their named exports ("does not provide an export named ..."). This
  // forces esbuild to pre-bundle them, which does the CJS->ESM interop.
  optimizeDeps: {
    include: ["@kiranabar/api-client", "@kiranabar/types", "@kiranabar/validation"],
  },
});
