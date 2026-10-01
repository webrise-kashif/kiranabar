import { mountSuspended } from "@nuxt/test-utils/runtime";
import { flushPromises } from "@vue/test-utils";
import { describe, expect, it, vi } from "vitest";
import App from "./app.vue";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function mockFetchRoutes(routes: Record<string, () => Response>): void {
  vi.stubGlobal(
    "fetch",
    vi.fn((input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      for (const [path, handler] of Object.entries(routes)) {
        if (url.includes(path)) return Promise.resolve(handler());
      }
      throw new Error(`Unhandled request in test: ${url}`);
    }),
  );
}

describe("App", () => {
  it("renders the web store heading, API status, and a login form when signed out", async () => {
    mockFetchRoutes({
      "/health": () => jsonResponse({ data: { status: "ok", timestamp: "now" } }),
      "/auth/me": () =>
        jsonResponse({ error: { code: "UNAUTHORIZED", message: "No session" } }, 401),
    });

    const wrapper = await mountSuspended(App);
    await flushPromises();

    expect(wrapper.text()).toContain("Web Store");
    expect(wrapper.text()).toContain("API status: ok");
    expect(wrapper.find('input[type="email"]').exists()).toBe(true);
  });

  it("logs in and shows the current user", async () => {
    mockFetchRoutes({
      "/health": () => jsonResponse({ data: { status: "ok", timestamp: "now" } }),
      "/auth/me": () =>
        jsonResponse({ error: { code: "UNAUTHORIZED", message: "No session" } }, 401),
      "/auth/login": () =>
        jsonResponse({
          data: {
            user: { id: "1", email: "user@example.com", role: "CUSTOMER", createdAt: "now" },
          },
        }),
    });

    const wrapper = await mountSuspended(App);
    await flushPromises();

    await wrapper.find('input[type="email"]').setValue("user@example.com");
    await wrapper.find('input[type="password"]').setValue("password123");
    await wrapper.find("form").trigger("submit");
    await flushPromises();

    expect(wrapper.text()).toContain("Signed in as user@example.com");
    expect(wrapper.find('input[type="email"]').exists()).toBe(false);
  });

  it("shows the current user immediately when a session already exists", async () => {
    mockFetchRoutes({
      "/health": () => jsonResponse({ data: { status: "ok", timestamp: "now" } }),
      "/auth/me": () =>
        jsonResponse({
          data: {
            user: { id: "1", email: "existing@example.com", role: "CUSTOMER", createdAt: "now" },
          },
        }),
    });

    const wrapper = await mountSuspended(App);
    await flushPromises();

    expect(wrapper.text()).toContain("Signed in as existing@example.com");
  });
});
