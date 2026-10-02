import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { jsonResponse, mockFetchRoutes } from "../test/mock-fetch";
import { ProductFormPage } from "./ProductFormPage";

function ProductsListStub() {
  const location = useLocation();
  const state = location.state as { message?: string } | null;
  return <p>{state?.message ?? "products list"}</p>;
}

const PRODUCT = {
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
};

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/products" element={<ProductsListStub />} />
        <Route path="/products/new" element={<ProductFormPage />} />
        <Route path="/products/:id" element={<ProductFormPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("ProductFormPage", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("creates a product from the form", async () => {
    mockFetchRoutes({
      "GET /categories": () =>
        jsonResponse({ data: { items: [], total: 0, page: 1, pageSize: 100 } }),
      "POST /products": () => jsonResponse({ data: PRODUCT }, 201),
    });

    renderAt("/products/new");
    const user = userEvent.setup();

    await user.type(screen.getByLabelText(/^Name/), "Classic Tee");
    await user.type(screen.getByLabelText(/^Slug/), "classic-tee");
    await user.type(screen.getByLabelText(/^SKU/), "TSHIRT-001");
    await user.type(screen.getByLabelText(/^Price/), "24.99");
    await user.click(screen.getByRole("button", { name: "Create product" }));

    const fetchMock = vi.mocked(fetch);
    await vi.waitFor(() => {
      expect(
        fetchMock.mock.calls.some(([url]) => (url as string).toString().includes("/products")),
      ).toBe(true);
    });

    expect(await screen.findByText('Product "Classic Tee" created.')).toBeInTheDocument();
  });

  it("fixes the currency to the store currency (USD) instead of an editable field", async () => {
    let postBody: unknown;
    mockFetchRoutes({
      "GET /categories": () =>
        jsonResponse({ data: { items: [], total: 0, page: 1, pageSize: 100 } }),
      "POST /products": (init) => {
        postBody = JSON.parse(init?.body as string);
        return jsonResponse({ data: PRODUCT }, 201);
      },
    });

    renderAt("/products/new");
    const user = userEvent.setup();

    const currency = screen.getByLabelText(/^Currency/);
    // Select the current text and type over it, as an admin would. (On an
    // editable field this replaces "USD"; a read-only one ignores it.)
    await user.tripleClick(currency);
    await user.keyboard("EUR");
    expect(currency).toHaveValue("USD");

    await user.type(screen.getByLabelText(/^Name/), "Classic Tee");
    await user.type(screen.getByLabelText(/^Slug/), "classic-tee");
    await user.type(screen.getByLabelText(/^SKU/), "TSHIRT-001");
    await user.type(screen.getByLabelText(/^Price/), "24.99");
    await user.click(screen.getByRole("button", { name: "Create product" }));

    expect(await screen.findByText('Product "Classic Tee" created.')).toBeInTheDocument();
    expect(postBody).toMatchObject({ currency: "USD" });
  });

  it("loads an existing product's fields for editing", async () => {
    mockFetchRoutes({
      "GET /categories": () =>
        jsonResponse({ data: { items: [], total: 0, page: 1, pageSize: 100 } }),
      "GET /products/p1/inventory": () =>
        jsonResponse({ data: { quantityAvailable: 10, quantityReserved: 0, version: 0 } }),
      "GET /products/p1": () => jsonResponse({ data: PRODUCT }),
    });

    renderAt("/products/p1");

    expect(await screen.findByDisplayValue("Classic Tee")).toBeInTheDocument();
    expect(screen.getByDisplayValue("TSHIRT-001")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Edit Classic Tee" })).toBeInTheDocument();
  });

  it("clears the sale price and description when their fields are emptied on edit", async () => {
    const onSale = { ...PRODUCT, description: "Soft cotton", salePrice: "19.99" };
    let patchBody: unknown;
    mockFetchRoutes({
      "GET /categories": () =>
        jsonResponse({ data: { items: [], total: 0, page: 1, pageSize: 100 } }),
      "GET /products/p1/inventory": () =>
        jsonResponse({ data: { quantityAvailable: 10, quantityReserved: 0, version: 0 } }),
      "GET /products/p1": () => jsonResponse({ data: onSale }),
      "PATCH /products/p1": (init) => {
        patchBody = JSON.parse(init?.body as string);
        return jsonResponse({ data: PRODUCT });
      },
    });

    renderAt("/products/p1");
    const user = userEvent.setup();

    // Scoped to the product form: the variants editor on the same page has
    // its own "Sale price" field.
    const saveButton = await screen.findByRole("button", { name: "Save changes" });
    const productForm = within(saveButton.closest("form")!);
    await user.clear(productForm.getByLabelText(/^Sale price/));
    await user.clear(productForm.getByLabelText(/^Description/));
    await user.click(saveButton);

    expect(await screen.findByText("Saved.")).toBeInTheDocument();
    // An emptied field must be sent as null ("clear it") -- omitting it
    // would leave the stored value unchanged.
    expect(patchBody).toMatchObject({ salePrice: null, description: null });
  });
});
