# Architecture

## Goals

1. One backend serves three clients — Web Store (Vue/Nuxt), Admin Portal (React),
   and a **future** React Native mobile app — without the backend knowing any of
   them exist.
2. Adding the React Native app later should require **zero backend changes** beyond
   what any new client naturally needs (e.g. a new CORS-equivalent allowance, which
   doesn't even apply to a non-browser client).
3. Shared code between clients is limited to what's genuinely framework-independent:
   types, validation schemas, and HTTP transport logic. UI is never shared.

## System overview

```
┌─────────────────┐   ┌──────────────────┐   ┌─────────────────────────┐
│  Web Store       │   │  Admin Portal    │   │  React Native app       │
│  Vue 3 + Nuxt    │   │  React + Vite    │   │  (future)               │
│  cookie auth     │   │  cookie auth     │   │  bearer-token auth      │
└────────┬─────────┘   └────────┬─────────┘   └────────────┬────────────┘
         │  createApiClient()   │  createApiClient()        │  createApiClient()
         │  (@kiranabar/api-client, one implementation, three configurations)
         └──────────────────────┼───────────────────────────┘
                                 ▼
                    REST API — /api/v1/...  (NestJS)
                    ─ versioned, framework-agnostic
                    ─ { data } / { error } envelope
                    ─ Zod validation (nestjs-zod)
                    ─ role-based guards (store customer vs admin)
                                 │
                                 ▼
                         PrismaService (only door to the DB)
                                 │
                                 ▼
                            PostgreSQL
```

No client ever imports `@prisma/client` or opens a database connection. Frontends
only ever import `@kiranabar/api-client`, `@kiranabar/types`, and
`@kiranabar/validation`.

## Why a monorepo, and why these tools

- **pnpm workspaces** for package linking (fast, disk-efficient, strict dependency
  resolution — a package can't accidentally resolve a dependency it didn't declare).
- **pnpm `catalog:`** pins one version of cross-cutting tooling (TypeScript, Vitest,
  ESLint, Prettier, Zod) across every package, so `apps/api` and `apps/store` can't
  silently drift onto different TypeScript versions.
- **Turborepo** orchestrates `build`/`lint`/`typecheck`/`test` across packages with
  dependency-aware ordering (a package's `^build` finishes before its dependents
  build/typecheck) and caching. It's a thin layer on top of pnpm scripts, not a
  replacement for them — every task is still a plain `package.json` script you can
  run directly with `pnpm --filter`.
- **TypeScript 6.0.x** (not the newest `7.x`) because the TS 7 native-port release
  isn't yet supported by `typescript-eslint` 8.x (`typescript-eslint` currently caps
  peer support at `<6.1.0`). 6.0.x is what Nuxt 4.5 itself ships with, so it's both
  current and the widest-compatible choice across the whole toolchain today.

## Backend: API-first, client-independent

`apps/api` is a NestJS application with no knowledge of any frontend framework.
Concretely, that means:

- **No response shaping for a specific client.** Every client gets the same JSON
  shape from the same endpoint. If the Admin Portal needs different data, that's a
  different endpoint/query param behind the same role-based guard system — not a
  branch on `User-Agent` or a client-specific serializer.
- **Versioned from day one.** `app.enableVersioning({ type: VersioningType.URI,
defaultVersion: '1' })` plus `app.setGlobalPrefix('api')` gives every route the
  shape `/api/v1/...`. This is what lets the mobile app arrive later and either
  consume `v1` unchanged or prompt a `v2` without breaking the existing web clients.
- **One consistent envelope.** Success responses are wrapped as `{ data }`
  (`ResponseEnvelopeInterceptor`); errors are normalized to
  `{ error: { code, message, details? } }` (`HttpExceptionFilter`), regardless of
  whether the error originated from Nest, from Zod validation, or from an unhandled
  exception. `@kiranabar/api-client` is written against exactly this contract.
