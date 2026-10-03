import { mountSuspended } from "@nuxt/test-utils/runtime";
import { flushPromises } from "@vue/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import { clearNuxtData } from "#imports";
import { jsonResponse, mockFetchRoutes } from "../../test/mock-fetch";
import ProductPage from "./[slug].vue";

function image(overrides: Record<string, unknown> = {}) {
  return {
    id: "i1",
    url: "https://cdn.example.com/tee-front.jpg",
    altText: "Tee, front",
    position: 0,
    isPrimary: true,
    variantId: null,
    ...overrides,
  };
}

function product(overrides: Record<string, unknown> = {}) {
  return {
    id: "p1",
    name: "Classic Tee",
    slug: "classic-tee",
    description: "Soft cotton, relaxed fit.",
    sku: "TSHIRT-001",
    price: "24.99",
    salePrice: null,
    currency: "USD",
    status: "ACTIVE",
    categoryId: "c1",
    category: { id: "c1", name: "Shirts", slug: "shirts" },
    images: [image()],
    inventory: { quantityAvailable: 10, quantityReserved: 0, version: 0 },
    variants: [],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

async function mountAt(slug: string) {
  const wrapper = await mountSuspended(ProductPage, { route: `/products/${slug}` });
  await flushPromises();
  return wrapper;
}

describe("Product detail page", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    // useAsyncData caches by key across mounts within the test Nuxt app.
    clearNuxtData();
  });

  it("shows the product's name, category, description, and sale price", async () => {
    mockFetchRoutes({
      "/products/classic-tee": () =>
        jsonResponse({ data: product({ price: "24.99", salePrice: "19.99" }) }),
    });

    const wrapper = await mountAt("classic-tee");

    expect(wrapper.find("h1").text()).toBe("Classic Tee");
    expect(wrapper.text()).toContain("Shirts");
    expect(wrapper.text()).toContain("Soft cotton, relaxed fit.");
    expect(wrapper.find("[data-price]").text()).toContain("$19.99");
    expect(wrapper.find("[data-price] s").text()).toBe("$24.99");
  });

  it("shows a not-found message with a link back to the shop for an unknown product", async () => {
    mockFetchRoutes({
      "/products/nope": () =>
        jsonResponse({ error: { code: "NOT_FOUND", message: "Product not found" } }, 404),
    });

    const wrapper = await mountAt("nope");

    expect(wrapper.find("h1").text()).toBe("Product not found");
    expect(wrapper.find("a[href='/']").text()).toBe("Back to shop");
  });

  it("shows an alert when the product can't be loaded for another reason", async () => {
    mockFetchRoutes({
      "/products/classic-tee": () =>
        jsonResponse(
          { error: { code: "INTERNAL_SERVER_ERROR", message: "Internal server error" } },
          500,
        ),
    });

    const wrapper = await mountAt("classic-tee");

    expect(wrapper.find("[role=alert]").text()).toContain("couldn't load this product");
    expect(wrapper.text()).not.toContain("Product not found");
  });

  it("shows the primary image large, swaps it from the thumbnails, and leaves variant photos out", async () => {
    mockFetchRoutes({
      "/products/classic-tee": () =>
        jsonResponse({
          data: product({
            images: [
              image({
                id: "i2",
                url: "https://cdn.example.com/tee-back.jpg",
                altText: "Tee, back",
                position: 1,
                isPrimary: false,
              }),
              image(),
              image({
                id: "i3",
                url: "https://cdn.example.com/tee-red.jpg",
                altText: "Red tee",
                isPrimary: false,
                variantId: "v1",
              }),
            ],
          }),
        }),
    });

    const wrapper = await mountAt("classic-tee");

    const main = () => wrapper.find("[data-main-image]");
    expect(main().attributes("src")).toBe("https://cdn.example.com/tee-front.jpg");

    const thumbnails = wrapper.findAll("button[aria-label^='Show image']");
    expect(thumbnails.map((thumb) => thumb.find("img").attributes("alt"))).toEqual([
      "Tee, front",
      "Tee, back",
    ]);

    await thumbnails[1]!.trigger("click");

    expect(main().attributes()).toMatchObject({
      src: "https://cdn.example.com/tee-back.jpg",
      alt: "Tee, back",
    });
  });

  it("shows stock status, disabling Add to cart when nothing is available", async () => {
    mockFetchRoutes({
      "/products/classic-tee": () => jsonResponse({ data: product() }),
      "/products/sold-out": () =>
        jsonResponse({
          data: product({
            slug: "sold-out",
            inventory: { quantityAvailable: 0, quantityReserved: 0, version: 3 },
          }),
        }),
    });

    const inStock = await mountAt("classic-tee");
    expect(inStock.find("[data-stock]").text()).toBe("In stock");
    expect(inStock.find("button[type=submit]").attributes("disabled")).toBeUndefined();

    const soldOut = await mountAt("sold-out");
    expect(soldOut.find("[data-stock]").text()).toBe("Out of stock");
    expect(soldOut.find("button[type=submit]").attributes("disabled")).toBeDefined();
  });

  it("adds the chosen quantity to the cart and confirms it", async () => {
    let postBody: unknown;
    mockFetchRoutes({
      "/products/classic-tee": () => jsonResponse({ data: product() }),
      "/cart/items": (_url, init) => {
        postBody = JSON.parse(init?.body as string);
        return jsonResponse(
          { data: { id: "cart1", items: [], subtotal: "49.98", currency: "USD" } },
          201,
        );
      },
    });
    const wrapper = await mountAt("classic-tee");

    await wrapper.find("input[type=number]").setValue(2);
    await wrapper.find("form").trigger("submit");
    await flushPromises();

    expect(postBody).toEqual({ productId: "p1", quantity: 2 });
    expect(wrapper.find("[role=status]").text()).toContain("Added to cart");
  });

  it("shows the API's reason when the cart rejects the item", async () => {
    mockFetchRoutes({
      "/products/classic-tee": () => jsonResponse({ data: product() }),
      "/cart/items": () =>
        jsonResponse(
          { error: { code: "BAD_REQUEST", message: 'Only 10 unit(s) of "Classic Tee" available' } },
          400,
        ),
    });
    const wrapper = await mountAt("classic-tee");

    await wrapper.find("form").trigger("submit");
    await flushPromises();

    expect(wrapper.find("[role=alert]").text()).toContain(
      'Only 10 unit(s) of "Classic Tee" available',
    );
    expect(wrapper.find("[role=status]").exists()).toBe(false);
  });

  describe("with variants", () => {
    function variant(overrides: Record<string, unknown> = {}) {
      return {
        id: "v1",
        productId: "p1",
        sku: "TSHIRT-001-RED-M",
        price: "26.99",
        salePrice: null,
        currency: "USD",
        attributes: { color: "Red", size: "M" },
        status: "ACTIVE",
        images: [],
        inventory: { quantityAvailable: 4, quantityReserved: 0, version: 0 },
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
        ...overrides,
      };
    }

    const RED_IMAGE = image({
      id: "i9",
      url: "https://cdn.example.com/tee-red.jpg",
      altText: "Red tee",
      isPrimary: false,
      variantId: "v1",
    });

    function mockProductWithVariants(extraRoutes: Parameters<typeof mockFetchRoutes>[0] = {}) {
      mockFetchRoutes({
        ...extraRoutes,
        "/products/classic-tee": () =>
          jsonResponse({
            data: product({
              images: [image(), RED_IMAGE],
              variants: [
                variant({ images: [RED_IMAGE] }),
                variant({
                  id: "v2",
                  sku: "TSHIRT-001-BLUE-M",
                  price: "24.99",
                  salePrice: "21.00",
                  attributes: { color: "Blue", size: "M" },
                  inventory: { quantityAvailable: 0, quantityReserved: 0, version: 0 },
                }),
              ],
            }),
          }),
      });
    }

    it("offers each variant by its attributes and requires a choice before adding to cart", async () => {
      mockProductWithVariants();
      const wrapper = await mountAt("classic-tee");

      const options = wrapper.findAll("label:has(input[type=radio])");
      expect(options.map((option) => option.text())).toEqual([
        "Color: Red · Size: M",
        "Color: Blue · Size: M",
      ]);
      expect(wrapper.find("button[type=submit]").attributes("disabled")).toBeDefined();
    });

    it("switches price, stock, and photos to the chosen variant", async () => {
      mockProductWithVariants();
      const wrapper = await mountAt("classic-tee");

      await wrapper.find("input[type=radio][value=v1]").setValue(true);
      expect(wrapper.find("[data-price]").text()).toBe("$26.99");
      expect(wrapper.find("[data-stock]").text()).toBe("In stock");
      expect(wrapper.find("[data-main-image]").attributes("src")).toBe(
        "https://cdn.example.com/tee-red.jpg",
      );
      expect(wrapper.find("button[type=submit]").attributes("disabled")).toBeUndefined();

      await wrapper.find("input[type=radio][value=v2]").setValue(true);
      expect(wrapper.find("[data-price]").text()).toContain("$21.00");
      expect(wrapper.find("[data-price] s").text()).toBe("$24.99");
      expect(wrapper.find("[data-stock]").text()).toBe("Out of stock");
      // No photos of its own: falls back to the general gallery.
      expect(wrapper.find("[data-main-image]").attributes("src")).toBe(
        "https://cdn.example.com/tee-front.jpg",
      );
      expect(wrapper.find("button[type=submit]").attributes("disabled")).toBeDefined();
    });

    it("adds the chosen variant to the cart", async () => {
      let postBody: unknown;
      mockProductWithVariants({
        "/cart/items": (_url, init) => {
          postBody = JSON.parse(init?.body as string);
          return jsonResponse(
            { data: { id: "cart1", items: [], subtotal: "26.99", currency: "USD" } },
            201,
          );
        },
      });
      const wrapper = await mountAt("classic-tee");

      await wrapper.find("input[type=radio][value=v1]").setValue(true);
      await wrapper.find("form").trigger("submit");
      await flushPromises();

      expect(postBody).toEqual({ productId: "p1", variantId: "v1", quantity: 1 });
    });
  });
});
