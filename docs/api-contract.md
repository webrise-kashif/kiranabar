# API Contract — Principles & Structure

This document defines **how** the API is shaped, not **what** endpoints exist yet.
Concrete endpoints are added here as they're built against a confirmed requirement
in `docs/requirements.md` — this file is not the place to speculate about them
ahead of time.

## Base URL and versioning

```
https://<host>/api/v1/...
```

- `setGlobalPrefix('api')` + URI versioning (`VersioningType.URI`,
  `defaultVersion: '1'`) in `apps/api/src/main.ts`.
- A breaking change to an existing endpoint's contract means introducing `v2` for
  that route, not mutating `v1` in place. Additive changes (a new optional field,
  a new endpoint) don't require a version bump.

## Transport

- REST over HTTPS. JSON request and response bodies.
- `GET` for reads, `POST` for creation, `PATCH` for partial updates, `PUT` reserved
  for full replacement (unused until a resource needs it), `DELETE` for removal.

## Response envelope

Every response — success or error — matches `@kiranabar/types`:

```ts
// Success
{ "data": T }

// Error
{ "error": { "code": string, "message": string, "details"?: unknown } }
```

Applied automatically for every controller via `ResponseEnvelopeInterceptor` and
`HttpExceptionFilter` (`apps/api/src/common`) — individual controllers/services
never construct this envelope by hand. Clients should always check for the
`error` key (`isApiErrorResponse()` from `@kiranabar/types`) rather than relying
on the HTTP status code alone.

`code` is always the `UPPER_SNAKE` name of the HTTP status (`BAD_REQUEST`,
`UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND`, `CONFLICT`, `INTERNAL_SERVER_ERROR`,
...) — one stable format for clients to match on. `message` is the
human-readable explanation; `details`, when present, carries structured data
(the Zod issues for a validation failure).

## Validation

Request bodies/query params are validated with **Zod**, via `nestjs-zod`'s
`ZodValidationPipe` (registered globally). A schema that's needed on both the
backend and a frontend form lives in `packages/validation` and is imported by
both sides — see `paginationQuerySchema` for the current example. A schema that's
purely internal to one endpoint's DTO can live alongside that endpoint in
`apps/api`.

A validation failure returns `400` with the standard error envelope; `details`
carries the underlying Zod issues.

## Pagination

List endpoints accept `page` (1-indexed) and `pageSize` query params, validated by
`paginationQuerySchema` (`@kiranabar/validation`), and respond with
`PaginatedResult<T>` (`@kiranabar/types`):

```ts
interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}
```

This is the whole `data` payload for a list endpoint, i.e. the full response is
`{ "data": { "items": [...], "total": 137, "page": 1, "pageSize": 20 } }`.

## Authentication & authorization

**Implemented** — full design in `docs/authentication.md`. Summary of what
it means for the wire contract:

- Every route requires a valid session (cookie or `Authorization: Bearer`)
  **unless explicitly marked public** — `/health`, `/auth/register`,
  `/auth/login`, `/auth/refresh`, `/auth/logout`, and the catalog read
  endpoints (see "What exists today" below). This is enforced by a
  globally-registered guard, not opt-in per route.
- Web Store & Admin Portal: httpOnly, secure cookies. Future React Native
  app: `Authorization: Bearer <token>`, negotiated via the
  `X-Client-Platform` request header (see `docs/authentication.md`).
- One token format, one user/session model — the transport is what differs,
  not the underlying auth system.
- Authorization is role-based (`CUSTOMER` / `ADMIN` / `SUPER_ADMIN`) via
  `@Roles(...)` + a globally-registered `RolesGuard` on top of whichever
  endpoint needs it.
- A request with no/invalid/expired credentials gets `401`; valid
  credentials but the wrong role get `403` — both via the standard error
  envelope, never a silently-empty or filtered response.

## How clients consume this API

All three clients talk to the API the same way, through `@kiranabar/api-client`'s
`createApiClient()` — never `fetch`/`$fetch`/`axios` called directly against
`/api/v1/...` from application code:

| Client                | Base URL source                                                | Auth transport                  |
| --------------------- | -------------------------------------------------------------- | ------------------------------- |
| Web Store (Nuxt)      | `runtimeConfig.public.apiBaseUrl` (`NUXT_PUBLIC_API_BASE_URL`) | `useCredentials: true` (cookie) |
| Admin Portal (Vite)   | `import.meta.env.VITE_API_BASE_URL`                            | `useCredentials: true` (cookie) |
| React Native (future) | a build-time/config value, TBD when that app is scaffolded     | `getAccessToken()` (bearer)     |

Each app wraps the generic client in its own composable/hook (see
`apps/store/app/composables/{useApiClient,useAuth}.ts` and
`apps/admin/src/auth/AuthContext.tsx` for the current pattern) rather than
the shared package exposing per-endpoint methods — see
`docs/architecture.md`'s "Shared packages" section for why.

## Errors

Use Nest's standard `HttpException` subclasses (`BadRequestException`,
`NotFoundException`, `ForbiddenException`, `UnauthorizedException`, etc.) — the
global filter normalizes whatever Nest produces into the shared envelope, so
handlers should throw the semantically correct exception rather than
hand-rolling a response.

## What exists today

| Method   | Path                                                 | Access                             | Purpose                                                                                                          |
| -------- | ---------------------------------------------------- | ---------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `GET`    | `/api/v1/health`                                     | Public                             | Liveness check; `{ data: { status: "ok", timestamp } }`                                                          |
| `POST`   | `/api/v1/auth/register`                              | Public                             | Register a new CUSTOMER account and start a session                                                              |
| `POST`   | `/api/v1/auth/login`                                 | Public                             | Start a session for an existing account                                                                          |
| `POST`   | `/api/v1/auth/logout`                                | Public (idempotent)                | Revoke the current session                                                                                       |
| `GET`    | `/api/v1/auth/me`                                    | Any authenticated user             | The caller's own account                                                                                         |
| `POST`   | `/api/v1/auth/refresh`                               | Public (refresh token required)    | Rotate to a new access/refresh token pair                                                                        |
| `GET`    | `/api/v1/users`                                      | `ADMIN`, `SUPER_ADMIN`             | Paginated user list                                                                                              |
| `PATCH`  | `/api/v1/users/:id/role`                             | `SUPER_ADMIN`                      | Change a user's role                                                                                             |
| `GET`    | `/api/v1/categories`                                 | Public, role-aware                 | Paginated category list                                                                                          |
| `GET`    | `/api/v1/categories/:idOrSlug`                       | Public, role-aware                 | One category with its direct children                                                                            |
| `POST`   | `/api/v1/categories`                                 | `ADMIN`, `SUPER_ADMIN`             | Create a category                                                                                                |
| `PATCH`  | `/api/v1/categories/:id`                             | `ADMIN`, `SUPER_ADMIN`             | Update a category                                                                                                |
| `DELETE` | `/api/v1/categories/:id`                             | `ADMIN`, `SUPER_ADMIN`             | Archive a category (soft delete)                                                                                 |
| `DELETE` | `/api/v1/categories/:id/permanent`                   | `ADMIN`, `SUPER_ADMIN`             | Permanently delete an already-archived category (hard delete)                                                    |
| `GET`    | `/api/v1/products`                                   | Public, role-aware                 | Paginated, filterable product list                                                                               |
| `GET`    | `/api/v1/products/:idOrSlug`                         | Public, role-aware                 | One product                                                                                                      |
| `POST`   | `/api/v1/products`                                   | `ADMIN`, `SUPER_ADMIN`             | Create a product (with optional initial images/stock)                                                            |
| `PATCH`  | `/api/v1/products/:id`                               | `ADMIN`, `SUPER_ADMIN`             | Update a product                                                                                                 |
| `DELETE` | `/api/v1/products/:id`                               | `ADMIN`, `SUPER_ADMIN`             | Archive a product (soft delete)                                                                                  |
| `DELETE` | `/api/v1/products/:id/permanent`                     | `ADMIN`, `SUPER_ADMIN`             | Permanently delete an already-archived product (hard delete)                                                     |
| `POST`   | `/api/v1/products/:id/images`                        | `ADMIN`, `SUPER_ADMIN`             | Add an image                                                                                                     |
| `PATCH`  | `/api/v1/products/:id/images/:id`                    | `ADMIN`, `SUPER_ADMIN`             | Update an image (position, alt text, primary)                                                                    |
| `DELETE` | `/api/v1/products/:id/images/:id`                    | `ADMIN`, `SUPER_ADMIN`             | Remove an image                                                                                                  |
| `GET`    | `/api/v1/products/:id/inventory`                     | `ADMIN`, `SUPER_ADMIN`             | Current stock counts                                                                                             |
| `PATCH`  | `/api/v1/products/:id/inventory`                     | `ADMIN`, `SUPER_ADMIN`             | Adjust stock (optimistic concurrency, see below)                                                                 |
| `POST`   | `/api/v1/products/:id/variants`                      | `ADMIN`, `SUPER_ADMIN`             | Create a variant (own sku/price/attributes/stock) -- see "Product Variant"                                       |
| `PATCH`  | `/api/v1/products/:id/variants/:variantId`           | `ADMIN`, `SUPER_ADMIN`             | Update a variant                                                                                                 |
| `DELETE` | `/api/v1/products/:id/variants/:variantId`           | `ADMIN`, `SUPER_ADMIN`             | Archive a variant (soft delete)                                                                                  |
| `DELETE` | `/api/v1/products/:id/variants/:variantId/permanent` | `ADMIN`, `SUPER_ADMIN`             | Permanently delete an already-archived variant (hard delete)                                                     |
| `GET`    | `/api/v1/products/:id/variants/:variantId/inventory` | `ADMIN`, `SUPER_ADMIN`             | The variant's own stock counts, independent of the product's                                                     |
| `PATCH`  | `/api/v1/products/:id/variants/:variantId/inventory` | `ADMIN`, `SUPER_ADMIN`             | Adjust the variant's own stock                                                                                   |
| `GET`    | `/api/v1/cart`                                       | Public (guest or logged-in)        | The caller's own cart                                                                                            |
| `POST`   | `/api/v1/cart/items`                                 | Public (guest or logged-in)        | Add an item (optionally pinned to a `variantId`), or increase its quantity                                       |
| `PATCH`  | `/api/v1/cart/items/:productId`                      | Public (guest or logged-in)        | Set a line item's quantity -- `?variantId=` addresses that variant's line, omitted addresses the no-variant line |
| `DELETE` | `/api/v1/cart/items/:productId`                      | Public (guest or logged-in)        | Remove a line item -- same `?variantId=` addressing                                                              |
| `DELETE` | `/api/v1/cart`                                       | Public (idempotent)                | Empty the cart                                                                                                   |
| `POST`   | `/api/v1/orders/checkout`                            | Any authenticated user             | Convert the caller's cart into an order                                                                          |
| `GET`    | `/api/v1/orders`                                     | Any authenticated user, role-aware | Own orders (`CUSTOMER`) or every order, optionally filtered by `userId` (`ADMIN`/`SUPER_ADMIN`)                  |
| `GET`    | `/api/v1/orders/:id`                                 | Any authenticated user, role-aware | One order -- own only (`CUSTOMER`) or any (`ADMIN`/`SUPER_ADMIN`)                                                |
| `PATCH`  | `/api/v1/orders/:id/cancel`                          | Any authenticated user (owner)     | Cancel one of the caller's own orders, only while `PLACED`                                                       |
| `PATCH`  | `/api/v1/orders/:id/status`                          | `ADMIN`, `SUPER_ADMIN`             | Advance an order one stage: `PLACED`→`PAID`→`SHIPPED`→`DELIVERED`                                                |