- **CORS is a web-only concern.** `enableCors()` is configured because two of the
  three current/future clients are browsers; the React Native app is unaffected by
  it (native HTTP requests aren't subject to CORS), so it needs no accommodation
  when it arrives.
- **The database is fully encapsulated.** `PrismaService`
  (`apps/api/src/prisma/prisma.service.ts`) is the only file in the repository that
  imports `@prisma/client`. Every other module reaches the database through it,
  and no frontend package can reach it at all.

## Module structure

`apps/api/src` is organized as one NestJS module per bounded domain, all wired
into `AppModule`:

```
src/
  config/     infrastructure -- validated environment, AppConfigService
  prisma/     infrastructure -- PrismaService (the only Prisma import site)
  common/     infrastructure -- global filters/interceptors
  health/     implemented    -- GET /api/v1/health
  auth/       implemented    -- registration, login, logout, refresh, guards
  users/      implemented    -- user listing + role management
  categories/ implemented    -- catalog category CRUD + hierarchy
  products/   implemented    -- product CRUD + images
  inventory/  implemented    -- stock read/adjust (nested under products)
  cart/       implemented    -- guest + logged-in cart, merge on login
  orders/     implemented    -- customer checkout, order history, cancel

  payments/   foundation only
  shipping/   foundation only
```

`auth`/`users` (caller identity), `categories`/`products`/`inventory` (the
read-only catalog, then admin write access), `cart`, then `orders` were
built in that order, per `docs/requirements.md`'s "suggested build order" —
see `docs/authentication.md`, "Product catalog: visibility and
concurrency", "Cart: identity, pricing, and merge on login", and "Orders:
checkout, price snapshots, and the one intentional exception" below for
each feature's design. The remaining two domain modules still exist purely
as **module boundaries**: `@Module({})` with a comment pointing at the
requirement that will fill them in. This fixes where each future feature's
controllers/services/DTOs will live (and how they'll be registered in
`AppModule`) without writing business logic ahead of a confirmed
requirement.

When a domain module is implemented, it should only ever depend on
`PrismaService` for data access (injected via `PrismaModule`, which is
`@Global()`), `AppConfigService` for configuration, and another domain's
**exported service** for cross-module needs — never that domain's Prisma
tables directly. `ProductsModule` follows this: it imports `CategoriesModule`
and calls `categoriesService.exists(id)` to validate a `categoryId`
reference, rather than querying the `categories` table itself.
`CartModule` follows it too (imports `ProductsModule`, calls
`productsService.findOne(...)` to validate a product before adding it) —
and `AuthModule` imports `CartModule` for the same reason, to call
`cartService.mergeGuestCartIntoUser(...)` on login/register. **`OrdersModule`
is the one deliberate exception to "never that domain's Prisma tables
directly"** — see "Orders: checkout, price snapshots, and the one
intentional exception" below for why.

## Configuration architecture

Environment configuration is centralized in `apps/api/src/config`:

- **`env.schema.ts`** — a Zod schema (`validateEnv`) covering every environment
  variable the app reads: `NODE_ENV`, `PORT`, `DATABASE_URL`, `CORS_ORIGINS`,
  the auth signing secrets/TTLs (`AUTH_JWT_*`, required now that AuthModule
  consumes them -- see `docs/authentication.md`), and placeholders for
  future storage config (`STORAGE_*`) that nothing consumes yet. Storage
  placeholders are optional so the app boots without them; `DATABASE_URL`
  and the two `AUTH_JWT_*_SECRET` variables are the required ones.
- **`app-config.module.ts`** — a `@Global()` module that calls
  `ConfigModule.forRoot({ isGlobal: true, validate: validateEnv })`. Validation
  runs once at startup, so a misconfigured environment fails immediately with
  a readable error instead of surfacing as an obscure runtime failure later.
- **`app-config.service.ts`** — a typed facade (`AppConfigService`) over
  `@nestjs/config`'s `ConfigService`. Every other module reads configuration
  through this (`config.port`, `config.corsOrigins`, `config.databaseUrl`,
  `config.auth`, `config.storage`) — nothing in the app reads `process.env`
  directly except this one file.

This lives in `apps/api`, not `packages/validation`: it validates the
_server's own runtime environment_, which is a different concern from the
request/response schemas `packages/validation` shares with the frontends.

This intentionally deviates from `class-validator`-based `@nestjs/config`
`validate` examples (which are common in the Nest ecosystem) — Zod was already
the project's chosen validation library (see below), so the environment schema
uses it too rather than introducing a second validation library for one file.

## Validation: Zod everywhere

Request/response validation uses **Zod**, not `class-validator`, specifically so
the same schema can be the source of truth on both sides of the contract:

- Backend: DTOs are built with `createZodDto()` from `nestjs-zod`, validated by the
  global `ZodValidationPipe` set in `apps/api/src/main.ts`.
- Frontend: the same schema (re-exported from `packages/validation`) validates a
  form before it's ever sent, so client-side and server-side validation cannot
  drift out of sync.

The trade-off: this is less idiomatic NestJS than `class-validator`, and pins Nest
to a version whose ecosystem (`nestjs-zod`) has caught up — see the NestJS version
note below. That trade-off was made deliberately for the shared-validation goal
(see `docs/api-contract.md`).

## Authentication: one system, two transports

**Implemented** — full design, token/session strategy, rotation and reuse
detection, and security rationale are in **`docs/authentication.md`**; this
section stays as the short version.

Three clients, but conceptually **one** auth system — a single set of
endpoints (`/api/v1/auth/...`), one token format, one user/session model in
the database. What differs is how the token travels, because a browser and
a mobile app have fundamentally different storage primitives:

|                     | Web Store                                   | Admin Portal            | React Native (future)                     |
| ------------------- | ------------------------------------------- | ----------------------- | ----------------------------------------- |
| Transport           | httpOnly, secure cookie                     | httpOnly, secure cookie | `Authorization: Bearer <token>`           |
| CSRF exposure       | Mitigated by strict CORS + JSON-only bodies | Same                    | No (not a browser)                        |
| Token storage       | Browser-managed (inaccessible to JS)        | Browser-managed         | Secure device storage (Keychain/Keystore) |
| Distinguishing role | `CUSTOMER`                                  | `ADMIN` / `SUPER_ADMIN` | `CUSTOMER`                                |

`@kiranabar/api-client`'s `createApiClient()` models this split:
`useCredentials: true` for the two browser clients, `getAccessToken()` for
the future mobile client — both already wired into `apps/store` and
`apps/admin`'s auth integration. Client type (which decides whether tokens
also travel in the response body, for the future mobile client) is decided
by an `X-Client-Platform` request header, defaulting to the safer
cookie-only behavior. See `CLAUDE.md` for the non-negotiables this
implementation follows.

