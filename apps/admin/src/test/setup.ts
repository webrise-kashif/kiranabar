import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// @testing-library/react's auto-cleanup relies on a global `afterEach`,
// which this project doesn't enable (vitest.config.ts has no `globals:
// true` -- every test file imports from "vitest" explicitly instead).
// Without this, DOM from one test leaks into the next within the same file.
afterEach(() => {
  cleanup();
});