Full request/response contracts for the `auth`/`users` rows are in
`docs/authentication.md`'s "API endpoints" section. The catalog contracts
are below.

"Public, role-aware" means no authentication is required, but the response
differs by caller: an anonymous or `CUSTOMER` caller only ever sees
`status: "ACTIVE"` items (even if they explicitly request another status),
while `ADMIN`/`SUPER_ADMIN` see every status by default and can filter to a
specific one. See `docs/architecture.md`'s "Product catalog: visibility and
concurrency" for how this is enforced.

### Category

```json
// POST /api/v1/categories  (ADMIN/SUPER_ADMIN)
{ "name": "Shirts", "slug": "shirts", "parentId": "01a0...", "status": "ACTIVE" }

// 201
{ "data": { "id": "...", "name": "Shirts", "slug": "shirts", "description": null,
            "status": "ACTIVE", "parentId": "01a0...", "createdAt": "...", "updatedAt": "..." } }

// GET /api/v1/categories/shirts
{ "data": { "id": "...", "name": "Shirts", "slug": "shirts", "status": "ACTIVE",
            "parentId": "01a0...", "children": [], "createdAt": "...", "updatedAt": "..." } }
```

`409` for a duplicate slug or a category set as its own parent; `404` for a
missing category, or a non-`ACTIVE` one when the caller isn't staff.