Authorization (as opposed to authentication) is a single role-based guard
system in the backend, not two backends: `RolesGuard` + `@Roles(...)`,
registered globally, gate specific routes — the Admin Portal calling the
same API as the Web Store, distinguished by the caller's role, is what rule
3 in `CLAUDE.md` means by "authorization, not separate APIs."

## Product catalog: visibility and concurrency

**Implemented** — full request/response contracts in `docs/api-contract.md`.
Two mechanisms here are worth understanding, not just using:

- **Public, role-aware read endpoints.** `GET /products` and
  `GET /categories` (and their `:id`/`:slug` variants) never require
  authentication — a store must be browsable anonymously — but an
  authenticated `ADMIN`/`SUPER_ADMIN` sees `DRAFT`/`ARCHIVED` items too,
  while an anonymous or `CUSTOMER` caller is always forced to `ACTIVE`
  regardless of what status they request in the query string (a customer
  passing `?status=DRAFT` gets the same `ACTIVE`-only result as passing
  nothing — the query param is not trusted for authorization). This needed
  a guard that authenticates _if possible_ without ever rejecting the
  request: `OptionalJwtAuthGuard` + `@OptionalUser()`
  (`apps/api/src/auth/guards/optional-jwt-auth.guard.ts`), layered on top
  of `@Public()` on those specific routes. This is the same "one contract,
  authorization not separate APIs" principle from the auth section above,
  applied to reads instead of writes: the Store and the Admin Portal hit
  the identical endpoint, and get different results because of who they
  are, not because they're calling different URLs.
- **Soft delete via status, not row removal.** `DELETE /products/:id` and
  `DELETE /categories/:id` set `status: "ARCHIVED"` rather than deleting the
  row — see `docs/database.md`'s "Future order history and price
  snapshots" for why this was already the documented plan before it was
  implemented: a future `Order` referencing a product by id must keep
  resolving even after that product is "deleted" from an admin's
  perspective. One consequence worth knowing: archiving a category with
  active children no longer hits the schema's `RESTRICT` constraint — that
  constraint only fires on an actual `DELETE`, and archiving is an
  `UPDATE`. Nothing is unsafe about this (a child category doesn't need its
  parent to still be active), it's just a different code path than the one
  documented in `docs/database.md`.
