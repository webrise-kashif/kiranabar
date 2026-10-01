import { vi } from "vitest";

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

type RouteHandler = (init?: RequestInit) => Response;

/**
 * Mocks global fetch for one test by matching each request against
 * `"METHOD /path/suffix"` keys (method first, then a path suffix compared
 * with `endsWith` after stripping the query string) -- e.g.
 * `"GET /products"` vs `"GET /products/p1"` vs `"DELETE /products/p1"`
 * never cross-match. Throws on an unmatched request so a test's
 * assumptions about which endpoints it hits stay explicit rather than
 * silently returning undefined.
 */
export function mockFetchRoutes(routes: Record<string, RouteHandler>): void {
  const entries = Object.entries(routes).sort(([a], [b]) => b.length - a.length);

  vi.stubGlobal(
    "fetch",
    vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();
      const method = (init?.method ?? "GET").toUpperCase();
      const pathOnly = url.split("?")[0] ?? url;

      for (const [key, handler] of entries) {
        const spaceIndex = key.indexOf(" ");
        const routeMethod = key.slice(0, spaceIndex);
        const routePath = key.slice(spaceIndex + 1);
        if (routeMethod === method && pathOnly.endsWith(routePath)) {
          return Promise.resolve(handler(init));
        }
      }

      throw new Error(`Unhandled request in test: ${method} ${url}`);
    }),
  );
}
