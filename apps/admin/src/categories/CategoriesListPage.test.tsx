import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { jsonResponse, mockFetchRoutes } from "../test/mock-fetch";
import { CategoriesListPage } from "./CategoriesListPage";

const CATEGORY = {
  id: "c1",
  name: "Shirts",
  slug: "shirts",
  description: null,
  status: "ACTIVE",
  parentId: null,
};

const ARCHIVED_CATEGORY = { ...CATEGORY, status: "ARCHIVED" };

function renderPage() {
  return render(
    <MemoryRouter>
      <CategoriesListPage />
    </MemoryRouter>,
  );
}

describe("CategoriesListPage", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders the fetched categories", async () => {
    mockFetchRoutes({
      "GET /categories": () =>
        jsonResponse({ data: { items: [CATEGORY], total: 1, page: 1, pageSize: 20 } }),
    });

    renderPage();

    expect(await screen.findByText("Shirts")).toBeInTheDocument();
    expect(screen.getByText("shirts")).toBeInTheDocument();
  });

  it("shows a flash message passed via router state after a redirect", async () => {
    mockFetchRoutes({
      "GET /categories": () =>
        jsonResponse({ data: { items: [], total: 0, page: 1, pageSize: 20 } }),
    });

    render(
      <MemoryRouter
        initialEntries={[
          { pathname: "/categories", state: { message: 'Category "Shirts" created.' } },
        ]}
      >
        <CategoriesListPage />
      </MemoryRouter>,
    );

    expect(await screen.findByText('Category "Shirts" created.')).toBeInTheDocument();
  });

  it("archives a category, refetches, and shows a success toast", async () => {
    mockFetchRoutes({
      "GET /categories": () =>
        jsonResponse({ data: { items: [CATEGORY], total: 1, page: 1, pageSize: 20 } }),
      "DELETE /categories/c1": () => jsonResponse({ data: ARCHIVED_CATEGORY }),
    });

    renderPage();
    const user = userEvent.setup();

    await screen.findByText("Shirts");
    await user.click(screen.getByRole("button", { name: "Archive" }));

    await waitFor(() => {
      const fetchMock = vi.mocked(fetch);
      expect(
        fetchMock.mock.calls.some(
          ([, init]) => (init as RequestInit | undefined)?.method === "DELETE",
        ),
      ).toBe(true);
    });

    expect(await screen.findByText('Category "Shirts" archived.')).toBeInTheDocument();
  });

  it("only offers Delete for an already-archived category, not an active one", async () => {
    mockFetchRoutes({
      "GET /categories": () =>
        jsonResponse({ data: { items: [CATEGORY], total: 1, page: 1, pageSize: 20 } }),
    });

    renderPage();

    await screen.findByText("Shirts");
    expect(screen.getByRole("button", { name: "Archive" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Delete" })).not.toBeInTheDocument();
  });

  it("asks for confirmation and permanently deletes an archived category", async () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    mockFetchRoutes({
      "GET /categories": () =>
        jsonResponse({ data: { items: [ARCHIVED_CATEGORY], total: 1, page: 1, pageSize: 20 } }),
      "DELETE /categories/c1/permanent": () => jsonResponse({ data: { success: true } }),
    });

    renderPage();
    const user = userEvent.setup();

    await screen.findByText("Shirts");
    await user.click(screen.getByRole("button", { name: "Delete" }));

    expect(confirmSpy).toHaveBeenCalled();
    await waitFor(() => {
      const fetchMock = vi.mocked(fetch);
      expect(
        fetchMock.mock.calls.some(([url]) => (url as string).toString().includes("/permanent")),
      ).toBe(true);
    });

    expect(await screen.findByText('Category "Shirts" deleted.')).toBeInTheDocument();
    confirmSpy.mockRestore();
  });

  it("does not delete when the confirmation is declined", async () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
    mockFetchRoutes({
      "GET /categories": () =>
        jsonResponse({ data: { items: [ARCHIVED_CATEGORY], total: 1, page: 1, pageSize: 20 } }),
    });

    renderPage();
    const user = userEvent.setup();

    await screen.findByText("Shirts");
    await user.click(screen.getByRole("button", { name: "Delete" }));

    expect(confirmSpy).toHaveBeenCalled();
    const fetchMock = vi.mocked(fetch);
    expect(
      fetchMock.mock.calls.some(([url]) => (url as string).toString().includes("/permanent")),
    ).toBe(false);
    confirmSpy.mockRestore();
  });
});
