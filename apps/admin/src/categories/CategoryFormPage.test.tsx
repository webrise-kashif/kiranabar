import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { jsonResponse, mockFetchRoutes } from "../test/mock-fetch";
import { CategoryFormPage } from "./CategoryFormPage";

function CategoriesListStub() {
  const location = useLocation();
  const state = location.state as { message?: string } | null;
  return <p>{state?.message ?? "categories list"}</p>;
}

const CATEGORY = {
  id: "c1",
  name: "Shirts",
  slug: "shirts",
  description: null,
  status: "ACTIVE",
  parentId: null,
};

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/categories" element={<CategoriesListStub />} />
        <Route path="/categories/new" element={<CategoryFormPage />} />
        <Route path="/categories/:id" element={<CategoryFormPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("CategoryFormPage", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("creates a category from the form", async () => {
    mockFetchRoutes({
      "GET /categories": () =>
        jsonResponse({ data: { items: [], total: 0, page: 1, pageSize: 100 } }),
      "POST /categories": () => jsonResponse({ data: CATEGORY }, 201),
    });

    renderAt("/categories/new");
    const user = userEvent.setup();

    await user.type(screen.getByLabelText(/^Name/), "Shirts");
    await user.type(screen.getByLabelText(/^Slug/), "shirts");
    await user.click(screen.getByRole("button", { name: "Create category" }));

    await vi.waitFor(() => {
      const fetchMock = vi.mocked(fetch);
      expect(
        fetchMock.mock.calls.some(
          ([, init]) => (init as RequestInit | undefined)?.method === "POST",
        ),
      ).toBe(true);
    });

    expect(await screen.findByText('Category "Shirts" created.')).toBeInTheDocument();
  });

  it("loads an existing category's fields for editing", async () => {
    mockFetchRoutes({
      "GET /categories/c1": () => jsonResponse({ data: CATEGORY }),
      "GET /categories": () =>
        jsonResponse({ data: { items: [CATEGORY], total: 1, page: 1, pageSize: 100 } }),
    });

    renderAt("/categories/c1");

    expect(await screen.findByDisplayValue("Shirts")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Edit Shirts" })).toBeInTheDocument();
  });

  it("clears the description and parent when emptied on edit", async () => {
    const child = {
      ...CATEGORY,
      id: "c2",
      name: "Tees",
      slug: "tees",
      description: "Short sleeves",
      parentId: "c1",
    };
    let patchBody: unknown;
    mockFetchRoutes({
      "GET /categories/c2": () => jsonResponse({ data: child }),
      "GET /categories": () =>
        jsonResponse({ data: { items: [CATEGORY, child], total: 2, page: 1, pageSize: 100 } }),
      "PATCH /categories/c2": (init) => {
        patchBody = JSON.parse(init?.body as string);
        return jsonResponse({ data: { ...child, description: null, parentId: null } });
      },
    });

    renderAt("/categories/c2");
    const user = userEvent.setup();

    await user.clear(await screen.findByLabelText(/^Description/));
    await user.selectOptions(screen.getByLabelText(/^Parent category/), "None");
    await user.click(screen.getByRole("button", { name: "Save changes" }));

    expect(await screen.findByText("Saved.")).toBeInTheDocument();
    // An emptied field must be sent as null ("clear it") -- omitting it
    // would leave the stored value unchanged.
    expect(patchBody).toMatchObject({ description: null, parentId: null });
  });
});
