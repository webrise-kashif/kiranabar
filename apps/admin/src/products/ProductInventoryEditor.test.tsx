import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { jsonResponse, mockFetchRoutes } from "../test/mock-fetch";
import { ProductInventoryEditor } from "./ProductInventoryEditor";

describe("ProductInventoryEditor", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("loads and displays current stock", async () => {
    mockFetchRoutes({
      "GET /products/p1/inventory": () =>
        jsonResponse({ data: { quantityAvailable: 10, quantityReserved: 2, version: 3 } }),
    });

    render(<ProductInventoryEditor productId="p1" />);

    expect(await screen.findByDisplayValue("10")).toBeInTheDocument();
    expect(screen.getByText("Reserved: 2")).toBeInTheDocument();
  });

  it("submits the current version alongside the new quantity", async () => {
    mockFetchRoutes({
      "GET /products/p1/inventory": () =>
        jsonResponse({ data: { quantityAvailable: 10, quantityReserved: 0, version: 3 } }),
      "PATCH /products/p1/inventory": () =>
        jsonResponse({ data: { quantityAvailable: 8, quantityReserved: 0, version: 4 } }),
    });

    render(<ProductInventoryEditor productId="p1" />);
    const user = userEvent.setup();

    const input = await screen.findByDisplayValue("10");
    await user.clear(input);
    await user.type(input, "8");
    await user.click(screen.getByRole("button", { name: "Update stock" }));

    const fetchMock = vi.mocked(fetch);
    await vi.waitFor(() => {
      const patchCall = fetchMock.mock.calls.find(
        ([, init]) => (init as RequestInit | undefined)?.method === "PATCH",
      );
      expect(patchCall).toBeDefined();
      const body = JSON.parse((patchCall?.[1] as RequestInit).body as string) as {
        version: number;
      };
      expect(body.version).toBe(3);
    });
  });

  it("loads and adjusts a variant's own stock when given a variantId", async () => {
    mockFetchRoutes({
      "GET /products/p1/variants/var-1/inventory": () =>
        jsonResponse({ data: { quantityAvailable: 4, quantityReserved: 0, version: 0 } }),
      "PATCH /products/p1/variants/var-1/inventory": () =>
        jsonResponse({ data: { quantityAvailable: 6, quantityReserved: 0, version: 1 } }),
    });

    render(<ProductInventoryEditor productId="p1" variantId="var-1" />);
    const user = userEvent.setup();

    const input = await screen.findByDisplayValue("4");
    await user.clear(input);
    await user.type(input, "6");
    await user.click(screen.getByRole("button", { name: "Update stock" }));

    const fetchMock = vi.mocked(fetch);
    await vi.waitFor(() => {
      expect(
        fetchMock.mock.calls.some(
          ([url, init]) =>
            (url as string).toString().includes("/variants/var-1/inventory") &&
            (init as RequestInit | undefined)?.method === "PATCH",
        ),
      ).toBe(true);
    });
  });
});
