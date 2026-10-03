import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { jsonResponse, mockFetchRoutes } from "../test/mock-fetch";
import { ProductVariantsEditor } from "./ProductVariantsEditor";

const VARIANT = {
  id: "var-1",
  productId: "p1",
  sku: "TSHIRT-001-RED-M",
  price: "26.99",
  salePrice: null,
  currency: "USD",
  attributes: { color: "Red", size: "M" },
  status: "ACTIVE" as const,
  images: [],
  inventory: { quantityAvailable: 3, quantityReserved: 0, version: 0 },
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

const ARCHIVED_VARIANT = { ...VARIANT, status: "ARCHIVED" as const };

function mockVariantInventory() {
  return {
    "GET /products/p1/variants/var-1/inventory": () =>
      jsonResponse({ data: { quantityAvailable: 3, quantityReserved: 0, version: 0 } }),
  };
}

describe("ProductVariantsEditor", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows an empty state when there are no variants", () => {
    mockFetchRoutes({});
    render(<ProductVariantsEditor productId="p1" variants={[]} onChange={vi.fn()} />);

    expect(screen.getByText("No variants yet.")).toBeInTheDocument();
  });

  it("lists an existing variant with its attributes and price", async () => {
    mockFetchRoutes(mockVariantInventory());
    render(<ProductVariantsEditor productId="p1" variants={[VARIANT]} onChange={vi.fn()} />);

    expect(screen.getByText("TSHIRT-001-RED-M", { exact: false })).toBeInTheDocument();
    expect(screen.getByText(/color: Red, size: M/)).toBeInTheDocument();
    expect(await screen.findByDisplayValue("3")).toBeInTheDocument(); // nested inventory editor
  });

  it("states the store currency as a note and submits variants in it", async () => {
    let postBody: unknown;
    mockFetchRoutes({
      "POST /products/p1/variants": (init) => {
        postBody = JSON.parse(init?.body as string);
        return jsonResponse({ data: VARIANT }, 201);
      },
    });
    render(<ProductVariantsEditor productId="p1" variants={[]} onChange={vi.fn()} />);
    const user = userEvent.setup();

    expect(screen.queryByLabelText(/^Currency/)).not.toBeInTheDocument();
    expect(screen.getByText("Prices are in USD.")).toBeInTheDocument();

    await user.type(screen.getByLabelText(/^SKU/), "TSHIRT-001-RED-M");
    await user.type(screen.getByLabelText(/^Price/), "26.99");
    await user.type(screen.getByLabelText("Name"), "Color");
    await user.type(screen.getByLabelText("Value"), "Red");
    await user.click(screen.getByRole("button", { name: "Add variant" }));

    await vi.waitFor(() => {
      expect(postBody).toMatchObject({ currency: "USD" });
    });
  });

  it("submits the add-variant form and calls onChange", async () => {
    mockFetchRoutes({
      "POST /products/p1/variants": () => jsonResponse({ data: VARIANT }, 201),
    });
    const onChange = vi.fn();
    render(<ProductVariantsEditor productId="p1" variants={[]} onChange={onChange} />);
    const user = userEvent.setup();

    await user.type(screen.getByLabelText(/^SKU/), "TSHIRT-001-RED-M");
    await user.type(screen.getByLabelText(/^Price/), "26.99");
    await user.type(screen.getByLabelText("Name"), "Color");
    await user.type(screen.getByLabelText("Value"), "Red");
    await user.click(screen.getByRole("button", { name: "Add variant" }));

    await vi.waitFor(() => {
      expect(onChange).toHaveBeenCalled();
    });
    expect(await screen.findByText('Variant "TSHIRT-001-RED-M" created.')).toBeInTheDocument();
  });

  it("rejects submitting with no attributes filled in", async () => {
    mockFetchRoutes({});
    render(<ProductVariantsEditor productId="p1" variants={[]} onChange={vi.fn()} />);
    const user = userEvent.setup();

    await user.type(screen.getByLabelText(/^SKU/), "TSHIRT-001-RED-M");
    await user.type(screen.getByLabelText(/^Price/), "26.99");
    await user.click(screen.getByRole("button", { name: "Add variant" }));

    expect(
      await screen.findByText("At least one attribute (e.g. Color) is required"),
    ).toBeInTheDocument();
  });

  it("archives an active variant and shows a success toast", async () => {
    mockFetchRoutes({
      ...mockVariantInventory(),
      "DELETE /products/p1/variants/var-1": () => jsonResponse({ data: ARCHIVED_VARIANT }),
    });
    const onChange = vi.fn();
    render(<ProductVariantsEditor productId="p1" variants={[VARIANT]} onChange={onChange} />);
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "Archive" }));

    await vi.waitFor(() => {
      expect(onChange).toHaveBeenCalled();
    });
    expect(await screen.findByText('Variant "TSHIRT-001-RED-M" archived.')).toBeInTheDocument();
  });

  it("only offers Delete for an already-archived variant", async () => {
    mockFetchRoutes(mockVariantInventory());
    render(<ProductVariantsEditor productId="p1" variants={[VARIANT]} onChange={vi.fn()} />);

    expect(await screen.findByRole("button", { name: "Archive" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Delete" })).not.toBeInTheDocument();
  });

  it("asks for confirmation and permanently deletes an archived variant", async () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    mockFetchRoutes({
      ...mockVariantInventory(),
      "DELETE /products/p1/variants/var-1/permanent": () =>
        jsonResponse({ data: { success: true } }),
    });
    const onChange = vi.fn();
    render(
      <ProductVariantsEditor productId="p1" variants={[ARCHIVED_VARIANT]} onChange={onChange} />,
    );
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "Delete" }));

    expect(confirmSpy).toHaveBeenCalled();
    await vi.waitFor(() => {
      expect(onChange).toHaveBeenCalled();
    });
    expect(await screen.findByText('Variant "TSHIRT-001-RED-M" deleted.')).toBeInTheDocument();
    confirmSpy.mockRestore();
  });

  it("surfaces an API error via role=alert", async () => {
    mockFetchRoutes({
      "POST /products/p1/variants": () =>
        jsonResponse({ error: { code: "CONFLICT", message: "SKU already exists" } }, 409),
    });
    render(<ProductVariantsEditor productId="p1" variants={[]} onChange={vi.fn()} />);
    const user = userEvent.setup();

    await user.type(screen.getByLabelText(/^SKU/), "TSHIRT-001-RED-M");
    await user.type(screen.getByLabelText(/^Price/), "26.99");
    await user.type(screen.getByLabelText("Name"), "Color");
    await user.type(screen.getByLabelText("Value"), "Red");
    await user.click(screen.getByRole("button", { name: "Add variant" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("SKU already exists");
  });
});
