import { afterEach, describe, expect, it, vi } from "vitest";
import { apiClient, onSessionExpired } from "./api-client";

function unauthorizedResponse(): Response {
  return new Response(JSON.stringify({ error: { code: "UNAUTHORIZED", message: "Expired" } }), {
    status: 401,
    headers: { "Content-Type": "application/json" },
  });
}

describe("onSessionExpired", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("notifies every subscribed listener once a 401 survives auto-refresh", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve(unauthorizedResponse())),
    );
    const first = vi.fn();
    const second = vi.fn();
    const unsubscribeFirst = onSessionExpired(first);
    const unsubscribeSecond = onSessionExpired(second);

    await expect(apiClient.get("/widgets/1")).rejects.toThrow();

    expect(first).toHaveBeenCalledOnce();
    expect(second).toHaveBeenCalledOnce();
    unsubscribeFirst();
    unsubscribeSecond();
  });

  it("stops notifying a listener after it unsubscribes", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve(unauthorizedResponse())),
    );
    const listener = vi.fn();
    const unsubscribe = onSessionExpired(listener);
    unsubscribe();

    await expect(apiClient.get("/widgets/1")).rejects.toThrow();

    expect(listener).not.toHaveBeenCalled();
  });
});
