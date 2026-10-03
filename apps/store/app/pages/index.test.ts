import type { Category, Product } from "@kiranabar/types";
import { mountSuspended } from "@nuxt/test-utils/runtime";
import { flushPromises } from "@vue/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import { clearNuxtData } from "#imports";
import { jsonResponse, mockFetchRoutes, requestedUrls } from "../test/mock-fetch";
import LandingPage from "./index.vue";

function category(overrides: Partial<Category> = {}): Category {
  return {
    id: "c1",
    name: "Shirts",
    slug: "shirts",
    description: null,
    status: "ACTIVE",
    parentId: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function product(overrides: Partial<Product> = {}): Product {
  return {
    id: "p1",
    name: "Classic Tee",
    slug: "classic-tee",
    description: null,
    sku: "TSHIRT-001",
    price: "25.00",
    salePrice: null,
    currency: "USD",
    status: "ACTIVE",
    categoryId: null,
    category: null,
    images: [],
    inventory: { quantityAvailable: 10, quantityReserved: 0, version: 0 },
    variants: [],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function page<T>(items: T[]) {
  return { data: { items, total: items.length, page: 1, pageSize: 100 } };
}

async function mountLanding() {
  const wrapper = await mountSuspended(LandingPage, { route: "/" });
  await flushPromises();
  return wrapper;
}

describe("Landing page", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    clearNuxtData();
  });

  it("opens with a hero that leads to the full catalog", async () => {
    mockFetchRoutes({
      "/categories": () => jsonResponse(page([])),
      "/products": () => jsonResponse(page([])),
    });

    const wrapper = await mountLanding();

    const hero = wrapper.find("[data-hero]");
    expect(hero.find("h1").text()).toBe("Everything you need, all in one place");
    expect(hero.find("a[href='/products']").text()).toBe("Shop all products");
  });

  it("shows a tile per top-level category, each opening the filtered catalog", async () => {
    mockFetchRoutes({
      "/categories": () =>
        jsonResponse(
          page([
            category(),
            category({ id: "c2", name: "Snacks", slug: "snacks" }),
            category({ id: "c3", name: "T-Shirts", slug: "t-shirts", parentId: "c1" }),
          ]),
        ),
      "/products": () => jsonResponse(page([])),
    });

    const wrapper = await mountLanding();

    const tiles = wrapper.findAll("[data-category-tile]");
    expect(tiles.map((tile) => tile.text())).toEqual(["Shirts", "Snacks"]);
    expect(tiles.map((tile) => tile.attributes("href"))).toEqual([
      "/products?category=c1",
      "/products?category=c2",
    ]);
  });

  it("hides the category section when there are no categories", async () => {
    mockFetchRoutes({
      "/categories": () => jsonResponse(page([])),
      "/products": () => jsonResponse(page([])),
    });

    const wrapper = await mountLanding();

    expect(wrapper.find("[data-categories]").exists()).toBe(false);
  });

  it("shows the newest products with sale and sold-out badges, linking to each product", async () => {
    const fetchMock = mockFetchRoutes({
      "/categories": () => jsonResponse(page([])),
      "/products": () =>
        jsonResponse(
          page([
            product({ salePrice: "20.00" }),
            product({
              id: "p2",
              name: "Hoodie",
              slug: "hoodie",
              inventory: { quantityAvailable: 0, quantityReserved: 0, version: 0 },
            }),
          ]),
        ),
    });

    const wrapper = await mountLanding();

    expect(requestedUrls(fetchMock, "/products")[0]?.searchParams.get("pageSize")).toBe("8");
    const section = wrapper.find("[data-new-arrivals]");
    expect(section.find("h2").text()).toBe("New arrivals");
    expect(section.find("a[href='/products']").text()).toBe("View all");

    const cards = section.findAll("article");
    expect(cards[0]!.find("a").attributes("href")).toBe("/products/classic-tee");
    expect(cards[0]!.find("[data-discount]").text()).toBe("-20%");
    expect(cards[0]!.find("[data-sold-out]").exists()).toBe(false);
    expect(cards[1]!.find("[data-sold-out]").text()).toBe("Sold out");
    expect(cards[1]!.find("[data-discount]").exists()).toBe(false);
  });

  it("explains, in three points, what the store actually offers", async () => {
    mockFetchRoutes({
      "/categories": () => jsonResponse(page([])),
      "/products": () => jsonResponse(page([])),
    });

    const wrapper = await mountLanding();

    expect(wrapper.findAll("[data-benefits] h3").map((heading) => heading.text())).toEqual([
      "Track every order",
      "Cancel before it's paid",
      "Your cart follows you",
    ]);
  });

  it("still shows the rest of the page when products can't be loaded", async () => {
    mockFetchRoutes({
      "/categories": () => jsonResponse(page([category()])),
      "/products": () =>
        jsonResponse(
          { error: { code: "INTERNAL_SERVER_ERROR", message: "Internal server error" } },
          500,
        ),
    });

    const wrapper = await mountLanding();

    expect(wrapper.find("[data-new-arrivals] [role=alert]").text()).toContain(
      "couldn't load new arrivals",
    );
    expect(wrapper.find("[data-hero] h1").exists()).toBe(true);
    expect(wrapper.findAll("[data-category-tile]")).toHaveLength(1);
  });
});