### Product

```json
// POST /api/v1/products  (ADMIN/SUPER_ADMIN)
{
  "name": "Classic Tee", "slug": "classic-tee", "sku": "TSHIRT-001",
  "price": "24.99", "salePrice": "19.99", "currency": "USD", "status": "ACTIVE",
  "categoryId": "01a0...", "initialQuantity": 100,
  "images": [{ "url": "https://cdn.example.com/tee.jpg", "isPrimary": true }]
}

// 201
{
  "data": {
    "id": "...", "name": "Classic Tee", "slug": "classic-tee", "sku": "TSHIRT-001",
    "price": "24.99", "salePrice": "19.99", "currency": "USD", "status": "ACTIVE",
    "categoryId": "01a0...", "category": { "id": "01a0...", "name": "Shirts", "slug": "shirts" },
    "images": [{ "id": "...", "url": "https://cdn.example.com/tee.jpg", "altText": null,
                 "position": 0, "isPrimary": true, "variantId": null }],
    "inventory": { "quantityAvailable": 100, "quantityReserved": 0, "version": 0 },
    "variants": [],
    "createdAt": "...", "updatedAt": "..."
  }
}
```

`price`/`salePrice` are strings on the wire in both directions — never a
JSON number — to keep money out of floating-point representation entirely
(see `docs/database.md`). `salePrice`, when set, must be less than `price`;
violating this is `400` on create, and on update if both are present in the
same request (an update that only touches `salePrice` is checked against
the product's current stored `price` in the service layer, not statically).

`GET /api/v1/products` accepts `page`, `pageSize`, `categoryId`, `status`
(role-aware, see above), and `search` (case-insensitive, matches product
name) query params. `409` for a duplicate `slug` or `sku`.

`variants` is always present (an empty array for a product with none) --
see "Product Variant" below. It's an optional, additive sub-resource:
`price`/`sku`/`status`/`inventory` on `Product` itself never change
because of variants.

### Product Variant

```json
// POST /api/v1/products/:id/variants  (ADMIN/SUPER_ADMIN)
{
  "sku": "TSHIRT-001-RED-M", "price": "26.99", "attributes": { "color": "Red", "size": "M" },
  "initialQuantity": 10
}

// 201
{
  "data": {
    "id": "...", "productId": "01a0...", "sku": "TSHIRT-001-RED-M",
    "price": "26.99", "salePrice": null, "currency": "USD",
    "attributes": { "color": "Red", "size": "M" }, "status": "ACTIVE",
    "images": [], "inventory": { "quantityAvailable": 10, "quantityReserved": 0, "version": 0 },
    "createdAt": "...", "updatedAt": "..."
  }
}

// 409 for a duplicate variant sku (globally unique, same rule as Product.sku)
{ "error": { "message": "A variant with this SKU already exists" } }

// 400 on create, or on update if both are present, when salePrice isn't less than price
// -- same rule and message as Product above

// DELETE /api/v1/products/:id/variants/:variantId  (archive, like Product)
// DELETE /api/v1/products/:id/variants/:variantId/permanent  (hard delete, gated on ARCHIVED)
// 409 attempting the permanent route before archiving, or if the variant has order history
{ "error": { "message": "Variant must be archived before it can be deleted" } }

// GET/PATCH /api/v1/products/:id/variants/:variantId/inventory
// -- same shape and optimistic-concurrency rules as Product's own /inventory above,
// but scoped to this variant's own Inventory row, independent of the product's
```

A variant's own `sku`/`price`/`salePrice`/`currency`/`inventory` are fully
independent of its product's -- no inheritance or fallback. `attributes`
is a flat string-to-string map (e.g. `{"color":"Red","size":"M"}`), 1-10
entries, validated by `productVariantAttributesSchema`
(`packages/validation`). Adding an image with a `variantId` in the body
(`POST/PATCH /products/:id/images[/:imageId]`) tags it to that variant
instead of the product's general gallery; the `variantId` must belong to
the same product or the request is `404`.

### Inventory

```json
// GET /api/v1/products/:id/inventory  (ADMIN/SUPER_ADMIN)
{ "data": { "quantityAvailable": 100, "quantityReserved": 0, "version": 0 } }

// PATCH /api/v1/products/:id/inventory
{ "quantityAvailable": 95, "version": 0 }

// 200 (version incremented)
{ "data": { "quantityAvailable": 95, "quantityReserved": 0, "version": 1 } }

// 409 if `version` no longer matches the stored row (someone else updated it first)
{ "error": { "message": "Inventory was updated by another request -- refetch and retry with the current version" } }
```

`version` is required on every adjustment — this is optimistic concurrency,
not an audit field; see `docs/architecture.md`'s "Product catalog:
visibility and concurrency".

### Cart

No cart id in any URL — every route resolves "whose cart" from either the
authenticated caller or a `guest_cart_token` cookie the backend sets on the
first `POST /cart/items` a guest makes. See `docs/architecture.md`'s "Cart:
identity, pricing, and merge on login" for the full design.

```json
// POST /api/v1/cart/items  (works with or without a session)
// variantId is optional -- pins this line to one specific variant of the product
{ "productId": "01a0...", "variantId": "01a1...", "quantity": 2 }

// 201 -- Set-Cookie: guest_cart_token=... (first time only, guests only)
{
  "data": {
    "id": "...",
    "items": [
      {
        "productId": "01a0...",
        "product": { "id": "01a0...", "name": "Classic Tee", "slug": "classic-tee",
                     "price": "24.99", "salePrice": "19.99", "currency": "USD",
                     "status": "ACTIVE", "image": "https://cdn.example.com/tee.jpg" },
        "variantId": "01a1...",
        "variant": { "id": "01a1...", "sku": "TSHIRT-001-RED-M",
                     "attributes": { "color": "Red", "size": "M" },
                     "price": "26.99", "salePrice": null, "status": "ACTIVE" },
        "quantity": 2,
        "unitPrice": "26.99",
        "lineTotal": "53.98"
      }
    ],
    "subtotal": "53.98",
    "currency": "USD"
  }
}

// GET /api/v1/cart with no cart yet (no cookie, or a cookie matching nothing)
{ "data": { "id": null, "items": [], "subtotal": "0.00", "currency": "USD" } }
```

`unitPrice` is `variant?.salePrice ?? variant?.price ?? product.salePrice
?? product.price` **at read time** — a cart always reflects the current
price, never a snapshot (only a future `Order` snapshots price; see
`docs/database.md`). `variantId`/`variant` are `null` for a plain
(no-variant) line. `400` if `quantity` exceeds the selected variant's (or,
with no `variantId`, the product's) current `quantityAvailable`; `404` if
`variantId` doesn't belong to the product, or (from `PATCH`/`DELETE` on
`:productId`, optionally with `?variantId=`) if that exact line isn't in
the cart. Logging in or registering with a guest cart cookie present
merges its items (`variantId` included) into the account's cart and clears
the cookie — see `docs/architecture.md`.

