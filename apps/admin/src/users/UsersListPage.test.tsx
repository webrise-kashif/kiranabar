import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AuthContext } from "../auth/auth-context";
import { jsonResponse, mockFetchRoutes } from "../test/mock-fetch";
import { UsersListPage } from "./UsersListPage";

const CUSTOMER = {
  id: "u1",
  email: "customer@example.com",
  role: "CUSTOMER",
  createdAt: "2026-01-01T00:00:00.000Z",
};

function renderAs(role: "ADMIN" | "SUPER_ADMIN") {
  return render(
    <AuthContext.Provider
      value={{
        user: { id: "me", email: "staff@example.com", role, createdAt: "now" },
        loading: false,
        login: vi.fn(),
        logout: vi.fn(),
      }}
    >
      <MemoryRouter>
        <UsersListPage />
      </MemoryRouter>
    </AuthContext.Provider>,
  );
}

describe("UsersListPage", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows role as plain text for an ADMIN caller (no role management)", async () => {
    mockFetchRoutes({
      "GET /users": () =>
        jsonResponse({ data: { items: [CUSTOMER], total: 1, page: 1, pageSize: 20 } }),
    });

    renderAs("ADMIN");

    expect(await screen.findByText("customer@example.com")).toBeInTheDocument();
    expect(screen.getByText("CUSTOMER")).toBeInTheDocument();
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
  });

  it("lets a SUPER_ADMIN change a user's role", async () => {
    mockFetchRoutes({
      "GET /users": () =>
        jsonResponse({ data: { items: [CUSTOMER], total: 1, page: 1, pageSize: 20 } }),
      "PATCH /users/u1/role": () => jsonResponse({ data: { ...CUSTOMER, role: "ADMIN" } }),
    });

    renderAs("SUPER_ADMIN");
    const user = userEvent.setup();

    const select = await screen.findByRole("combobox");
    await user.selectOptions(select, "ADMIN");

    await vi.waitFor(() => {
      const fetchMock = vi.mocked(fetch);
      expect(
        fetchMock.mock.calls.some(
          ([, init]) => (init as RequestInit | undefined)?.method === "PATCH",
        ),
      ).toBe(true);
    });
  });
});
