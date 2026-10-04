import { expect, request, test, type APIRequestContext, type Page } from "@playwright/test";
import { API_URL } from "../playwright.config";

// The tests make their own product through the admin API (as the seeded
// admin) and delete it afterwards, so they don't depend on catalog data.
const RUN_ID = Date.now();
const PRODUCT = {
  name: `Smoke Test Tee ${RUN_ID}`,
  slug: `smoke-test-tee-${RUN_ID}`,
  sku: `SMOKE-${RUN_ID}`,
  price: "12.50",
  status: "ACTIVE",
  initialQuantity: 5,
};

let admin: APIRequestContext;
let productId: string;

test.beforeAll(async () => {
  admin = await request.newContext({ baseURL: `${API_URL}/` });
  const login = await admin.post("auth/login", {
    data: { email: "admin@example.com", password: "dev-password-123" },
  });
  expect(login.ok(), "sign in as the seeded admin").toBe(true);

  const created = await admin.post("products", { data: PRODUCT });
  expect(created.ok(), "create the smoke-test product").toBe(true);
  productId = ((await created.json()) as { data: { id: string } }).data.id;
});

test.afterAll(async () => {
  // Archive, then permanently delete (cart lines referencing it cascade).
  await admin.delete(`products/${productId}`);
  await admin.delete(`products/${productId}/permanent`);
  await admin.dispose();
});

// Clear any guest cart a test created -- in afterEach so it also runs when the
// test fails. page.request shares the browser context's cookies.
test.afterEach(async ({ page }) => {
  await page.request.delete(`${API_URL}/cart`);
});

/**
 * What signals a broken store: uncaught exceptions (a client bundle that
 * fails to load shows up here), console errors, and server errors.
 *
 * Chrome logs every failed request as a console error too. Those are left
 * out: a signed-out shopper's header always probes /auth/me (401) and tries
 * one token refresh (401), which is expected. Real server failures are still
 * caught -- as 5xx responses.
 */
function trackBrowserErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error" && !message.text().startsWith("Failed to load resource")) {
      errors.push(`console.error: ${message.text()}`);
    }
  });
  page.on("response", (response) => {
    if (response.status() >= 500) errors.push(`${response.status()} ${response.url()}`);
  });
  return errors;
}

/**
 * The app sets [data-hydrated] once its client side has mounted (app.vue), so
 * it proves hydration -- a client bundle that fails to load never sets it.
 * On failure, reports the browser errors seen -- usually the why.
 */
async function expectHydrated(page: Page, errors: string[]) {
  try {
    await expect(page.locator("[data-hydrated]")).toBeAttached();
  } catch (error) {
    throw new Error(`The page didn't hydrate. Browser errors:\n${errors.join("\n") || "(none)"}`, {
      cause: error,
    });
  }
}

test("the landing page and the catalog load in the browser, hydrate, and list products", async ({
  page,
}) => {
  const errors = trackBrowserErrors(page);

  // Landing page: the newest products include the one just created.
  await page.goto("/");
  await expectHydrated(page, errors);
  await expect(
    page.getByRole("heading", { name: "Everything you need, all in one place" }),
  ).toBeVisible();
  await expect(
    page.locator("[data-new-arrivals]").getByRole("heading", { name: PRODUCT.name }),
  ).toBeVisible();

  // The catalog, via the header (client-side navigation).
  await page.getByRole("banner").getByRole("link", { name: "Shop" }).click();
  await expect(page).toHaveURL((url) => url.pathname === "/products");
  await expect(page.getByRole("heading", { name: PRODUCT.name })).toBeVisible();
  expect(errors).toEqual([]);
});

test("an item added to the cart is still there after a full page reload", async ({ page }) => {
  const errors = trackBrowserErrors(page);

  await page.goto(`/products/${PRODUCT.slug}`);
  await expectHydrated(page, errors);
  await page.getByRole("main").getByLabel("Quantity").fill("2");
  await page.getByRole("button", { name: "Add to cart" }).click();
  await expect(page.getByRole("status")).toHaveText("Added to cart.");

  // A full page load (typed URL), then a reload: the cart must come from the
  // browser's own session, not an empty server-side fetch.
  for (const load of [() => page.goto("/cart"), () => page.reload()]) {
    await load();
    await expectHydrated(page, errors);
    const line = page.locator("[data-cart-line]").filter({ hasText: PRODUCT.name });
    await expect(line).toBeVisible();
    await expect(line.getByRole("spinbutton")).toHaveValue("2");
    await expect(page.locator("[data-subtotal]")).toHaveText("$25.00");
  }
  expect(errors).toEqual([]);
});

test("a shopper signs in from a page that needs it, returns there, and logs out", async ({
  page,
}) => {
  const errors = trackBrowserErrors(page);

  // Checkout needs an account: its prompt sends you to /account and back.
  await page.goto("/checkout");
  await expectHydrated(page, errors);
  await expect(page.getByText("Sign in to check out")).toBeVisible();
  await page.getByRole("main").getByRole("link", { name: "Sign in" }).click();
  await expect(page).toHaveURL(
    (url) => url.pathname === "/account" && url.searchParams.get("redirect") === "/checkout",
  );

  // The seeded customer -- nothing is created.
  await page.getByLabel("Email").fill("customer@example.com");
  await page.getByLabel("Password").fill("dev-password-123");
  await page.getByRole("main").getByRole("button", { name: "Sign in" }).click();

  // Back on checkout. Then a full reload: right after signing in the page
  // knows the user from the login response, but after a reload only the
  // session cookie can -- so this is what proves the cookie works.
  // Compare the path exactly: a /\/checkout$/ pattern also matches
  // /account?redirect=/checkout, i.e. before signing in has finished.
  await expect(page).toHaveURL((url) => url.pathname === "/checkout");
  await page.reload();
  await expectHydrated(page, errors);
  await expect(page.getByRole("banner").getByRole("link", { name: "Account" })).toBeVisible();
  await expect(page.getByText("Sign in to check out")).toBeHidden();

  await page.getByRole("banner").getByRole("link", { name: "Account" }).click();
  await page.getByRole("button", { name: "Log out" }).click();
  await expect(page.getByRole("banner").getByRole("link", { name: "Sign in" })).toBeVisible();
  expect(errors).toEqual([]);
});
