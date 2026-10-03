import { mountSuspended } from "@nuxt/test-utils/runtime";
import { flushPromises } from "@vue/test-utils";
import type { CartItem } from "@kiranabar/types";
import { afterEach, describe, expect, it, vi } from "vitest";
import { clearNuxtData } from "#imports";
import { jsonResponse, mockFetchRoutes } from "../test/mock-fetch";
import CartPage from "./cart.vue";

function line(overrides: Partial<CartItem> = {}): CartItem {
  return {
    productId: "p1",
    product: {
      id: "p1",
      name: "Classic Tee",
      slug: "classic-tee",
      price: "24.99",
      salePrice: null,
      currency: "USD",
      status: "ACTIVE",
      image: "https://cdn.example.com/tee.jpg",
    },
    variantId: null,
    variant: null,
    quantity: 2,
    unitPrice: "24.99",
    lineTotal: "49.98",
    ...overrides,
  };
}

const HOODIE_RED_M: CartItem = line({
  productId: "p2",
  product: {
    id: "p2",
    name: "Hoodie",
    slug: "hoodie",
    price: "59.00",
    salePrice: null,
    currency: "USD",
    status: "ACTIVE",
    image: null,
  },
  variantId: "v1",
  variant: {
    id: "v1",
    sku: "HOODIE-RED-M",
    attributes: { color: "Red", size: "M" },
    price: "55.00",
    salePrice: null,
    status: "ACTIVE",
  },
  quantity: 1,
  unitPrice: "55.00",
  lineTotal: "55.00",
});

function cart(items: CartItem[], subtotal: string) {
  return { data: { id: "cart1", items, subtotal, currency: "USD" } };
}

async function mountCart() {
  const wrapper = await mountSuspended(CartPage, { route: "/cart" });
  await flushPromises();
  return wrapper;
}

