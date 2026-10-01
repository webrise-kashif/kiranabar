import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { jsonResponse, mockFetchRoutes } from "../test/mock-fetch";
import { ProductsListPage } from "./ProductsListPage";

const PRODUCT = {
  id: "p1",
  name: "Classic Tee",
  slug: "classic-tee",
  sku: "TSHIRT-001",
  price: "24.99",
  salePrice: null,
  status: "ACTIVE",
  inventory: { quantityAvailable: 10, quantityReserved: 0, version: 0 },
};

const ARCHIVED_PRODUCT = { ...PRODUCT, status: "ARCHIVED" };

function renderPage() {
  return render(
    <MemoryRouter>
      <ProductsListPage />
    </MemoryRouter>,
  );
}

describe("ProductsListPage", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders the fetched products", async () => {
    mockFetchRoutes({
      "GET /products": () =>
        jsonResponse({ data: { items: [PRODUCT], total: 1, page: 1, pageSize: 20 } }),
    });

    renderPage();

    expect(await screen.findByText("Classic Tee")).toBeInTheDocument();
    expect(screen.getByText("TSHIRT-001")).toBeInTheDocument();
  });

  it("shows an empty state when there are no products", async () => {
    mockFetchRoutes({
      "GET /products": () => jsonResponse({ data: { items: [], total: 0, page: 1, pageSize: 20 } }),
    });

    renderPage();

    expect(await screen.findByText("No products found.")).toBeInTheDocument();
  });

  it("shows a flash message passed via router state after a redirect", async () => {
    mockFetchRoutes({
      "GET /products": () => jsonResponse({ data: { items: [], total: 0, page: 1, pageSize: 20 } }),
    });

    render(
      <MemoryRouter
        initialEntries={[
          { pathname: "/products", state: { message: 'Product "Classic Tee" created.' } },
        ]}
      >
        <ProductsListPage />
      </MemoryRouter>,
    );

    expect(await screen.findByText('Product "Classic Tee" created.')).toBeInTheDocument();
  });

  it("archives a product, refetches the list, and shows a success toast", async () => {
    mockFetchRoutes({
      "GET /products": () =>
        jsonResponse({ data: { items: [PRODUCT], total: 1, page: 1, pageSize: 20 } }),
      "DELETE /products/p1": () => jsonResponse({ data: ARCHIVED_PRODUCT }),
    });

    renderPage();
    const user = userEvent.setup();

    await screen.findByText("Classic Tee");
    await user.click(screen.getByRole("button", { name: "Archive" }));

    await waitFor(() => {
      const fetchMock = vi.mocked(fetch);
      expect(
        fetchMock.mock.calls.some(
          ([, init]) => (init as RequestInit | undefined)?.method === "DELETE",
        ),
      ).toBe(true);
    });

    expect(await screen.findByText('Product "Classic Tee" archived.')).toBeInTheDocument();
  });

  it("only offers Delete for an already-archived product, not an active one", async () => {
    mockFetchRoutes({
      "GET /products": () =>
        jsonResponse({ data: { items: [PRODUCT], total: 1, page: 1, pageSize: 20 } }),
    });

    renderPage();

    await screen.findByText("Classic Tee");
    expect(screen.getByRole("button", { name: "Archive" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Delete" })).not.toBeInTheDocument();
  });

  it("asks for confirmation and permanently deletes an archived product", async () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    mockFetchRoutes({
      "GET /products": () =>
        jsonResponse({ data: { items: [ARCHIVED_PRODUCT], total: 1, page: 1, pageSize: 20 } }),
      "DELETE /products/p1/permanent": () => jsonResponse({ data: { success: true } }),
    });

    renderPage();
    const user = userEvent.setup();

    await screen.findByText("Classic Tee");
    await user.click(screen.getByRole("button", { name: "Delete" }));

    expect(confirmSpy).toHaveBeenCalled();
    await waitFor(() => {
      const fetchMock = vi.mocked(fetch);
      expect(
        fetchMock.mock.calls.some(([url]) => (url as string).toString().includes("/permanent")),
      ).toBe(true);
    });

    expect(await screen.findByText('Product "Classic Tee" deleted.')).toBeInTheDocument();
    confirmSpy.mockRestore();
  });

  it("does not delete when the confirmation is declined", async () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
    mockFetchRoutes({
      "GET /products": () =>
        jsonResponse({ data: { items: [ARCHIVED_PRODUCT], total: 1, page: 1, pageSize: 20 } }),
    });

    renderPage();
    const user = userEvent.setup();

    await screen.findByText("Classic Tee");
    await user.click(screen.getByRole("button", { name: "Delete" }));

    expect(confirmSpy).toHaveBeenCalled();
    const fetchMock = vi.mocked(fetch);
    expect(
      fetchMock.mock.calls.some(([url]) => (url as string).toString().includes("/permanent")),
    ).toBe(false);
    confirmSpy.mockRestore();
  });
});
