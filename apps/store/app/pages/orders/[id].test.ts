import type { Order } from "@kiranabar/types";
import { mountSuspended } from "@nuxt/test-utils/runtime";
import { flushPromises } from "@vue/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import { clearNuxtData } from "#imports";
import { jsonResponse, mockFetchRoutes } from "../../test/mock-fetch";
import OrderPage from "./[id].vue";

const ORDER: Order = {
  id: "01a1b2c3-0000-7000-8000-000000000001",
  status: "PLACED",
  items: [
    {
      productId: "p1",
      productName: "Classic Tee",
      productSku: "TSHIRT-001",
      variantId: null,
      variantSku: null,
      variantAttributes: null,
      unitPrice: "24.99",
      quantity: 2,
      lineTotal: "49.98",
    },
    {
      productId: "p2",
      productName: "Hoodie",
      productSku: "HOODIE-001",
      variantId: "v1",
      variantSku: "HOODIE-RED-M",
      variantAttributes: { color: "Red", size: "M" },
      unitPrice: "55.00",
      quantity: 1,
      lineTotal: "55.00",
    },
  ],
  subtotal: "104.98",
  currency: "USD",
  shippingAddress: {
    recipientName: "Jane Doe",
    line1: "123 Main St",
    line2: "Apt 4",
    city: "Springfield",
    state: "IL",
    postalCode: "62704",
    country: "US",
    phone: null,
  },
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

async function mountOrder(id: string, query = "") {
  const wrapper = await mountSuspended(OrderPage, { route: `/orders/${id}${query}` });
  await flushPromises();
  return wrapper;
}

describe("Order confirmation page", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    clearNuxtData();
  });

  it("confirms the order with its items, total, and shipping address", async () => {
    mockFetchRoutes({ [`/orders/${ORDER.id}`]: () => jsonResponse({ data: ORDER }) });

    // Arriving from checkout, which adds ?placed=1.
    const wrapper = await mountOrder(ORDER.id, "?placed=1");

    expect(wrapper.find("h1").text()).toBe("Thank you! Your order has been placed.");
    expect(wrapper.text()).toContain("Status: Placed");

    const lines = wrapper.findAll("[data-order-line]").map((row) => row.text());
    expect(lines[0]).toContain("Classic Tee");
    expect(lines[0]).toContain("× 2");
    expect(lines[0]).toContain("$49.98");
    expect(lines[1]).toContain("Hoodie (Color: Red · Size: M)");

    expect(wrapper.find("[data-subtotal]").text()).toBe("$104.98");
    expect(wrapper.findAll("address > *").map((addressLine) => addressLine.text())).toEqual([
      "Jane Doe",
      "123 Main St",
      "Apt 4",
      "Springfield, IL 62704",
      "US",
    ]);
  });

  it("says the order wasn't found for an unknown (or someone else's) order", async () => {
    mockFetchRoutes({
      "/orders/nope": () =>
        jsonResponse({ error: { code: "NOT_FOUND", message: "Order not found" } }, 404),
    });

    const wrapper = await mountOrder("nope");

    expect(wrapper.find("h1").text()).toBe("Order not found");
  });

  it("asks a signed-out visitor to sign in rather than reporting an error", async () => {
    mockFetchRoutes({
      [`/orders/${ORDER.id}`]: () =>
        jsonResponse({ error: { code: "UNAUTHORIZED", message: "Unauthorized" } }, 401),
      // The API client tries a token refresh on a 401 before giving up.
      "/auth/refresh": () =>
        jsonResponse({ error: { code: "UNAUTHORIZED", message: "No session" } }, 401),
    });

    const wrapper = await mountOrder(ORDER.id);

    expect(wrapper.find("h1").text()).toBe("Sign in to view this order");
    expect(wrapper.find("[role=alert]").exists()).toBe(false);
  });

  it("is headed by the order reference when viewed later (e.g. from order history)", async () => {
    mockFetchRoutes({ [`/orders/${ORDER.id}`]: () => jsonResponse({ data: ORDER }) });

    const wrapper = await mountOrder(ORDER.id);

    expect(wrapper.find("h1").text()).toBe("Order #00000001");
    expect(wrapper.text()).not.toContain("Thank you");
    expect(wrapper.text()).toContain("Status: Placed");
  });

  describe("cancelling", () => {
    it("cancels a PLACED order after confirmation", async () => {
      vi.stubGlobal(
        "confirm",
        vi.fn(() => true),
      );
      let method: string | undefined;
      mockFetchRoutes({
        [`/orders/${ORDER.id}`]: () => jsonResponse({ data: ORDER }),
        [`/orders/${ORDER.id}/cancel`]: (_url, init) => {
          method = init?.method;
          return jsonResponse({ data: { ...ORDER, status: "CANCELLED" } });
        },
      });
      const wrapper = await mountOrder(ORDER.id);

      await wrapper.find("button[data-cancel-order]").trigger("click");
      await flushPromises();

      expect(method).toBe("PATCH");
      expect(wrapper.text()).toContain("Status: Cancelled");
      expect(wrapper.find("[role=status]").text()).toBe("Your order has been cancelled.");
      expect(wrapper.find("button[data-cancel-order]").exists()).toBe(false);
    });

    it("does nothing if the shopper doesn't confirm", async () => {
      vi.stubGlobal(
        "confirm",
        vi.fn(() => false),
      );
      const fetchMock = mockFetchRoutes({
        [`/orders/${ORDER.id}`]: () => jsonResponse({ data: ORDER }),
      });
      const wrapper = await mountOrder(ORDER.id);

      await wrapper.find("button[data-cancel-order]").trigger("click");
      await flushPromises();

      expect(fetchMock.mock.calls.some(([input]) => String(input).endsWith("/cancel"))).toBe(false);
      expect(wrapper.text()).toContain("Status: Placed");
    });

    it("isn't offered once an order is past PLACED", async () => {
      mockFetchRoutes({
        [`/orders/${ORDER.id}`]: () => jsonResponse({ data: { ...ORDER, status: "PAID" } }),
      });

      const wrapper = await mountOrder(ORDER.id);

      expect(wrapper.find("button[data-cancel-order]").exists()).toBe(false);
    });

    it("shows the API's reason when cancelling is refused", async () => {
      vi.stubGlobal(
        "confirm",
        vi.fn(() => true),
      );
      mockFetchRoutes({
        [`/orders/${ORDER.id}`]: () => jsonResponse({ data: ORDER }),
        [`/orders/${ORDER.id}/cancel`]: () =>
          jsonResponse(
            {
              error: {
                code: "FORBIDDEN",
                message: "Only an order that hasn't been paid yet can be cancelled",
              },
            },
            403,
          ),
      });
      const wrapper = await mountOrder(ORDER.id);

      await wrapper.find("button[data-cancel-order]").trigger("click");
      await flushPromises();

      expect(wrapper.find("[role=alert]").text()).toContain(
        "Only an order that hasn't been paid yet can be cancelled",
      );
      expect(wrapper.text()).toContain("Status: Placed");
    });
  });
});
