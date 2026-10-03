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
 * The header's API status line is rendered client-side only, so it proves
 * hydration. On failure, reports the browser errors seen -- usually the why.
 */
async function expectHydrated(page: Page, errors: string[]) {
  try {
    await expect(page.getByText("API status: ok")).toBeVisible();
  } catch (error) {
    throw new Error(`The page didn't hydrate. Browser errors:\n${errors.join("\n") || "(none)"}`, {
      cause: error,
    });
  }
}

test("the catalog loads in the browser, hydrates, and lists products", async ({ page }) => {
  const errors = trackBrowserErrors(page);

  await page.goto("/");

  await expectHydrated(page, errors);
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
