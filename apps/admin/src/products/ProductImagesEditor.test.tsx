import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { jsonResponse, mockFetchRoutes } from "../test/mock-fetch";
import { ProductImagesEditor } from "./ProductImagesEditor";

const IMAGE = {
  id: "img1",
  url: "https://cdn.example.com/tee.jpg",
  altText: null,
  position: 0,
  isPrimary: true,
  variantId: null,
};

describe("ProductImagesEditor", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("lists existing images and marks the primary one", () => {
    render(<ProductImagesEditor productId="p1" images={[IMAGE]} onChange={vi.fn()} />);

    expect(screen.getByText(/tee\.jpg/)).toBeInTheDocument();
    expect(screen.getByText(/\(primary\)/)).toBeInTheDocument();
  });

  it("shows an empty state with no images", () => {
    render(<ProductImagesEditor productId="p1" images={[]} onChange={vi.fn()} />);

    expect(screen.getByText("No images yet.")).toBeInTheDocument();
  });

  it("adds an image and calls onChange", async () => {
    mockFetchRoutes({
      "POST /products/p1/images": () => jsonResponse({ data: IMAGE }, 201),
    });
    const onChange = vi.fn();

    render(<ProductImagesEditor productId="p1" images={[]} onChange={onChange} />);
    const user = userEvent.setup();

    await user.type(screen.getByLabelText(/^Image URL/), "https://cdn.example.com/tee.jpg");
    await user.click(screen.getByRole("button", { name: "Add image" }));

    await vi.waitFor(() => {
      expect(onChange).toHaveBeenCalled();
    });
  });

  it("removes an image and calls onChange", async () => {
    mockFetchRoutes({
      "DELETE /products/p1/images/img1": () => jsonResponse({ data: { success: true } }),
    });
    const onChange = vi.fn();

    render(<ProductImagesEditor productId="p1" images={[IMAGE]} onChange={onChange} />);
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "Remove" }));

    await vi.waitFor(() => {
      expect(onChange).toHaveBeenCalled();
    });
  });
});
