import { vi } from "vitest";

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

type RouteHandler = (url: URL, init?: RequestInit) => Response;

/**
 * Mocks global fetch for one test. Each key is a path suffix matched
 * against the request URL's pathname (query string ignored), longest key
 * first so "/products/p1" never falls through to "/products". Throws on an
 * unmatched request so a test's assumptions about which endpoints it hits
 * stay explicit. Returns the mock so tests can inspect the requested URLs.
 */
export function mockFetchRoutes(routes: Record<string, RouteHandler>) {
  const entries = Object.entries(routes).sort(([a], [b]) => b.length - a.length);

  const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(typeof input === "string" ? input : input.toString());
    for (const [path, handler] of entries) {
      if (url.pathname.endsWith(path)) return Promise.resolve(handler(url, init));
    }
    throw new Error(`Unhandled request in test: ${url.toString()}`);
  });

  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

/** Every requested URL whose pathname ends with `path`, in call order. */
export function requestedUrls(fetchMock: ReturnType<typeof mockFetchRoutes>, path: string): URL[] {
  return fetchMock.mock.calls
    .map(([input]) => new URL(typeof input === "string" ? input : input.toString()))
    .filter((url) => url.pathname.endsWith(path));
}
