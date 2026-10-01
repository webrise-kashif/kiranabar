import { describe, expect, it } from "vitest";
import { parseDurationMs } from "./duration.util";

describe("parseDurationMs", () => {
  it("parses minutes", () => {
    expect(parseDurationMs("15m")).toBe(15 * 60_000);
  });

  it("parses days", () => {
    expect(parseDurationMs("30d")).toBe(30 * 86_400_000);
  });

  it("parses seconds and milliseconds", () => {
    expect(parseDurationMs("45s")).toBe(45_000);
    expect(parseDurationMs("500ms")).toBe(500);
  });

  it("throws on an unrecognized format", () => {
    expect(() => parseDurationMs("15 minutes")).toThrow(/Invalid duration/);
    expect(() => parseDurationMs("")).toThrow(/Invalid duration/);
  });
});
