import { mountSuspended } from "@nuxt/test-utils/runtime";
import { flushPromises } from "@vue/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import { clearNuxtData, useState } from "#imports";
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

  // Signing in and creating an account live on /account (see
  // pages/account.test.ts); the header only links there.
  it("shows the heading, API status, and a Sign in link -- no inline form -- when signed out", async () => {
    mockFetchRoutes({
      ...CATALOG_ROUTES,
      "/health": () => jsonResponse({ data: { status: "ok", timestamp: "now" } }),
      "/auth/me": () =>
        jsonResponse({ error: { code: "UNAUTHORIZED", message: "No session" } }, 401),
      "/auth/refresh": () =>
        jsonResponse({ error: { code: "UNAUTHORIZED", message: "No session" } }, 401),
    });

    const wrapper = await mountSuspended(App, { route: "/" });
    await flushPromises();

    expect(wrapper.text()).toContain("Web Store");
    expect(wrapper.text()).toContain("API status: ok");
    expect(wrapper.find("header a[href='/account']").text()).toBe("Sign in");
    expect(wrapper.find("header input").exists()).toBe(false);
  });

  it("links to the account instead when a session already exists", async () => {
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

    const wrapper = await mountSuspended(App, { route: "/" });
    await flushPromises();

    expect(wrapper.find("header a[href='/account']").text()).toBe("Account");
    expect(wrapper.text()).not.toContain("Sign in");
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

  it("links to the shopper's orders from the header only when signed in", async () => {
    mockFetchRoutes({
      ...CATALOG_ROUTES,
      "/health": () => jsonResponse({ data: { status: "ok", timestamp: "now" } }),
      "/auth/me": () =>
        jsonResponse({
          data: {
            user: { id: "1", email: "jane@example.com", role: "CUSTOMER", createdAt: "now" },
          },
        }),
    });
    const signedIn = await mountSuspended(App, { route: "/" });
    await flushPromises();
    expect(signedIn.find("header a[href='/orders']").text()).toBe("My orders");

    vi.unstubAllGlobals();
    clearNuxtData();
    useState("auth-user").value = null;
    mockFetchRoutes({
      ...CATALOG_ROUTES,
      "/health": () => jsonResponse({ data: { status: "ok", timestamp: "now" } }),
      "/auth/me": () =>
        jsonResponse({ error: { code: "UNAUTHORIZED", message: "No session" } }, 401),
    });
    const signedOut = await mountSuspended(App, { route: "/" });
    await flushPromises();
    expect(signedOut.find("header a[href='/orders']").exists()).toBe(false);
  });
});
