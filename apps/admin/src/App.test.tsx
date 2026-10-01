import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";
import { AuthProvider } from "./auth/AuthContext";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function mockFetchRoutes(routes: Record<string, () => Response>): void {
  vi.stubGlobal(
    "fetch",
    vi.fn((input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      for (const [path, handler] of Object.entries(routes)) {
        if (url.includes(path)) return Promise.resolve(handler());
      }
      throw new Error(`Unhandled request in test: ${url}`);
    }),
  );
}

function renderApp() {
  return render(
    <AuthProvider>
      <App />
    </AuthProvider>,
  );
}

const ADMIN_USER = { id: "1", email: "admin@example.com", role: "ADMIN", createdAt: "now" };
const CUSTOMER_USER = {
  id: "2",
  email: "customer@example.com",
  role: "CUSTOMER",
  createdAt: "now",
};

describe("App", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows a login form when signed out", async () => {
    mockFetchRoutes({
      "/auth/me": () =>
        jsonResponse({ error: { code: "UNAUTHORIZED", message: "No session" } }, 401),
    });

    renderApp();

    expect(await screen.findByRole("button", { name: "Log in" })).toBeInTheDocument();
  });

  it("logs in as staff and shows the admin dashboard", async () => {
    mockFetchRoutes({
      "/auth/me": () =>
        jsonResponse({ error: { code: "UNAUTHORIZED", message: "No session" } }, 401),
      "/auth/login": () => jsonResponse({ data: { user: ADMIN_USER } }),
    });

    renderApp();
    const user = userEvent.setup();

    await screen.findByRole("button", { name: "Log in" });
    await user.type(screen.getByLabelText(/^Email/), "admin@example.com");
    await user.type(screen.getByLabelText(/^Password/), "password123");
    await user.click(screen.getByRole("button", { name: "Log in" }));

    expect(await screen.findByText(/Signed in as admin@example.com/)).toBeInTheDocument();
  });

  it("denies dashboard access to a non-staff role, while still identifying who they are", async () => {
    mockFetchRoutes({
      "/auth/me": () => jsonResponse({ data: { user: CUSTOMER_USER } }),
    });

    renderApp();

    expect(await screen.findByRole("alert")).toHaveTextContent("does not have staff access");
  });

  it("silently refreshes an expired access token instead of showing the login form", async () => {
    let meCalls = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL) => {
        const url = typeof input === "string" ? input : input.toString();

        if (url.includes("/auth/refresh")) {
          return Promise.resolve(jsonResponse({ data: { user: ADMIN_USER } }));
        }
        if (url.includes("/auth/me")) {
          meCalls += 1;
          return Promise.resolve(
            meCalls === 1
              ? jsonResponse({ error: { code: "UNAUTHORIZED", message: "Expired" } }, 401)
              : jsonResponse({ data: { user: ADMIN_USER } }),
          );
        }
        throw new Error(`Unhandled request in test: ${url}`);
      }),
    );

    renderApp();

    expect(await screen.findByText(/Signed in as admin@example.com/)).toBeInTheDocument();
    expect(meCalls).toBe(2);
  });

  it("logs out and returns to the login form", async () => {
    mockFetchRoutes({
      "/auth/me": () => jsonResponse({ data: { user: ADMIN_USER } }),
      "/auth/logout": () => jsonResponse({ data: { success: true } }),
    });

    renderApp();
    const user = userEvent.setup();

    const logoutButton = await screen.findByRole("button", { name: "Log out" });
    await user.click(logoutButton);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Log in" })).toBeInTheDocument();
    });
  });
});
