import type { Order, PublicUser } from "@kiranabar/types";
import { mountSuspended } from "@nuxt/test-utils/runtime";
import { flushPromises } from "@vue/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import { clearNuxtData, useState } from "#imports";
import { jsonResponse, mockFetchRoutes, requestedUrls } from "../../test/mock-fetch";
import OrdersPage from "./index.vue";

const USER: PublicUser = {
  id: "u1",
  email: "jane@example.com",
  role: "CUSTOMER",
  createdAt: "2026-01-01T00:00:00.000Z",
};

function order(overrides: Partial<Order> = {}): Order {
  return {
    id: "01a1b2c3-0000-7000-8000-00000000abcd",
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
        productName: "Cap",
        productSku: "CAP-001",
        variantId: null,
        variantSku: null,
        variantAttributes: null,
        unitPrice: "15.00",
        quantity: 1,
        lineTotal: "15.00",
      },
    ],
    subtotal: "64.98",
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
    // Midday UTC, so the displayed date is the same in any test timezone.
    createdAt: "2026-01-15T12:00:00.000Z",
    updatedAt: "2026-01-15T12:00:00.000Z",
    ...overrides,
  };
}

function page(items: Order[], overrides: Record<string, unknown> = {}) {
  return { data: { items, total: items.length, page: 1, pageSize: 10, ...overrides } };
}

const SIGNED_OUT = () =>
  jsonResponse({ error: { code: "UNAUTHORIZED", message: "No session" } }, 401);
const SIGNED_IN = () => jsonResponse({ data: { user: USER } });

async function mountOrders() {
  const wrapper = await mountSuspended(OrdersPage, { route: "/orders" });
  await flushPromises();
  return wrapper;
}

describe("Order history page", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    clearNuxtData();
    useState<PublicUser | null>("auth-user").value = null;
  });

  it("asks a signed-out shopper to sign in, then loads their orders once they do", async () => {
    mockFetchRoutes({ "/auth/me": SIGNED_OUT, "/orders": () => jsonResponse(page([order()])) });
    const wrapper = await mountOrders();
    expect(wrapper.text()).toContain("Sign in to see your orders");
    expect(wrapper.findAll("[data-order-row]")).toHaveLength(0);

    // What the header's sign-in form does on success (see useAuth).
    useState<PublicUser | null>("auth-user").value = USER;
    await flushPromises();

    expect(wrapper.findAll("[data-order-row]")).toHaveLength(1);
  });

  it("lists each order with its date, reference, status, item count, and total", async () => {
    mockFetchRoutes({
      "/auth/me": SIGNED_IN,
      "/orders": () =>
        jsonResponse(
          page([order(), order({ id: "01a1b2c3-0000-7000-8000-0000000000ff", status: "SHIPPED" })]),
        ),
    });

    const wrapper = await mountOrders();

    const rows = wrapper.findAll("[data-order-row]");
    expect(rows).toHaveLength(2);
    expect(rows[0]!.text()).toContain("Jan 15, 2026");
    expect(rows[0]!.text()).toContain("#0000ABCD");
    expect(rows[0]!.text()).toContain("Placed");
    expect(rows[0]!.text()).toContain("3 items");
    expect(rows[0]!.text()).toContain("$64.98");
    expect(rows[0]!.find("a").attributes("href")).toBe(
      "/orders/01a1b2c3-0000-7000-8000-00000000abcd",
    );
    expect(rows[1]!.text()).toContain("Shipped");
  });

  it("says when there are no orders yet, with a link to the shop", async () => {
    mockFetchRoutes({ "/auth/me": SIGNED_IN, "/orders": () => jsonResponse(page([])) });

    const wrapper = await mountOrders();

    expect(wrapper.text()).toContain("You haven't placed any orders yet.");
    expect(wrapper.find("a[href='/']").text()).toBe("Start shopping");
  });

  it("pages through older orders", async () => {
    const fetchMock = mockFetchRoutes({
      "/auth/me": SIGNED_IN,
      "/orders": (url) => {
        const current = Number(url.searchParams.get("page"));
        return jsonResponse(
          page([order({ id: `order-on-page-${current}` })], { total: 25, page: current }),
        );
      },
    });
    const wrapper = await mountOrders();

    const nav = wrapper.find("nav[aria-label=Pagination]");
    expect(nav.text()).toContain("Page 1 of 3");
    await nav.find("button[aria-label='Next page']").trigger("click");
    await flushPromises();

    expect(requestedUrls(fetchMock, "/orders").at(-1)?.searchParams.get("page")).toBe("2");
    expect(wrapper.find("nav[aria-label=Pagination]").text()).toContain("Page 2 of 3");
    expect(wrapper.find("[data-order-row] a").attributes("href")).toBe("/orders/order-on-page-2");
  });
});
