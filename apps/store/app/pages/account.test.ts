import type { PublicUser } from "@kiranabar/types";
import { mountSuspended } from "@nuxt/test-utils/runtime";
import { flushPromises, type VueWrapper } from "@vue/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import { clearNuxtData, useRouter, useState } from "#imports";
import { jsonResponse, mockFetchRoutes } from "../test/mock-fetch";
import AccountPage from "./account.vue";

const USER: PublicUser = {
  id: "u1",
  email: "jane@example.com",
  role: "CUSTOMER",
  // Midday UTC, so the displayed date is the same in any test timezone.
  createdAt: "2026-01-15T12:00:00.000Z",
};

const SIGNED_OUT = () =>
  jsonResponse({ error: { code: "UNAUTHORIZED", message: "No session" } }, 401);
const SIGNED_IN = () => jsonResponse({ data: { user: USER } });
// The API client tries one token refresh after a 401 before giving up.
const NO_REFRESH = () =>
  jsonResponse({ error: { code: "UNAUTHORIZED", message: "No session" } }, 401);

async function mountAccount(path = "/account") {
  const wrapper = await mountSuspended(AccountPage, { route: path });
  await flushPromises();
  return wrapper;
}

/** The input inside the <label> whose text starts with `label`. */
function field(wrapper: VueWrapper, label: string) {
  const match = wrapper.findAll("label").find((candidate) => candidate.text().startsWith(label));
  if (!match) throw new Error(`No field labelled "${label}"`);
  return match.find("input");
}

async function submit(wrapper: VueWrapper, email: string, password: string) {
  await field(wrapper, "Email").setValue(email);
  await field(wrapper, "Password").setValue(password);
  await wrapper.find("form").trigger("submit");
  await flushPromises();
}