### Order

`GET /orders` and `GET /orders/:id` are role-aware, the same "one endpoint,
authorization differs by caller" pattern as the catalog: a `CUSTOMER`
caller only ever sees their own orders (a mismatched owner on `:id`
returns `404`, not `403`, to avoid confirming the order exists); an
`ADMIN`/`SUPER_ADMIN` caller sees every order, and may pass `?userId=...`
to scope the list to one customer (viewing a customer's order history).
Checkout and cancellation remain customer-only, scoped to the caller.
Status updates are a separate, admin-only route. See
`docs/architecture.md`'s "Orders: checkout, price snapshots, and the one
intentional exception" for the full design, including why checkout is one
database transaction and why status transitions are forward-only.

```json
// POST /api/v1/orders/checkout  (requires an account -- no guest checkout)
{
  "shippingAddress": {
    "recipientName": "Jane Doe", "line1": "123 Main St", "line2": null,
    "city": "Springfield", "state": "IL", "postalCode": "62704",
    "country": "US", "phone": null
  }
}

// 201
{
  "data": {
    "id": "...", "status": "PLACED",
    "items": [
      { "productId": "01a0...", "productName": "Classic Tee", "productSku": "TSHIRT-001",
        "variantId": "01a1...", "variantSku": "TSHIRT-001-RED-M",
        "variantAttributes": { "color": "Red", "size": "M" },
        "unitPrice": "26.99", "quantity": 2, "lineTotal": "53.98" }
    ],
    "subtotal": "39.98", "currency": "USD",
    "shippingAddress": { "recipientName": "Jane Doe", "line1": "123 Main St", "line2": null,
                          "city": "Springfield", "state": "IL", "postalCode": "62704",
                          "country": "US", "phone": null },
    "createdAt": "...", "updatedAt": "..."
  }
}

// PATCH /api/v1/orders/:id/cancel  (only while status is "PLACED")
// 200 -- same shape as above, with "status": "CANCELLED" and stock restored

// PATCH /api/v1/orders/:id/status  (ADMIN/SUPER_ADMIN)
{ "status": "PAID" }

// 200 -- same shape as above, with the new status
// 409 if `status` isn't the immediate next stage for this order's current status
{ "error": { "message": "Cannot move order from \"PLACED\" to \"SHIPPED\" -- the next status must be \"PAID\"" } }
```

`country` is a 2-letter ISO code (uppercased server-side); `line2` and
`phone` are optional and `null` when omitted. `unitPrice`/`lineTotal`/
`subtotal` are snapshotted at checkout — unlike cart's live-computed
prices, they never change after the order is placed, even if the
product's (or variant's) price changes later. `variantId`/`variantSku`/
`variantAttributes` are `null` for a line that wasn't pinned to a variant;
when present, they're a snapshot too, same principle as
`productName`/`productSku`. `400` for an empty cart or a cart item whose
product (or selected variant) is no longer `ACTIVE`/in stock; `409` if
another request changed the relevant inventory row between the cart read
and the checkout transaction (the same optimistic-concurrency conflict
`PATCH /products/:id/inventory` or `.../variants/:variantId/inventory`
can return, now reachable from checkout too); `403` cancelling an order
that's no longer `PLACED`; `404` for a missing order, or one owned by a
different caller when the requester isn't staff.

`GET /api/v1/orders` accepts `page`/`pageSize` like any other list
endpoint, plus an admin-only `userId` (ignored for a non-staff caller —
their own id is always forced), and returns `PaginatedResult<Order>`,
newest first.

`PATCH /orders/:id/status` only accepts `"PAID"`, `"SHIPPED"`, or
`"DELIVERED"` as the target — `PLACED` is the automatic starting state and
isn't settable, and cancellation stays `PATCH /orders/:id/cancel`, not a
status update. Every transition must be the order's immediate next stage
(`PLACED`→`PAID`→`SHIPPED`→`DELIVERED`); skipping a stage, moving
backward, or updating a `CANCELLED`/already-`DELIVERED` order all return
`409`.
A status update that races another change to the same order (a concurrent
cancel, or another admin advancing it first) also returns `409` — refetch
the order and retry — rather than overwriting the newer status.

Every future entry in this table must trace back to an item in
`docs/requirements.md`. Do not add a row here to describe a hoped-for or assumed
endpoint — add it once the endpoint is actually implemented.