- **Hard delete, gated behind archiving.** `DELETE /products/:id/permanent`
  and `DELETE /categories/:id/permanent` do remove the row, but only once
  the item is already `ARCHIVED` (a `409` otherwise) — soft delete stays
  the only one-step action; hard delete is a deliberate second step from
  the Admin Portal. Both still rely on the schema constraints documented in
  `docs/database.md`: `OrderItem.product` is `onDelete: Restrict`, so a
  product with order history can never be hard-deleted (a `409`, not a
  crash — the service catches Prisma's `P2003` and rethrows a clean
  error); `Category.parent` is likewise `Restrict`, so a category still
  referenced by child categories can't be hard-deleted either. Products
  reference a hard-deleted category via `onDelete: SetNull`, and a product's
  own images/inventory `Cascade`.
- **Optimistic concurrency on inventory adjustments.** `PATCH
/products/:id/inventory` requires the caller to send back the `version`
  it last read; the update only applies `WHERE version = $that`, and a
  mismatch (another request updated the row first) returns `409`, not a
  silent overwrite. This is exactly the mechanism `docs/database.md`
  designed `Inventory.version` for, now actually wired up — the first real
  exercise of "maintaining inventory safely" ahead of checkout existing.
- **Product variants are additive, not a separate visibility/concurrency
  model.** A `ProductVariant`'s `status` follows the exact same
  archive/hard-delete rules as `Product`'s above (its own `DELETE
.../variants/:variantId[/permanent]` pair), and its own `Inventory` row
  uses the exact same optimistic-concurrency mechanism via `PATCH
.../variants/:variantId/inventory`. See `docs/database.md`'s "Product
  variants" for the full schema-level design and why it's additive rather
  than a breaking repoint of `Product`.

## Cart: identity, pricing, and merge on login

**Implemented** — full request/response contracts in
`docs/api-contract.md`; schema in `docs/database.md`.
`docs/requirements.md` is explicit that a cart must be "usable without an
account until checkout," which drove every decision here:

- **A cart belongs to either a `User` or an anonymous guest, never both.**
  `Cart.userId` and `Cart.guestToken` are both nullable/unique columns;
  exactly one is set. A guest is identified by an opaque random token
  issued as a cookie (`guest_cart_token`, `apps/api/src/cart/guest-cart-cookie.util.ts`)
  the first time they add an item — not before, so an anonymous page view
  never creates a database row. This reuses the same `OptionalJwtAuthGuard`
  - `@OptionalUser()` pattern as catalog browsing: every `/cart` route is
    `@Public()`, and the controller resolves "whose cart" from either the
    authenticated user or that cookie.
- **A cart reflects live pricing, not a snapshot.** `CartItem` stores only
  `productId` and `quantity` — no price. `unitPrice`/`lineTotal` are
  computed at read time from the product's current `price`/`salePrice`.
  This is the opposite of the future `Order`, which must snapshot price
  (`docs/database.md`'s "Future order history and price snapshots") — a
  cart is _supposed_ to update if a price changes while an item sits in
  it; only a placed order's receipt must not.
- **Adding to cart is capped by `Inventory.quantityAvailable`**, checked
  against the running total for that line (not just the single request's
  quantity) so two small additions can't add up past what's in stock. This
  is a soft, cart-time guard, not the checkout-time reservation
  `docs/database.md`'s `Inventory.version` was designed for — nothing here
  reserves stock; that's checkout's job once it exists.
- **A guest cart merges into the account on login/register.**
  `AuthController` reads the `guest_cart_token` cookie (if present) after
  a successful login/register, calls `CartService.mergeGuestCartIntoUser`,
  and clears the cookie. Matching product lines have their quantities
  added together; the guest cart row is then deleted. This is why
  `AuthModule` imports `CartModule` — a real cross-module dependency, not
  a layering violation, since it goes through `CartService`'s exported
  method rather than touching `cart`/`cart_items` directly.

## Orders: checkout, price snapshots, and the one intentional exception

**Implemented** — full request/response contracts in `docs/api-contract.md`;
schema in `docs/database.md`. Checkout and cancellation are customer-only,
from the caller's own cart/orders. Listing and reading a single order are
role-aware (customers see their own; staff see every order). Admin status
transitions (`PLACED`→`PAID`→`SHIPPED`→`DELIVERED`) are implemented too —
see "Admin order management" below. Payment integration is still stubbed
pending a provider decision, per `docs/requirements.md`'s build order.

- **Checkout requires an account — no guest checkout.** Unlike cart, which
  is deliberately usable anonymously, `POST /orders/checkout` sits behind
  the default global `JwtAuthGuard` like any other route (no `@Public()`),
  and every order row has a required `userId`. This is a product decision
  from `docs/requirements.md`, not a technical constraint.
- **Every order line snapshots price, name, and SKU at checkout time.**
  This is the requirement `docs/database.md`'s "Future order history and
  price snapshots" flagged before `Order` existed: `OrderItem.unitPrice`/
  `productName`/`productSku` are copied from `Product` once, at the moment
  of purchase, and never recomputed. A later price change, rename, or
  re-SKU must never alter a past receipt — the opposite of `Cart`, which
  deliberately always reflects the product's _current_ price.
- **Checkout is one atomic database transaction, and this is the one place
  in the codebase that reaches into another domain's Prisma tables
  directly.** `OrdersService.checkout()` (`apps/api/src/orders/orders.service.ts`)
  needs order creation, per-line inventory decrement, and cart clearing to
  either all succeed or all roll back together — if inventory decremented
  but the order create failed, stock would be silently lost; if the order
  was created but the cart wasn't cleared, a customer could re-checkout the
  same items. Nest's per-service `this.prisma` pattern (every other module
  in this codebase) has no way to share one transaction handle across
  `ProductsService`/`InventoryService`/`CartService`/`OrdersService`
  instances, so `checkout()` opens `this.prisma.$transaction(async (tx) =>
{...})` and reads/writes `tx.product`, `tx.inventory`, `tx.order`, and
  `tx.cart` directly inside it, rather than calling out to those other
  services (which would each open — or need — their own transaction).
  Everywhere else in this codebase, "reach another domain's data only
  through its exported service" (see "Module structure" above) still
  applies without exception; this is a narrow, single-method carve-out for
  genuine multi-aggregate atomicity, not a precedent for skipping the rule
  when it's merely convenient. This same transaction now also reaches
  `tx.productVariant` when a cart line is pinned to a variant — each of
  the four touch points (stock check, decrement, order-item snapshot,
  cancel-restock) just branches on whether the line has a `variantId`,
  reading/writing the variant's own `Inventory` row instead of the
  product's; no new transaction boundary was needed. See
  `docs/database.md`'s "Product variants".
- **Reads (`findOrders`, `findOrder`), cancellation, and status updates
  still go through `this.prisma` directly too**, but for a simpler reason:
  they only ever touch the `Order`/`OrderItem` tables `OrdersService`
  already owns, the same as any other domain service reading its own
  tables.
- **Checkout reuses `Inventory.version` exactly as designed**
  (`docs/database.md`'s "Inventory" section) — the same `WHERE product_id =
