import type { Cart, CartItem, Order, PublicUser } from "@kiranabar/types";
import { mountSuspended } from "@nuxt/test-utils/runtime";
import { flushPromises, type VueWrapper } from "@vue/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import { clearNuxtData, useRouter, useState } from "#imports";
import { jsonResponse, mockFetchRoutes } from "../test/mock-fetch";
import CheckoutPage from "./checkout.vue";

const USER: PublicUser = {
  id: "u1",
  email: "jane@example.com",
  role: "CUSTOMER",
  createdAt: "2026-01-01T00:00:00.000Z",
};

const LINE: CartItem = {
  productId: "p1",
  product: {
    id: "p1",
    name: "Classic Tee",
    slug: "classic-tee",
    price: "24.99",
    salePrice: null,
    currency: "USD",
    status: "ACTIVE",
    image: null,
  },
  variantId: null,
  variant: null,
  quantity: 2,
  unitPrice: "24.99",
  lineTotal: "49.98",
};

function cartWith(items: CartItem[], subtotal: string): { data: Cart } {
  return { data: { id: "cart1", items, subtotal, currency: "USD" } };
}

const SIGNED_OUT = () =>
  jsonResponse({ error: { code: "UNAUTHORIZED", message: "No session" } }, 401);
const SIGNED_IN = () => jsonResponse({ data: { user: USER } });

/** The input inside the <label> whose text starts with `label`. */
function field(wrapper: VueWrapper, label: string) {
  const match = wrapper.findAll("label").find((candidate) => candidate.text().startsWith(label));
  if (!match) throw new Error(`No field labelled "${label}"`);
  return match.find("input");
}

async function fillAddress(wrapper: VueWrapper) {
  await field(wrapper, "Recipient name").setValue("Jane Doe");
  await field(wrapper, "Address line 1").setValue("123 Main St");
  await field(wrapper, "City").setValue("Springfield");
  await field(wrapper, "State").setValue("IL");
  await field(wrapper, "Postal code").setValue("62704");
  await field(wrapper, "Country").setValue("us");
}

const ORDER: Order = {
  id: "o1",
  status: "PLACED",
  items: [],
  subtotal: "49.98",
  currency: "USD",
  shippingAddress: {
    recipientName: "Jane Doe",
    line1: "123 Main St",
    line2: null,
    city: "Springfield",
    state: "IL",
    postalCode: "62704",
    country: "US",
    phone: null,
  },
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

async function mountCheckout() {
  const wrapper = await mountSuspended(CheckoutPage, { route: "/checkout" });
  await flushPromises();
  return wrapper;
}

describe("Checkout page", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    clearNuxtData();
    // The signed-in user is shared state (useAuth) -- reset it between tests.
    useState<PublicUser | null>("auth-user").value = null;
  });

  it("asks a signed-out shopper to sign in, and doesn't show the form", async () => {
    mockFetchRoutes({ "/auth/me": SIGNED_OUT });

    const wrapper = await mountCheckout();

    expect(wrapper.text()).toContain("Sign in to check out");
    expect(wrapper.find("form").exists()).toBe(false);
  });

  it("shows the order summary and the shipping address form when signed in", async () => {
    mockFetchRoutes({
      "/auth/me": SIGNED_IN,
      "/cart": () => jsonResponse(cartWith([LINE], "49.98")),
    });

    const wrapper = await mountCheckout();

    const summary = wrapper.find("[data-order-summary]");
    expect(summary.text()).toContain("Classic Tee");
    expect(summary.text()).toContain("× 2");
    expect(summary.find("[data-subtotal]").text()).toBe("$49.98");
    expect(wrapper.find("form").exists()).toBe(true);
    expect(wrapper.find("button[type=submit]").text()).toBe("Place order");
  });

  it("says the cart is empty, with no form, when there's nothing to check out", async () => {
    mockFetchRoutes({
      "/auth/me": SIGNED_IN,
      "/cart": () =>
        jsonResponse({ data: { id: null, items: [], subtotal: "0.00", currency: "USD" } }),
    });

    const wrapper = await mountCheckout();

    expect(wrapper.text()).toContain("Your cart is empty.");
    expect(wrapper.find("form").exists()).toBe(false);
  });

  it("loads the cart once the shopper signs in from the header", async () => {
    mockFetchRoutes({
      "/auth/me": SIGNED_OUT,
      "/cart": () => jsonResponse(cartWith([LINE], "49.98")),
    });
    const wrapper = await mountCheckout();
    expect(wrapper.text()).toContain("Sign in to check out");

    // What the header's sign-in form does on success (see useAuth).
    useState<PublicUser | null>("auth-user").value = USER;
    await flushPromises();

    expect(wrapper.find("[data-order-summary]").text()).toContain("Classic Tee");
  });

  describe("placing an order", () => {
    it("shows each missing field's error and sends nothing", async () => {
      const fetchMock = mockFetchRoutes({
        "/auth/me": SIGNED_IN,
        "/cart": () => jsonResponse(cartWith([LINE], "49.98")),
      });
      const wrapper = await mountCheckout();

      await wrapper.find("form").trigger("submit");
      await flushPromises();

      expect(field(wrapper, "Recipient name").attributes("aria-invalid")).toBe("true");
      expect(wrapper.text()).toContain("Recipient name is required");
      expect(wrapper.text()).toContain("City is required");
      expect(wrapper.text()).toContain('Country must be a 2-letter ISO code (e.g. "US")');
      // Optional fields aren't flagged.
      expect(field(wrapper, "Address line 2").attributes("aria-invalid")).toBeUndefined();
      expect(
        fetchMock.mock.calls.some(([input]) => String(input).includes("/orders/checkout")),
      ).toBe(false);
    });

    it("places the order and opens its confirmation", async () => {
      let body: unknown;
      mockFetchRoutes({
        "/auth/me": SIGNED_IN,
        "/cart": () => jsonResponse(cartWith([LINE], "49.98")),
        "/orders/checkout": (_url, init) => {
          body = JSON.parse(init?.body as string);
          return jsonResponse({ data: ORDER }, 201);
        },
      });
      const wrapper = await mountCheckout();

      await fillAddress(wrapper);
      await wrapper.find("form").trigger("submit");
      await flushPromises();

      expect(body).toEqual({
        shippingAddress: {
          recipientName: "Jane Doe",
          line1: "123 Main St",
          city: "Springfield",
          state: "IL",
          postalCode: "62704",
          country: "US",
        },
      });
      // Navigation lazy-loads the order page, so wait for it to land.
      await vi.waitFor(() => expect(useRouter().currentRoute.value.path).toBe("/orders/o1"));
      expect(useRouter().currentRoute.value.query.placed).toBe("1");
    });

    it("shows the API's reason when the order is rejected, and stays on the page", async () => {
      mockFetchRoutes({
        "/auth/me": SIGNED_IN,
        "/cart": () => jsonResponse(cartWith([LINE], "49.98")),
        "/orders/checkout": () =>
          jsonResponse(
            {
              error: {
                code: "CONFLICT",
                message: 'Stock for "Classic Tee" changed -- please try again',
              },
            },
            409,
          ),
      });
      const wrapper = await mountCheckout();

      await fillAddress(wrapper);
      await wrapper.find("form").trigger("submit");
      await flushPromises();

      expect(wrapper.find("[role=alert]").text()).toContain(
        'Stock for "Classic Tee" changed -- please try again',
      );
      expect(useRouter().currentRoute.value.path).toBe("/checkout");
    });
  });
});