describe("Account page", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    clearNuxtData();
    useState<PublicUser | null>("auth-user").value = null;
  });

  describe("signed out", () => {
    it("shows a sign-in form, with a switch to create an account", async () => {
      mockFetchRoutes({ "/auth/me": SIGNED_OUT, "/auth/refresh": NO_REFRESH });
      const wrapper = await mountAccount();

      expect(wrapper.find("h1").text()).toBe("Sign in");
      expect(wrapper.find("button[type=submit]").text()).toBe("Sign in");

      await wrapper.find("button[data-switch-mode]").trigger("click");

      expect(wrapper.find("h1").text()).toBe("Create an account");
      expect(wrapper.find("button[type=submit]").text()).toBe("Create account");
    });

    it("signs in (email normalized) and then shows the account", async () => {
      let body: unknown;
      mockFetchRoutes({
        "/auth/me": SIGNED_OUT,
        "/auth/refresh": NO_REFRESH,
        "/auth/login": (_url, init) => {
          body = JSON.parse(init?.body as string);
          return jsonResponse({ data: { user: USER } });
        },
      });
      const wrapper = await mountAccount();

      await submit(wrapper, "  Jane@Example.com ", "correct horse");

      expect(body).toEqual({ email: "jane@example.com", password: "correct horse" });
      expect(wrapper.find("h1").text()).toBe("Your account");
      expect(wrapper.text()).toContain("jane@example.com");
    });

    it("shows each invalid field's message and sends nothing", async () => {
      const fetchMock = mockFetchRoutes({ "/auth/me": SIGNED_OUT, "/auth/refresh": NO_REFRESH });
      const wrapper = await mountAccount();

      await submit(wrapper, "not-an-email", "");

      expect(field(wrapper, "Email").attributes("aria-invalid")).toBe("true");
      expect(wrapper.text()).toContain("Enter a valid email address");
      expect(wrapper.text()).toContain("Password is required");
      expect(fetchMock.mock.calls.some(([input]) => String(input).includes("/auth/login"))).toBe(
        false,
      );
    });

    it("shows the API's message when the credentials are wrong", async () => {
      mockFetchRoutes({
        "/auth/me": SIGNED_OUT,
        "/auth/refresh": NO_REFRESH,
        "/auth/login": () =>
          jsonResponse(
            { error: { code: "UNAUTHORIZED", message: "Invalid email or password" } },
            401,
          ),
      });
      const wrapper = await mountAccount();

      await submit(wrapper, "jane@example.com", "wrong password");

      expect(wrapper.find("[role=alert]").text()).toBe("Invalid email or password");
      expect(wrapper.find("h1").text()).toBe("Sign in");
    });

    it("creates an account, holding new passwords to the registration rules", async () => {
      let body: unknown;
      const fetchMock = mockFetchRoutes({
        "/auth/me": SIGNED_OUT,
        "/auth/refresh": NO_REFRESH,
        "/auth/register": (_url, init) => {
          body = JSON.parse(init?.body as string);
          return jsonResponse({ data: { user: USER } }, 201);
        },
      });
      const wrapper = await mountAccount();
      await wrapper.find("button[data-switch-mode]").trigger("click");

      await submit(wrapper, "jane@example.com", "short");
      expect(wrapper.text()).toContain("Password must be at least 8 characters");
      expect(fetchMock.mock.calls.some(([input]) => String(input).includes("/auth/register"))).toBe(
        false,
      );

      await submit(wrapper, "jane@example.com", "correct horse battery");
      expect(body).toEqual({ email: "jane@example.com", password: "correct horse battery" });
      expect(wrapper.find("h1").text()).toBe("Your account");
    });

    it("shows the API's message when the email is already registered", async () => {
      mockFetchRoutes({
        "/auth/me": SIGNED_OUT,
        "/auth/refresh": NO_REFRESH,
        "/auth/register": () =>
          jsonResponse(
            { error: { code: "CONFLICT", message: "An account with this email already exists" } },
            409,
          ),
      });
      const wrapper = await mountAccount();
      await wrapper.find("button[data-switch-mode]").trigger("click");

      await submit(wrapper, "jane@example.com", "correct horse battery");

      expect(wrapper.find("[role=alert]").text()).toBe("An account with this email already exists");
    });
  });

  describe("signed in", () => {
    it("shows the account details, a link to orders, and logs out", async () => {
      let loggedOut = false;
      mockFetchRoutes({
        "/auth/me": SIGNED_IN,
        "/auth/logout": () => {
          loggedOut = true;
          return jsonResponse({ data: { success: true } });
        },
      });
      const wrapper = await mountAccount();

      expect(wrapper.find("h1").text()).toBe("Your account");
      expect(wrapper.text()).toContain("jane@example.com");
      expect(wrapper.text()).toContain("Customer since Jan 15, 2026");
      expect(wrapper.find("a[href='/orders']").text()).toBe("My orders");

      await wrapper.find("button[data-log-out]").trigger("click");
      await flushPromises();

      expect(loggedOut).toBe(true);
      expect(wrapper.find("h1").text()).toBe("Sign in");
    });
  });

  describe("returning after sign-in", () => {
    function mockLogin() {
      mockFetchRoutes({
        "/auth/me": SIGNED_OUT,
        "/auth/refresh": NO_REFRESH,
        "/auth/login": () => jsonResponse({ data: { user: USER } }),
      });
    }

    it("goes back to the page that asked for sign-in", async () => {
      mockLogin();
      const wrapper = await mountAccount("/account?redirect=/checkout");

      await submit(wrapper, "jane@example.com", "correct horse");

      await vi.waitFor(() => expect(useRouter().currentRoute.value.path).toBe("/checkout"));
    });

    it.each(["https://evil.example/phish", "//evil.example/phish"])(
      "ignores a redirect that leaves the store (%s)",
      async (target) => {
        mockLogin();
        const wrapper = await mountAccount(`/account?redirect=${encodeURIComponent(target)}`);

        await submit(wrapper, "jane@example.com", "correct horse");

        expect(useRouter().currentRoute.value.path).toBe("/account");
        expect(wrapper.find("h1").text()).toBe("Your account");
      },
    );
  });
});
