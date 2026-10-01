import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { jsonResponse, mockFetchRoutes } from "../test/mock-fetch";
import { OrdersListPage } from "./OrdersListPage";

const ORDER = {
  id: "o1",
  status: "PLACED",
  items: [],
  subtotal: "45.00",
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

function renderPage() {
  return render(
    <MemoryRouter>
      <OrdersListPage />
    </MemoryRouter>,
  );
}

describe("OrdersListPage", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders every order for an admin", async () => {
    mockFetchRoutes({
      "GET /orders": () =>
        jsonResponse({ data: { items: [ORDER], total: 1, page: 1, pageSize: 20 } }),
    });

    renderPage();

    expect(await screen.findByText("PLACED")).toBeInTheDocument();
    expect(screen.getByText("45.00 USD")).toBeInTheDocument();
  });

  it("re-queries with a userId filter", async () => {
    mockFetchRoutes({
      "GET /orders": () =>
        jsonResponse({ data: { items: [ORDER], total: 1, page: 1, pageSize: 20 } }),
    });

    renderPage();
    const user = userEvent.setup();

    await screen.findByText("PLACED");
    await user.type(screen.getByLabelText("Customer user ID"), "user-1");

    await vi.waitFor(() => {
      const fetchMock = vi.mocked(fetch);
      expect(
        fetchMock.mock.calls.some(([url]) => (url as string).toString().includes("userId=user-1")),
      ).toBe(true);
    });
  });
});
