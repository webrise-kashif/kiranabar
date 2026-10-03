import { mountSuspended } from "@nuxt/test-utils/runtime";
import { flushPromises } from "@vue/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import { clearNuxtData } from "#imports";
import { jsonResponse, mockFetchRoutes } from "./test/mock-fetch";
import App from "./app.vue";

// Every App render now includes the catalog page (NuxtPage at "/"), so each
// test needs its endpoints too -- otherwise the page would quietly fall into
// its error state and hide a broken mock.
const CATALOG_ROUTES = {
  "/categories": () => jsonResponse({ data: { items: [], total: 0, page: 1, pageSize: 100 } }),
  "/products": () => jsonResponse({ data: { items: [], total: 0, page: 1, pageSize: 12 } }),
};

describe("App", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    clearNuxtData();
  });

  it("renders the web store heading, API status, and a login form when signed out", async () => {
    mockFetchRoutes({
      ...CATALOG_ROUTES,
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
      ...CATALOG_ROUTES,
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
      ...CATALOG_ROUTES,
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

  it("shows the catalog page under the header at /", async () => {
    mockFetchRoutes({
      ...CATALOG_ROUTES,
      "/health": () => jsonResponse({ data: { status: "ok", timestamp: "now" } }),
      "/auth/me": () =>
        jsonResponse({ error: { code: "UNAUTHORIZED", message: "No session" } }, 401),
    });

    const wrapper = await mountSuspended(App, { route: "/" });
    await flushPromises();

    expect(wrapper.text()).toContain("Web Store");
    expect(wrapper.findAll("h1").map((heading) => heading.text())).toContain("Shop");
  });

  it("links to the cart from the header", async () => {
    mockFetchRoutes({
      ...CATALOG_ROUTES,
      "/health": () => jsonResponse({ data: { status: "ok", timestamp: "now" } }),
      "/auth/me": () =>
        jsonResponse({ error: { code: "UNAUTHORIZED", message: "No session" } }, 401),
    });

    const wrapper = await mountSuspended(App, { route: "/" });
    await flushPromises();

    expect(wrapper.find("header a[href='/cart']").text()).toBe("Cart");
  });
});
