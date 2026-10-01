import { describe, expect, it } from "vitest";
import { PasswordService } from "./password.service";

describe("PasswordService", () => {
  const service = new PasswordService();

  it("produces an argon2id hash", async () => {
    const hash = await service.hash("correct horse battery staple");

    expect(hash).toMatch(/^\$argon2id\$/);
  });

  it("verifies a matching password", async () => {
    const hash = await service.hash("correct horse battery staple");

    await expect(service.verify(hash, "correct horse battery staple")).resolves.toBe(true);
  });

  it("rejects a non-matching password", async () => {
    const hash = await service.hash("correct horse battery staple");

    await expect(service.verify(hash, "wrong password")).resolves.toBe(false);
  });

  it("never produces the same hash twice for the same password (random salt)", async () => {
    const [first, second] = await Promise.all([
      service.hash("same password"),
      service.hash("same password"),
    ]);

    expect(first).not.toBe(second);
  });

  it("returns false instead of throwing for a malformed hash", async () => {
    await expect(service.verify("not-a-real-hash", "anything")).resolves.toBe(false);
  });
});
