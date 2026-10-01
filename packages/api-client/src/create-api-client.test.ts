import { describe, expect, it, vi } from "vitest";
import { ApiClientError } from "./api-client-error";
import { createApiClient } from "./create-api-client";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("createApiClient", () => {
  it("returns the unwrapped data on success", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ data: { id: "1" } }));
    const client = createApiClient({ baseUrl: "https://api.test", fetch: fetchMock });

    await expect(client.get("/widgets/1")).resolves.toEqual({ id: "1" });
  });

  it("throws ApiClientError with the backend error payload", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ error: { code: "NOT_FOUND", message: "Missing" } }, 404));
    const client = createApiClient({ baseUrl: "https://api.test", fetch: fetchMock });

    await expect(client.get("/widgets/1")).rejects.toMatchObject({
      status: 404,
      code: "NOT_FOUND",
      message: "Missing",
    });
  });

  it("attaches a bearer token from getAccessToken for non-cookie clients", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ data: null }));
    const client = createApiClient({
      baseUrl: "https://api.test",
      fetch: fetchMock,
      getAccessToken: () => "mobile-token",
    });

    await client.get("/me");

    const [, requestInit] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect((requestInit.headers as Record<string, string>).Authorization).toBe(
      "Bearer mobile-token",
    );
  });

  it("includes credentials for cookie-based web clients", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ data: null }));
    const client = createApiClient({
      baseUrl: "https://api.test",
      fetch: fetchMock,
      useCredentials: true,
    });

    await client.get("/me");

    const [, requestInit] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(requestInit.credentials).toBe("include");
  });

  it("calls onUnauthorized when the backend responds 401", async () => {
    const onUnauthorized = vi.fn();
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ error: { code: "UNAUTHORIZED", message: "Nope" } }, 401));
    const client = createApiClient({
      baseUrl: "https://api.test",
      fetch: fetchMock,
      onUnauthorized,
    });

    await expect(client.get("/me")).rejects.toBeInstanceOf(ApiClientError);
    expect(onUnauthorized).toHaveBeenCalledOnce();
  });

  describe("autoRefresh", () => {
    function buildFetchMock(): ReturnType<typeof vi.fn> {
      let firstAttempt = true;

      return vi.fn((input: RequestInfo | URL) => {
        const url = input.toString();

        if (url.endsWith("/auth/refresh")) {
          return Promise.resolve(jsonResponse({ data: { user: { id: "u1" } } }));
        }

        if (firstAttempt) {
          firstAttempt = false;
          return Promise.resolve(
            jsonResponse({ error: { code: "UNAUTHORIZED", message: "Expired" } }, 401),
          );
        }

        return Promise.resolve(jsonResponse({ data: { id: "1" } }));
      });
    }

    it("refreshes once on a 401 and retries the original request", async () => {
      const onUnauthorized = vi.fn();
      const fetchMock = buildFetchMock();
      const client = createApiClient({
        baseUrl: "https://api.test",
        fetch: fetchMock,
        useCredentials: true,
        autoRefresh: true,
        onUnauthorized,
      });

      await expect(client.get("/widgets/1")).resolves.toEqual({ id: "1" });
      expect(onUnauthorized).not.toHaveBeenCalled();

      const paths = fetchMock.mock.calls.map(([url]) => (url as string).toString());
      expect(paths).toEqual([
        "https://api.test/widgets/1",
        "https://api.test/auth/refresh",
        "https://api.test/widgets/1",
      ]);
    });

    it("falls back to onUnauthorized when the refresh itself fails", async () => {
      const onUnauthorized = vi.fn();
      const fetchMock = vi.fn((input: RequestInfo | URL) => {
        const url = input.toString();
        return Promise.resolve(
          url.endsWith("/auth/refresh")
            ? jsonResponse({ error: { code: "UNAUTHORIZED", message: "No session" } }, 401)
            : jsonResponse({ error: { code: "UNAUTHORIZED", message: "Expired" } }, 401),
        );
      });
      const client = createApiClient({
        baseUrl: "https://api.test",
        fetch: fetchMock,
        useCredentials: true,
        autoRefresh: true,
        onUnauthorized,
      });

      await expect(client.get("/widgets/1")).rejects.toBeInstanceOf(ApiClientError);
      expect(onUnauthorized).toHaveBeenCalledOnce();
    });

    it("does not loop forever if the retried request 401s again", async () => {
      const onUnauthorized = vi.fn();
      const fetchMock = vi.fn((input: RequestInfo | URL) => {
        const url = input.toString();
        return Promise.resolve(
          url.endsWith("/auth/refresh")
            ? jsonResponse({ data: { user: { id: "u1" } } })
            : jsonResponse({ error: { code: "UNAUTHORIZED", message: "Still expired" } }, 401),
        );
      });
      const client = createApiClient({
        baseUrl: "https://api.test",
        fetch: fetchMock,
        useCredentials: true,
        autoRefresh: true,
        onUnauthorized,
      });

      await expect(client.get("/widgets/1")).rejects.toBeInstanceOf(ApiClientError);
      expect(onUnauthorized).toHaveBeenCalledOnce();
      // one 401, one refresh, one retried 401 -- never a second refresh attempt
      expect(fetchMock).toHaveBeenCalledTimes(3);
    });

    it("shares a single in-flight refresh across concurrent 401s", async () => {
      let refreshCalls = 0;
      // Each widget path 401s on its first call, then succeeds -- tracked
      // per-URL so both concurrent requests hit their first 401 before
      // either one's refresh call resolves.
      const seen = new Set<string>();
      const fetchMock = vi.fn((input: RequestInfo | URL) => {
        const url = input.toString();

        if (url.endsWith("/auth/refresh")) {
          refreshCalls += 1;
          return Promise.resolve(jsonResponse({ data: { user: { id: "u1" } } }));
        }
        if (!seen.has(url)) {
          seen.add(url);
          return Promise.resolve(
            jsonResponse({ error: { code: "UNAUTHORIZED", message: "Expired" } }, 401),
          );
        }
        return Promise.resolve(jsonResponse({ data: { id: "ok" } }));
      });

      const client = createApiClient({
        baseUrl: "https://api.test",
        fetch: fetchMock,
        useCredentials: true,
        autoRefresh: true,
      });

      const [a, b] = await Promise.all([client.get("/widgets/1"), client.get("/widgets/2")]);

      expect(a).toEqual({ id: "ok" });
      expect(b).toEqual({ id: "ok" });
      expect(refreshCalls).toBe(1);
    });
  });
});
