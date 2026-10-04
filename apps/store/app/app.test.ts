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
  it("brands the header with the Kiranabar logo linking home, and a Sign in link", async () => {
    mockFetchRoutes({
      ...CATALOG_ROUTES,
      "/auth/me": () =>
        jsonResponse({ error: { code: "UNAUTHORIZED", message: "No session" } }, 401),
      "/auth/refresh": () =>
        jsonResponse({ error: { code: "UNAUTHORIZED", message: "No session" } }, 401),
    });

    const wrapper = await mountSuspended(App, { route: "/" });
    await flushPromises();

    const logo = wrapper.find("header a[href='/'] img");
    expect(logo.attributes()).toMatchObject({ src: "/kiranabar.svg", alt: "Kiranabar" });
    // The old placeholder title and API status line are gone.
    expect(wrapper.find("header").text()).not.toContain("Web Store");
    expect(wrapper.find("header").text()).not.toContain("API status");
    expect(wrapper.find("header a[href='/account']").text()).toBe("Sign in");
    expect(wrapper.find("header input").exists()).toBe(false);
  });

  // The browser smoke tests wait for this to know the client app has mounted
  // (see apps/store/e2e) -- it replaced the old "API status" line as that signal.
  it("marks the app as hydrated once it has mounted in the browser", async () => {
    mockFetchRoutes({
      ...CATALOG_ROUTES,
      "/auth/me": () =>
        jsonResponse({ error: { code: "UNAUTHORIZED", message: "No session" } }, 401),
      "/auth/refresh": () =>
        jsonResponse({ error: { code: "UNAUTHORIZED", message: "No session" } }, 401),
    });

    const wrapper = await mountSuspended(App, { route: "/" });
    await flushPromises();

    expect(wrapper.find("[data-hydrated]").exists()).toBe(true);
  });

  it("links to the account instead when a session already exists", async () => {
    mockFetchRoutes({
      ...CATALOG_ROUTES,
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

  it("shows the landing page at /, with the catalog a click away", async () => {
    mockFetchRoutes({
      ...CATALOG_ROUTES,
      "/auth/me": () =>
        jsonResponse({ error: { code: "UNAUTHORIZED", message: "No session" } }, 401),
      "/auth/refresh": () =>
        jsonResponse({ error: { code: "UNAUTHORIZED", message: "No session" } }, 401),
    });

    const wrapper = await mountSuspended(App, { route: "/" });
    await flushPromises();

    expect(wrapper.findAll("h1").map((heading) => heading.text())).toContain(
      "Everything you need, all in one place",
    );
    expect(wrapper.find("header a[href='/products']").text()).toBe("Shop");
  });

  it("ends every page with a footer linking to the shop and the account", async () => {
    mockFetchRoutes({
      ...CATALOG_ROUTES,
      "/auth/me": () =>
        jsonResponse({ error: { code: "UNAUTHORIZED", message: "No session" } }, 401),
      "/auth/refresh": () =>
        jsonResponse({ error: { code: "UNAUTHORIZED", message: "No session" } }, 401),
    });

    const wrapper = await mountSuspended(App, { route: "/" });
    await flushPromises();

    const footer = wrapper.find("footer");
    expect(footer.findAll("a").map((link) => [link.text(), link.attributes("href")])).toEqual([
      ["All products", "/products"],
      ["Cart", "/cart"],
      ["Account", "/account"],
      ["My orders", "/orders"],
    ]);
    expect(footer.text()).toContain(`© ${new Date().getFullYear()} Kiranabar`);
  });

  it("links to the cart from the header", async () => {
    mockFetchRoutes({
      ...CATALOG_ROUTES,
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
      "/auth/me": () =>
        jsonResponse({ error: { code: "UNAUTHORIZED", message: "No session" } }, 401),
    });
    const signedOut = await mountSuspended(App, { route: "/" });
    await flushPromises();
    expect(signedOut.find("header a[href='/orders']").exists()).toBe(false);
  });
});
