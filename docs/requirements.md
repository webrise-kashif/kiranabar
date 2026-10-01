# Requirements — Initial Kiranabar MVP (Draft)

> **Status: draft baseline, not confirmed.** This is a conventional ecommerce MVP
> scope, written to give the team a concrete starting point — not a set of
> requirements gathered from stakeholders. Nothing here should be implemented
> until it's been reviewed and confirmed (or corrected) by the product owner.
> Treat every checkbox as a proposal, not a spec.

## Purpose

Give `apps/api`, `apps/store`, and `apps/admin` a shared, minimal definition of
"done" for a first release, so the architecture in `docs/architecture.md` has a
concrete target without the API contract (`docs/api-contract.md`) having to guess
at endpoints ahead of time.

## In scope for the MVP

### Customer-facing (Web Store, and later the React Native app)

- **Product catalog**: browse products, view a single product's detail page,
  browse by category, keyword search.
- **Cart**: add/remove/update line items, persisted for a logged-in customer,
  usable without an account until checkout.
- **Customer accounts**: register, log in, log out, view order history, manage a
  shipping address.
- **Checkout**: enter/select shipping address, single payment method integration
  (provider not yet chosen), order confirmation.
- **Orders**: a placed order is visible to the customer who placed it, with status
  (e.g. placed → paid → shipped → delivered).

### Admin-facing (Admin Portal)

- **Product management**: create/edit/delete products (with optional
  variants like size/color), categories, and stock levels.
- **Order management**: view orders, update order status.
- **Customer visibility**: view customer accounts and their order history
  (read-only for the MVP — no impersonation, no editing customer data).

### Cross-cutting

- **Authentication** for both customer and admin roles, per the transport design
  in `docs/architecture.md` (httpOnly cookies for both web clients today, bearer
  tokens for the future mobile client) — one auth system, role-based access.
- **Pagination** on every list endpoint (products, orders, customers), using the
  shared `paginationQuerySchema` in `@kiranabar/validation`.

## Explicitly out of scope for the MVP

- Multiple payment providers or payment methods per order.
- Discounts, coupons, promotions, or gift cards.
- Multi-currency or multi-region pricing/tax.
- Product reviews/ratings.
- Wishlists/favorites.
- Inventory across multiple warehouses.
- Admin roles beyond a single "admin" role (no granular permission tiers yet).
- The React Native app itself — only the backend's readiness for it.
- Analytics/reporting dashboards.

## Suggested build order

Roughly the dependency order that keeps each slice testable end-to-end:

1. Authentication (customer + admin) — everything else needs a caller identity.
2. Product catalog (read-only) — the first real Prisma models, the first real
   endpoints, exercised by both the Web Store and the Admin Portal.
3. Product management (admin write access) — proves the role-based guard design.
4. Cart.
5. Checkout + orders (customer side).
6. Order management (admin side).

## Open questions for the product owner

These need answers before the corresponding feature can be scoped into
`docs/api-contract.md`:

- Which payment provider, and does it require server-side webhooks?
- Guest checkout, or account required?
- What are the required address fields (single-country vs. international)?
- What order statuses are needed, and who can transition between them?