? AND version = ?` guarded decrement `InventoryService.adjust()` uses, now
  exercised for the first time by a real caller (checkout) instead of just
  a direct admin adjustment. A stale version aborts the whole transaction
  with `409`, and the customer is expected to refresh their cart and retry.
- **Cancelling an order restores stock, without the same version guard.**
  `cancelMyOrder()` increments `quantityAvailable` back for each line, but
  doesn't condition it on a matching `version` the way checkout's decrement
  does. This is deliberate, not an oversight: an increment is commutative
  and safe to apply no matter what else has happened to the row in the
  meantime, whereas a decrement is exactly the "two concurrent writers
  racing" case optimistic concurrency exists to protect against.
- **Cancellation is customer self-service, and only from `PLACED`.**
  `PATCH /api/v1/orders/:id/cancel` is rejected with `403` once an order
  has moved to `PAID` or beyond — cancelling after payment is a refund
  concern (and, once shipped, a returns concern), neither of which is
  built. Cancellation stays this one customer-initiated route; it is
  deliberately not folded into the admin status-update endpoint below (see
  "Admin order management").
- **The shipping address is captured, not selected.** `POST
/orders/checkout` takes a full `shippingAddress` object in the request
  body and copies its fields directly onto the new `Order` row — there is
  no saved-address book to choose from (see `docs/database.md`'s "Order &
  OrderItem" for why that's a deliberately deferred model, not an
  oversight).

### Admin order management

Two capabilities, both `ADMIN`/`SUPER_ADMIN`-only, satisfy
`docs/requirements.md`'s "Order management: view orders, update order
status" and "Customer visibility: view customer accounts and their order
history":

- **`GET /orders` and `GET /orders/:id` are role-aware**, the same "same
  endpoint, authorization differs by caller" pattern as `ProductsController`
  (see "Product catalog: visibility and concurrency" above) —
  `OrdersService.findOrders`/`findOrder` take a `callerIsStaff` flag
  (computed via `isStaff()`, the same helper `ProductsController` uses)
  alongside the caller's own id. A `CUSTOMER` is always forced to their own
  orders, exactly like a `CUSTOMER` is forced to `status: "ACTIVE"` on the
  product catalog — an admin-only `userId` query param is accepted but
  silently ignored for a non-staff caller, never trusted for
  authorization. An `ADMIN`/`SUPER_ADMIN` caller with no `userId` sees
  every order; with one, they see just that customer's history. This is
  deliberately **not** a separate `/admin/orders` route: the data shape is
  identical, only the scope differs by role, which is exactly what rule 3
  in `CLAUDE.md` means by "authorization, not separate APIs." "View
  customer accounts" itself needs no new endpoint — the existing
  `GET /users` (paginated list, `ADMIN`/`SUPER_ADMIN`) already provides the
  account/`userId` an admin then passes to `GET /orders?userId=...`.
- **`PATCH /orders/:id/status` is a separate, genuinely admin-only route**
  (`@Roles("ADMIN", "SUPER_ADMIN")`, not role-aware on an existing path),
  because unlike a read, this is a capability a `CUSTOMER` should never
  have at all, on any order, so there's no shared contract to unify with a
  customer route the way listing is. It accepts `"PAID"`, `"SHIPPED"`, or
  `"DELIVERED"` as the target — never `"PLACED"` (the automatic starting
  state) or `"CANCELLED"` (that stays `PATCH /orders/:id/cancel`,
  customer-only, per an explicit scoping decision for this phase: an
  admin-initiated cancel-after-payment is really a refund workflow, which
  isn't built).
- **Transitions are forward-only, one stage at a time.** `OrdersService`
  keeps a small `PLACED → PAID → SHIPPED → DELIVERED` next-status map;
  `updateStatus()` rejects any target that isn't the order's immediate
  next stage — skipping a stage (`PLACED` straight to `SHIPPED`), moving
  backward, or updating a `CANCELLED` or already-`DELIVERED` order (both
  terminal, with no next stage) all return `409`, the same status code
  used for every other "the resource's current state doesn't allow this
  operation" case in this API (a stale inventory `version`, a duplicate
  slug). This was a deliberate scope decision for this phase, not a
  technical constraint — a looser "any forward status" rule was considered
  and rejected in favor of matching a real fulfillment pipeline's
  guardrails.

## Shared packages

| Package                 | Contains                                                   | Must never contain                                                                                                             |
| ----------------------- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `@kiranabar/types`      | Plain TS types/interfaces (response envelopes, pagination) | Zod, fetch, any runtime dependency                                                                                             |
| `@kiranabar/validation` | Zod schemas + inferred types                               | UI framework code                                                                                                              |
| `@kiranabar/api-client` | A `fetch`-based HTTP client factory                        | Endpoint-specific methods (no `getProducts()` etc. — that's each app's job to compose from `get`/`post`/...), any UI framework |
| `@kiranabar/config`     | tsconfig/eslint/prettier/vitest bases                      | Application code                                                                                                               |

`api-client` is deliberately generic (`get`/`post`/`put`/`patch`/`delete`) rather
than a typed SDK with one method per endpoint. No business API contract has been
defined yet (see `docs/api-contract.md`), so encoding specific endpoints into a
shared client now would mean inventing a contract ahead of the actual requirements.
Each app is expected to compose small, typed wrapper functions/composables/hooks
around the generic client as real endpoints are built.

## Database architecture

- **PostgreSQL**, accessed exclusively through **Prisma**, itself accessed
  exclusively through `PrismaService` (see "Module structure" above) — no
  other file in the repository, backend or frontend, imports `@prisma/client`.
- **Connection config** comes from `AppConfigService.databaseUrl`
  (`DATABASE_URL`), not read from `process.env` directly — see "Configuration
  architecture" above.
- **`prisma.config.ts`** (`apps/api/prisma.config.ts`) is where Prisma CLI
  commands (`generate`, `migrate`, `validate`) get their schema path and
  datasource URL from. This is separate from `AppConfigService`: the CLI runs
  outside the Nest process, so it loads `.env` itself via `dotenv/config`.
- **`prisma/schema.prisma`** declares `User`, `Category`, `Product`,
  `ProductImage`, `Inventory`, `Cart`, `CartItem`, `Order`, and `OrderItem`
  — users/roles, the catalog's structural data, cart, and orders. Full
  entity/relationship documentation, including every constraint decision,
  lives in **`docs/database.md`**; this file only covers how the database
  fits the backend's architecture. `Payment`/`Shipment` models are not
  defined yet — see `docs/requirements.md`.

### Migration workflow

Once a domain module (e.g. `products`) is ready for real models:

1. Add the model(s) to `prisma/schema.prisma`.
2. `pnpm --filter @kiranabar/api prisma:migrate` — creates and applies a
   migration under `prisma/migrations/`, and regenerates the client.
3. Commit the generated migration folder — migrations are part of the
   database's version history, not a build artifact.
4. `pnpm --filter @kiranabar/api prisma:generate` re-runs codegen only (no
   migration), useful after pulling someone else's schema change.
5. `pnpm --filter @kiranabar/api prisma:validate` checks the schema file's
   syntax/consistency without touching a database — safe to run in CI or
   without a reachable PostgreSQL.

The first migration, `20260901121721_init_catalog_and_users`, has been
generated and applied against a real PostgreSQL instance (see
`docs/database.md`'s "Migration & seed status"). A small, idempotent dev
seed (`prisma/seed.ts`, run via `pnpm --filter @kiranabar/api prisma:seed`)
exercises every relationship in the current schema.

## NestJS and Prisma version notes

- **NestJS 11.2.x**, not the newly released 12.x: `nestjs-zod` (the library that
  makes Zod-based validation idiomatic in Nest) currently declares peer support for
  `@nestjs/common` `^10 || ^11`, not `^12`. Nest 11 is the newest major with full
  ecosystem support for the validation approach this project standardized on.
- **Prisma 7.x** removed the inline `datasource.url` in `schema.prisma` in favor of
  `prisma.config.ts` plus an explicit **driver adapter** (`@prisma/adapter-pg` +
  `pg` here) passed to the `PrismaClient` constructor. `PrismaService` reflects
  this. One practical consequence: the adapter connects lazily, so
  `PrismaService.onModuleInit`'s `$connect()` doesn't fail even if PostgreSQL isn't
  reachable yet — the failure only surfaces on the first real query.
- The initial models (`User`, `Category`, `Product`, `ProductImage`,
  `Inventory`) are defined — see `docs/database.md` for the full design.

## Testing architecture

Vitest is the test runner for every package (see `CLAUDE.md` for the exact setup
per app). The one non-obvious piece: NestJS's decorator-based DI relies on
TypeScript's `emitDecoratorMetadata`, which Vitest's default esbuild transform
doesn't reproduce faithfully. `apps/api`'s Vitest configs use `unplugin-swc`
instead, which is the community-standard way to get accurate Nest DI metadata
under Vitest (mirroring what Nest's own SWC-based builder does).

## Deliberately deferred decisions

These are real architectural decisions, intentionally not made yet because making
them now would mean inventing requirements:

- `Payment`/`Shipment` endpoints and models, and a saved-address book —
  see `docs/database.md`'s "Explicitly not in this schema yet" for what's
  deferred and why (`Cart` and `Order` are both implemented — see "Cart:
  identity, pricing, and merge on login" and "Orders: checkout, price
  snapshots, and the one intentional exception" above; product variants,
  size/color, are also implemented now — see "Product catalog: visibility
  and concurrency" above and `docs/database.md`'s "Product variants").
- An admin-initiated cancel/refund path (e.g. cancelling a `PAID` order
  before it ships) — cancellation stays customer-only and `PLACED`-only;
  see "Admin order management" above. Real payment integration (beyond a
  stub) is the bigger blocker here anyway: cancelling after payment
  without a way to actually reverse the charge isn't a complete feature.
- Login rate limiting — a real gap before production, deliberately not
  added yet; see `docs/authentication.md`'s "Deliberately out of scope."
- Product image **upload** — `POST /products/:id/images` accepts a URL, not
  a file; nothing in the app talks to object storage yet (the `STORAGE_*`
  config placeholders remain unconsumed). An admin uploads to external
  storage/a CDN by some other means today and pastes the resulting URL.
- Whether `products`/`categories`/`inventory` end up staying three NestJS
  modules or folding into fewer as more catalog features are added — the
  current split matches `docs/requirements.md`'s scope, not a permanent
  decision.
