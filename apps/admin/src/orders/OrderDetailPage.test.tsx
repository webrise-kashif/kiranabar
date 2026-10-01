import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { jsonResponse, mockFetchRoutes } from "../test/mock-fetch";
import { OrderDetailPage } from "./OrderDetailPage";

const PLACED_ORDER = {
  id: "o1",
  status: "PLACED",
  items: [
    {
      productId: "p1",
      productName: "Classic Tee",
      productSku: "TSHIRT-001",
      unitPrice: "15.00",
      quantity: 3,
      lineTotal: "45.00",
    },
  ],
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

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/orders/:id" element={<OrderDetailPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("OrderDetailPage", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders order items and shipping address", async () => {
    mockFetchRoutes({
      "GET /orders/o1": () => jsonResponse({ data: PLACED_ORDER }),
    });

    renderAt("/orders/o1");

    expect(await screen.findByText("Classic Tee")).toBeInTheDocument();
    expect(screen.getByText(/Jane Doe/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Advance to PAID" })).toBeInTheDocument();
  });

  it("advances the order to the next status", async () => {
    mockFetchRoutes({
      "GET /orders/o1": () => jsonResponse({ data: PLACED_ORDER }),
      "PATCH /orders/o1/status": () => jsonResponse({ data: { ...PLACED_ORDER, status: "PAID" } }),
    });

    renderAt("/orders/o1");
    const user = userEvent.setup();

    await user.click(await screen.findByRole("button", { name: "Advance to PAID" }));

    expect(await screen.findByText("PAID")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Advance to SHIPPED" })).toBeInTheDocument();
  });

  it("shows no advance button for a terminal DELIVERED order", async () => {
    mockFetchRoutes({
      "GET /orders/o1": () => jsonResponse({ data: { ...PLACED_ORDER, status: "DELIVERED" } }),
    });

    renderAt("/orders/o1");

    await screen.findByText("DELIVERED");
    expect(screen.queryByRole("button", { name: /Advance to/ })).not.toBeInTheDocument();
  });
});