describe("Cart page", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    // useAsyncData caches by key across mounts within the test Nuxt app.
    clearNuxtData();
  });

  // The cart belongs to the browser (guest cookie or session), so it's
  // fetched there, not during server rendering -- which shows this first.
  it("shows a loading state while the cart is being fetched", async () => {
    mockFetchRoutes({ "/cart": () => new Promise<Response>(() => {}) });

    const wrapper = await mountSuspended(CartPage, { route: "/cart" });

    expect(wrapper.text()).toContain("Loading your cart…");
    expect(wrapper.text()).not.toContain("Your cart is empty.");
  });

  it("lists each line with its product, variant, prices, and the subtotal", async () => {
    mockFetchRoutes({ "/cart": () => jsonResponse(cart([line(), HOODIE_RED_M], "104.98")) });

    const wrapper = await mountCart();

    const rows = wrapper.findAll("[data-cart-line]");
    expect(rows).toHaveLength(2);

    expect(rows[0]!.find("a").attributes("href")).toBe("/products/classic-tee");
    expect(rows[0]!.find("a").text()).toBe("Classic Tee");
    expect(rows[0]!.find("[data-unit-price]").text()).toBe("$24.99");
    expect((rows[0]!.find("input[type=number]").element as HTMLInputElement).value).toBe("2");
    expect(rows[0]!.find("[data-line-total]").text()).toBe("$49.98");

    expect(rows[1]!.find("a").text()).toBe("Hoodie");
    expect(rows[1]!.text()).toContain("Color: Red · Size: M");
    expect(rows[1]!.find("[data-line-total]").text()).toBe("$55.00");

    expect(wrapper.find("[data-subtotal]").text()).toBe("$104.98");
  });

  it("shows an empty cart with a link back to the shop", async () => {
    mockFetchRoutes({
      "/cart": () =>
        jsonResponse({ data: { id: null, items: [], subtotal: "0.00", currency: "USD" } }),
    });

    const wrapper = await mountCart();

    expect(wrapper.findAll("[data-cart-line]")).toHaveLength(0);
    expect(wrapper.text()).toContain("Your cart is empty.");
    expect(wrapper.find("a[href='/']").text()).toBe("Continue shopping");
    expect(wrapper.find("[data-subtotal]").exists()).toBe(false);
  });

  it("shows an alert when the cart can't be loaded", async () => {
    mockFetchRoutes({
      "/cart": () =>
        jsonResponse(
          { error: { code: "INTERNAL_SERVER_ERROR", message: "Internal server error" } },
          500,
        ),
    });

    const wrapper = await mountCart();

    expect(wrapper.find("[role=alert]").text()).toContain("couldn't load your cart");
  });

  describe("changing a quantity", () => {
    it("updates a variant line by product and variant, showing the new totals", async () => {
      let request: { method?: string; url?: URL; body?: unknown } = {};
      mockFetchRoutes({
        "/cart": () => jsonResponse(cart([line(), HOODIE_RED_M], "104.98")),
        "/cart/items/p2": (url, init) => {
          request = { method: init?.method, url, body: JSON.parse(init?.body as string) };
          return jsonResponse(
            cart([line(), { ...HOODIE_RED_M, quantity: 2, lineTotal: "110.00" }], "159.98"),
          );
        },
      });
      const wrapper = await mountCart();

      const quantity = wrapper.findAll("[data-cart-line]")[1]!.find("input[type=number]");
      await quantity.setValue(2);
      await quantity.trigger("change");
      await flushPromises();

      expect(request.method).toBe("PATCH");
      expect(request.url?.searchParams.get("variantId")).toBe("v1");
      expect(request.body).toEqual({ quantity: 2 });
      expect(wrapper.findAll("[data-cart-line]")[1]!.find("[data-line-total]").text()).toBe(
        "$110.00",
      );
      expect(wrapper.find("[data-subtotal]").text()).toBe("$159.98");
    });

    it("updates a plain line without a variantId", async () => {
      let url: URL | undefined;
      mockFetchRoutes({
        "/cart": () => jsonResponse(cart([line()], "49.98")),
        "/cart/items/p1": (requestUrl) => {
          url = requestUrl;
          return jsonResponse(cart([line({ quantity: 3, lineTotal: "74.97" })], "74.97"));
        },
      });
      const wrapper = await mountCart();

      const quantity = wrapper.find("input[type=number]");
      await quantity.setValue(3);
      await quantity.trigger("change");
      await flushPromises();

      expect(url?.searchParams.has("variantId")).toBe(false);
      expect(wrapper.find("[data-subtotal]").text()).toBe("$74.97");
    });

    it("shows the API's reason and restores the quantity when the change is rejected", async () => {
      mockFetchRoutes({
        "/cart": () => jsonResponse(cart([line()], "49.98")),
        "/cart/items/p1": () =>
          jsonResponse(
            {
              error: { code: "BAD_REQUEST", message: 'Only 5 unit(s) of "Classic Tee" available' },
            },
            400,
          ),
      });
      const wrapper = await mountCart();

      const quantity = wrapper.find("input[type=number]");
      await quantity.setValue(9);
      await quantity.trigger("change");
      await flushPromises();

      expect(wrapper.find("[role=alert]").text()).toContain(
        'Only 5 unit(s) of "Classic Tee" available',
      );
      expect((wrapper.find("input[type=number]").element as HTMLInputElement).value).toBe("2");
      expect(wrapper.find("[data-subtotal]").text()).toBe("$49.98");
    });
  });

  describe("removing a line", () => {
    it("removes a variant line by product and variant", async () => {
      let request: { method?: string; url?: URL } = {};
      mockFetchRoutes({
        "/cart": () => jsonResponse(cart([line(), HOODIE_RED_M], "104.98")),
        "/cart/items/p2": (url, init) => {
          request = { method: init?.method, url };
          return jsonResponse(cart([line()], "49.98"));
        },
      });
      const wrapper = await mountCart();

      await wrapper.find("button[aria-label='Remove Hoodie']").trigger("click");
      await flushPromises();

      expect(request.method).toBe("DELETE");
      expect(request.url?.searchParams.get("variantId")).toBe("v1");
      expect(wrapper.findAll("[data-cart-line] a").map((link) => link.text())).toEqual([
        "Classic Tee",
      ]);
      expect(wrapper.find("[data-subtotal]").text()).toBe("$49.98");
    });

    it("shows the empty cart after removing the last line", async () => {
      mockFetchRoutes({
        "/cart": () => jsonResponse(cart([line()], "49.98")),
        "/cart/items/p1": () => jsonResponse(cart([], "0.00")),
      });
      const wrapper = await mountCart();

      await wrapper.find("button[aria-label='Remove Classic Tee']").trigger("click");
      await flushPromises();

      expect(wrapper.text()).toContain("Your cart is empty.");
    });
  });

  it("flags lines whose product or variant is no longer available", async () => {
    const archivedProduct = line({
      product: { ...line().product, status: "ARCHIVED" },
    });
    const archivedVariant: CartItem = {
      ...HOODIE_RED_M,
      variant: { ...HOODIE_RED_M.variant!, status: "ARCHIVED" },
    };
    const available = line({
      productId: "p3",
      product: { ...line().product, id: "p3", name: "Cap", slug: "cap" },
    });
    mockFetchRoutes({
      "/cart": () => jsonResponse(cart([archivedProduct, archivedVariant, available], "0.00")),
    });

    const wrapper = await mountCart();

    const unavailable = wrapper
      .findAll("[data-cart-line]")
      .map((row) => row.text().includes("No longer available"));
    expect(unavailable).toEqual([true, true, false]);
  });

  it("offers to check out when the cart has items, and not when it's empty", async () => {
    mockFetchRoutes({ "/cart": () => jsonResponse(cart([line()], "49.98")) });
    const withItems = await mountCart();
    expect(withItems.find("a[href='/checkout']").text()).toBe("Check out");

    vi.unstubAllGlobals();
    clearNuxtData();
    mockFetchRoutes({ "/cart": () => jsonResponse(cart([], "0.00")) });
    const empty = await mountCart();
    expect(empty.find("a[href='/checkout']").exists()).toBe(false);
  });
});
