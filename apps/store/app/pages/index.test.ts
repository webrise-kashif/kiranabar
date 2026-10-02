import { mountSuspended } from "@nuxt/test-utils/runtime";
import { flushPromises } from "@vue/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import { clearNuxtData } from "#imports";
import { jsonResponse, mockFetchRoutes, requestedUrls } from "../test/mock-fetch";
import CatalogPage from "./index.vue";

function product(overrides: Record<string, unknown> = {}) {
  return {
    id: "p1",
    name: "Classic Tee",
    slug: "classic-tee",
    description: null,
    sku: "TSHIRT-001",
    price: "24.99",
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

function page(items: unknown[], overrides: Record<string, unknown> = {}) {
  return { data: { items, total: items.length, page: 1, pageSize: 12, ...overrides } };
}

const NO_CATEGORIES = () => jsonResponse(page([]));

describe("Catalog page", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    // useAsyncData caches by key across mounts within the test Nuxt app.
    clearNuxtData();
  });

  it("lists products with their price, showing a sale price next to the struck-through original", async () => {
    mockFetchRoutes({
      "/categories": NO_CATEGORIES,
      "/products": () =>
        jsonResponse(
          page([
            product(),
            product({
              id: "p2",
              name: "Hoodie",
              slug: "hoodie",
              price: "59.00",
              salePrice: "45.00",
              images: [
                {
                  id: "i1",
                  url: "https://cdn.example.com/hoodie.jpg",
                  altText: "Grey hoodie",
                  position: 0,
                  isPrimary: true,
                  variantId: null,
                },
              ],
            }),
          ]),
        ),
    });

    const wrapper = await mountSuspended(CatalogPage);
    await flushPromises();

    const cards = wrapper.findAll("article");
    expect(cards).toHaveLength(2);

    expect(cards[0]!.find("h2").text()).toBe("Classic Tee");
    expect(cards[0]!.text()).toContain("$24.99");

    expect(cards[1]!.find("h2").text()).toBe("Hoodie");
    expect(cards[1]!.text()).toContain("$45.00");
    expect(cards[1]!.find("s").text()).toBe("$59.00");
    expect(cards[1]!.find("img").attributes()).toMatchObject({
      src: "https://cdn.example.com/hoodie.jpg",
      alt: "Grey hoodie",
    });
  });

  it("shows a message when there are no products", async () => {
    mockFetchRoutes({ "/categories": NO_CATEGORIES, "/products": () => jsonResponse(page([])) });

    const wrapper = await mountSuspended(CatalogPage);
    await flushPromises();

    expect(wrapper.findAll("article")).toHaveLength(0);
    expect(wrapper.text()).toContain("No products found.");
  });

  it("shows an alert instead of a blank page when the catalog can't be loaded", async () => {
    mockFetchRoutes({
      "/categories": NO_CATEGORIES,
      "/products": () =>
        jsonResponse(
          { error: { code: "INTERNAL_SERVER_ERROR", message: "Internal server error" } },
          500,
        ),
    });

    const wrapper = await mountSuspended(CatalogPage);
    await flushPromises();

    expect(wrapper.find("[role=alert]").text()).toContain("couldn't load the catalog");
    expect(wrapper.text()).not.toContain("No products found.");
  });

  it("searches products by name", async () => {
    const fetchMock = mockFetchRoutes({
      "/categories": NO_CATEGORIES,
      "/products": (url) =>
        jsonResponse(
          page(
            url.searchParams.get("search") === "hood"
              ? [product({ id: "p2", name: "Hoodie", slug: "hoodie" })]
              : [product(), product({ id: "p2", name: "Hoodie", slug: "hoodie" })],
          ),
        ),
    });

    const wrapper = await mountSuspended(CatalogPage);
    await flushPromises();

    await wrapper.find("input[type=search]").setValue("hood");
    await wrapper.find("form[role=search]").trigger("submit");
    await flushPromises();

    expect(requestedUrls(fetchMock, "/products").at(-1)?.searchParams.get("search")).toBe("hood");
    expect(wrapper.findAll("article h2").map((heading) => heading.text())).toEqual(["Hoodie"]);
  });

  it("filters products by category", async () => {
    const shirts = {
      id: "c1",
      name: "Shirts",
      slug: "shirts",
      description: null,
      status: "ACTIVE",
      parentId: null,
    };
    const fetchMock = mockFetchRoutes({
      "/categories": () => jsonResponse(page([shirts])),
      "/products": (url) =>
        jsonResponse(
          page(
            url.searchParams.get("categoryId") === "c1"
              ? [product()]
              : [product(), product({ id: "p2", name: "Hoodie", slug: "hoodie" })],
          ),
        ),
    });

    const wrapper = await mountSuspended(CatalogPage);
    await flushPromises();

    const select = wrapper.find("select");
    expect(select.findAll("option").map((option) => option.text())).toEqual([
      "All categories",
      "Shirts",
    ]);

    await select.setValue("c1");
    await flushPromises();

    expect(requestedUrls(fetchMock, "/products").at(-1)?.searchParams.get("categoryId")).toBe("c1");
    expect(wrapper.findAll("article h2").map((heading) => heading.text())).toEqual(["Classic Tee"]);
  });

  it("pages through results", async () => {
    const fetchMock = mockFetchRoutes({
      "/categories": NO_CATEGORIES,
      "/products": (url) => {
        const current = Number(url.searchParams.get("page"));
        return jsonResponse(
          page([product({ id: `p${current}`, name: `Product on page ${current}` })], {
            total: 30,
            page: current,
          }),
        );
      },
    });

    const wrapper = await mountSuspended(CatalogPage);
    await flushPromises();

    const nav = wrapper.find("nav[aria-label=Pagination]");
    expect(nav.text()).toContain("Page 1 of 3");
    expect(nav.find("button[aria-label='Previous page']").attributes("disabled")).toBeDefined();

    await nav.find("button[aria-label='Next page']").trigger("click");
    await flushPromises();

    expect(requestedUrls(fetchMock, "/products").at(-1)?.searchParams.get("page")).toBe("2");
    expect(wrapper.find("nav[aria-label=Pagination]").text()).toContain("Page 2 of 3");
    expect(wrapper.find("article h2").text()).toBe("Product on page 2");
  });

  it("hides pagination when everything fits on one page", async () => {
    mockFetchRoutes({
      "/categories": NO_CATEGORIES,
      "/products": () => jsonResponse(page([product()])),
    });

    const wrapper = await mountSuspended(CatalogPage);
    await flushPromises();

    expect(wrapper.find("nav[aria-label=Pagination]").exists()).toBe(false);
  });
});
