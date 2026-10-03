import tailwindcss from "@tailwindcss/vite";

export default defineNuxtConfig({
  compatibilityDate: "2025-07-15",
  devtools: { enabled: true },
  modules: ["@nuxt/eslint"],
  // Tailwind v4 via its Vite plugin -- the same setup as apps/admin.
  css: ["~/assets/css/main.css"],
  vite: {
    plugins: [tailwindcss()],
    // The shared workspace packages compile to CommonJS. Vite serves linked
    // (non-node_modules) packages to the browser as-is, and a browser can't
    // import CommonJS -- client-side code crashed on load with "does not
    // provide an export named 'createApiClient'". Pre-bundling converts
    // them to ESM, as it already does for node_modules dependencies.
    optimizeDeps: {
      include: ["@kiranabar/api-client", "@kiranabar/types", "@kiranabar/validation"],
    },
  },
  runtimeConfig: {
    public: {
      apiBaseUrl: "http://localhost:3000/api/v1",
    },
  },
  typescript: {
    // Vite's oxc-based .vue transform can't resolve a nested `extends`
    // reaching outside .nuxt/, so the shared strict options are inlined
    // here (mirrors packages/config/tsconfig/base.json) instead.
    tsConfig: {
      compilerOptions: {
        strict: true,
        noUncheckedIndexedAccess: true,
        noImplicitOverride: true,
        noFallthroughCasesInSwitch: true,
        noUnusedLocals: true,
        noUnusedParameters: true,
      },
    },
  },
});
