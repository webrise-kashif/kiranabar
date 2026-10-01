# Database — Initial Schema

This documents the schema introduced across five migrations:
`20260901121721_init_catalog_and_users`, `20260901130925_add_auth`,
`20260902084848_add_cart`, `20260902091544_add_orders`, and
`20260902172934_add_product_variants`
(`apps/api/prisma/schema.prisma`). It covers **users/roles/auth, the
product catalog (including optional product variants), cart, and orders**
— payment/shipment tables don't exist yet. See `docs/requirements.md` for
what's still to come,
`docs/architecture.md` for how this fits the backend's overall shape
(including how `ProductStatus`/`CategoryStatus` `ARCHIVED` and
`Inventory.version` are now actually used by real endpoints, in "Product
catalog: visibility and concurrency", how `Cart` resolves identity and
merges on login, in "Cart: identity, pricing, and merge on login", and how
checkout uses a single transaction across `Order`/`Inventory`/`Cart`, in
"Orders: checkout, price snapshots, and the one intentional exception"),
and `docs/authentication.md` for the auth design this schema supports.

## Entities

| Model            | Table              | Purpose                                                                       |
| ---------------- | ------------------ | ----------------------------------------------------------------------------- |
| `User`           | `users`            | An account with a single role and a hashed password.                          |
| `RefreshToken`   | `refresh_tokens`   | One row per issued refresh token (hash only, never the raw value).            |
| `Category`       | `categories`       | A catalog category, optionally nested under a parent.                         |
| `Product`        | `products`         | A sellable item's structural/catalog data, and its own price/sku/stock.       |
| `ProductVariant` | `product_variants` | Optional, additive: one specific variant (color/size/...) of a product.       |
| `ProductImage`   | `product_images`   | An ordered image reference (URL only) for a product or one of its variants.   |
| `Inventory`      | `inventories`      | Stock counts for a product _or_ a variant, kept separate from either.         |
| `Cart`           | `carts`            | One cart per identity -- a `User` or an anonymous guest, never both.          |
| `CartItem`       | `cart_items`       | A product (+ optional variant) and quantity in a cart. No price -- see below. |
| `Order`          | `orders`           | A placed order: status, subtotal, and a snapshotted shipping address.         |
| `OrderItem`      | `order_items`      | A line item with its price/name/SKU (+ optional variant) frozen at checkout.  |

Four enums back these: `Role` (`CUSTOMER` / `ADMIN` / `SUPER_ADMIN`),
`ProductStatus`, `CategoryStatus` (both `DRAFT` / `ACTIVE` / `ARCHIVED`),
and `OrderStatus` (`PLACED` / `PAID` / `SHIPPED` / `DELIVERED` /
`CANCELLED`). `ProductVariant` reuses `ProductStatus` rather than
introducing a fifth enum — see "Product variants" below.

## Relationships

```
User ──┬── 1:N ── RefreshToken (owned child -- deleted with the user)
       ├── 1:1 ── Cart (optional -- only once the user has added something)
       └── 1:N ── Order (RESTRICT -- a financial record outlives account deletion attempts)

Category ──┬── parent/children (self, optional, one level or deeper)
           └── 1:N ── Product (optional -- a product may have no category)

Product ──┬── 1:N ── ProductImage  (general gallery -- required child, deleted with the product)
          ├── 1:1 ── Inventory     (the product's own stock -- required child)
          ├── 1:N ── CartItem      (a product can be in many carts)
          ├── 1:N ── OrderItem     (RESTRICT -- a past order line must keep resolving)
          └── 1:N ── ProductVariant (optional, additive -- deleted with the product)
                       ├── 1:N ── ProductImage (variant-specific photos)
                       ├── 1:1 ── Inventory    (the variant's own stock, independent of the product's)
                       ├── 1:N ── CartItem     (a cart line pinned to this variant)
                       └── 1:N ── OrderItem    (RESTRICT -- same reasoning as Product's)

Cart ── 1:N ── CartItem (owned child -- deleted with the cart)

Order ── 1:N ── OrderItem (owned child -- deleted with the order)
```

## Decisions

### Users & roles

`User` now carries `passwordHash` (added by AuthModule — see
`docs/authentication.md`), alongside `id`, `email` (unique), `role`, and
timestamps. Still no profile fields (name, address, etc.) — those belong to
whichever feature first needs them, not guessed at now.

**Role is a Prisma enum on `User`, not a separate `Role` table.** The role
set is small, fixed, and every user has exactly one role — a join table
would add a layer of indirection (and two more indexes/FKs) for no present
benefit. This is the one decision in this schema worth a second look before
committing to it long-term:

- **If/when authorization needs to expand** beyond three fixed roles (e.g.
  per-resource permissions, multiple roles per user, admin-defined roles),
  the migration path is: add a `Permission` model and a `RolePermission` (or
  `UserPermission`) join table, keep the `Role` enum as a coarse default/
  fallback, and layer fine-grained checks on top. This does **not** require
  removing or renaming the existing `role` column — it's additive.
- Until that's needed, guards check `user.role` directly.

### RefreshToken

One row per issued refresh token, `onDelete: Cascade` from `User` (a
refresh token has no meaning without its user — deleting an account should
clean these up, not orphan them).

- **Only a SHA-256 hash of the token is stored** (`tokenHash`, unique-
  indexed), never the raw value — a database read alone can't produce a
  usable session credential. See `docs/authentication.md`'s "Token/session
  strategy" for why SHA-256 (fast hash) is the right tool here and Argon2id
  (deliberately slow) is not.
- **`expiresAt`** is stored explicitly (not derived at query time) so an
  expired-but-not-yet-revoked token can be distinguished from a fully
  invalid one, and so a future cleanup job has a column to query on
  (indexed for that reason).
- **`revokedAt`** (nullable) is the revocation flag — set on rotation,
  logout, or reuse-detection. A `NULL` value means "still valid" (subject
  to `expiresAt`).
- **No `replacedByTokenId` chain-linking column.** The simpler design —
  revoke _every_ refresh token for a user when a revoked one is reused,
  rather than walking/revoking just one rotation chain — achieves full
  reuse protection without an extra self-referential column. See
  `docs/authentication.md` for the full rotation/reuse-detection flow this
  table supports.
- Indexed on `userId` (revoke-all-for-user queries) and `expiresAt`
  (a future cleanup job for expired rows).

### Categories

Self-referential one level or deeper via a nullable `parentId` pointing at
`Category.id`, plus a `children` back-relation. This supports arbitrary
depth (not just two levels) with a single extra column — no separate
closure table or materialized path, which would be over-engineering for a
catalog that doesn't have a confirmed depth requirement.

- **Fetching a subtree** beyond one level needs either nested Prisma
  `include`s (fine for a known, shallow depth) or a raw recursive CTE for
  arbitrary depth — Prisma doesn't traverse recursive relations natively.
  Not needed today; noted here so it isn't rediscovered from scratch later.
- **Deleting a category with children is `RESTRICT`, not cascade or
  set-null.** Cascading would silently delete an entire subtree along with
  every product in it — too destructive for an admin action. Silently
  promoting children to root (`SET NULL`) hides a structural change that an
  admin should make explicitly. Restrict forces an explicit re-parent or
  child-deletion first. Verified live: attempting to delete a parent with a
  child fails with a foreign key violation.

### Products

- **`price`/`salePrice` are `Decimal(12, 2)`, never `Float`.** Floating-point
  binary representation can't represent most decimal currency values
  exactly (e.g. `0.1 + 0.2 !== 0.3`), which is unacceptable for money.
  `Decimal(12, 2)` gives room up to 9,999,999,999.99 in whichever currency
  is set.
- **`currency` is a 3-character string (ISO 4217), not an enum.** An enum
  would need a migration every time a new currency is supported; a plain
  column doesn't. No currency-specific decimal-place handling (e.g. 0 for
  JPY, 3 for KWD) is implemented — `Decimal(12, 2)` is a fixed-precision
  simplification, flagged here for whoever adds multi-currency support.
- **`sku` and `slug` are both globally unique**, enforced at the database
  level (verified live: a duplicate SKU insert is rejected). `slug` is the
  public URL identifier; `sku` is the operational/inventory identifier —
  they're allowed to diverge.
- **`categoryId` is optional, `SET NULL` on category deletion.** A product
  should never be silently deleted because its category was removed
  (ruling out cascade), and an admin shouldn't be blocked from deleting a
  category just because products still reference it (ruling out restrict,
  which is used for the category _hierarchy_ but would be too strict here).
  A product left with `categoryId: null` is a recoverable, visible state —
  verified live.
- **One category per product (many-to-one), not many-to-many.** Nothing in
  the current requirements calls for a product in multiple categories; this
  can become a join table later without touching any other model.
- **Variants (size/color) are implemented, additively** — see "Product
  variants" below.

#### Future order history and price snapshots

`Product.price`/`salePrice` are the _current_ list price. They are **not**
a safe source for a historical order line's price — a customer's receipt
must reflect what they paid, not what the product costs today. This schema
takes no dependency that would make that mistake easy: `Product` has no
"current order price" concept, and when `Order`/`OrderItem` are designed,
each line item must store its own `unitPrice`/`currency` snapshot captured
at checkout time, independent of `Product.price`. This also means deleting
or repricing a product must never be blocked by past orders referencing it
by snapshot value — only a live FK to the product row itself would need
that consideration, and even then a soft-delete/archive (via
`ProductStatus.ARCHIVED`) is preferable to a hard delete once a product has
order history, so the FK still resolves. **This is no longer just planned:**
`DELETE /api/v1/products/:id` already archives rather than removing the
row — see `docs/architecture.md`'s "Product catalog: visibility and
concurrency".

#### Product variants

Implemented as an **additive, optional** sub-resource of `Product` —
**not** the repoint this section used to sketch (`Product` losing its own
`sku`/`price`/`Inventory` to `ProductVariant`). That repoint would have
been a breaking change to `Product`'s existing API contract (removing
fields every existing client already depends on — see
`docs/api-contract.md`'s versioning rule: a breaking change needs a `v2`)
and would have required backfilling a "default variant" for every existing
product. Instead:

```
Product (id, name, slug, description, categoryId, status, sku, price,
          salePrice, currency, ... — completely unchanged)
  ├── Inventory (its own row, unchanged)
  └── ProductVariant[] (optional, 0..N)
        id, productId, sku, price, salePrice, currency,
        attributes (JSON, e.g. {"color":"Red","size":"M"}), status
        ├── Inventory (its own row, independent of the product's)
        └── ProductImage[] (variant-specific photos)
```

- **`attributes` is plain `Json`, not a `ProductVariantOption` table** —
  the other shape this section used to offer as an alternative. Chosen per
  YAGNI: nothing needs to query/filter by individual attribute value at the
  database level yet, and this matches the schema's existing preference for
  plain columns over speculative structure (e.g. `Product.description`).
  Validated by `productVariantAttributesSchema` (`packages/validation`) at
  the application layer, not the database.
- **`sku`/`price`/`salePrice`/`currency` are fully independent per
  variant** — no inheritance/fallback from the product. A variant is priced
  and stocked entirely on its own.
- **`ProductVariant.product → Product` is `CASCADE`.** Safe because a
  `Product` can only ever be hard-deleted once `ARCHIVED` and free of order
  history — and order history is already fully guarded by
  `OrderItem.productId`'s `RESTRICT` regardless of whether a given
  `OrderItem` also has a `variantId` (see "Order & OrderItem" below).
- **`Inventory` gains a nullable `variantId` alongside its now-nullable
  `productId`** — exactly one of the two is ever set, the same
  mutually-exclusive-nullable-column pattern already used by
  `Cart.userId`/`Cart.guestToken` (see "Cart & CartItem" below),
  application-layer enforced, not a database constraint. This is a
  different shape from `CartItem`/`OrderItem`/`ProductImage`'s
  `variantId`, which is an optional _narrowing_ of an always-set
  `productId`, not an alternative to it — see each section below.

### Product images

- **URL only — no binary data in Postgres.** `url` is expected to point at
  external object storage/CDN (see `AppConfigService.storage` placeholders
  in `docs/architecture.md`); the database never stores image bytes.
- **`position`** (integer, ascending) orders a product's gallery.
- **`isPrimary`** flags the lead image. Still **not** enforced at the
  database level as "exactly one true per product" — Postgres partial
  unique indexes could do this, but that's more mechanism than this stage
  needs. `ProductsService` enforces it instead: adding or updating an image
  with `isPrimary: true` demotes whichever image previously held it, in the
  same request. If a product is created with multiple images and none (or
  more than one) is marked primary, the first image becomes primary by
  default — see `apps/api/src/products/products.service.ts`'s
  `normalizeInitialImages`.
- **Cascade-deletes with its `Product`** — an image has no meaning without
  its product. Verified live.
- **Optional `variantId`, narrowing (not replacing) the always-set
  `productId`.** Unset for the product's general gallery; set for a
  variant-specific photo, which cascade-deletes with that `ProductVariant`
  without touching the product's own images. See "Product variants" above.

### Inventory

Kept as its own model (per the requirement), not columns on `Product`, so
it can evolve independently. Now genuinely independent of `Product` too:
`productId` and `variantId` are both nullable and both `@unique`, exactly
one set per row — the product's own inventory is unaffected by any of its
variants having their own. See "Product variants" above for the full
mutually-exclusive-column reasoning.

- **`quantityAvailable`** — units immediately purchasable.
- **`quantityReserved`** — units held against an in-progress
  checkout/cart but not yet confirmed as sold. Total physical stock is
  `quantityAvailable + quantityReserved` (not stored as a separate column —
  computing it is trivial and storing it would just be another place for it
  to drift out of sync).
- **`version`** — an optimistic-concurrency counter, incremented on every
  update. This is the field most directly aimed at "maintaining inventory
  safely during checkout": two concurrent checkouts reading the same
  `quantityAvailable` and both deciding to reserve stock is exactly how
  overselling happens under naive `UPDATE ... SET quantity = quantity - 1`.
  `InventoryService.adjust()` now implements the intended pattern —
  `UPDATE inventories SET quantity_available = ..., version = version + 1
WHERE product_id = ? AND version = ?` (`apps/api/src/inventory/inventory.service.ts`)
  — via `PATCH /api/v1/products/:id/inventory`: a mismatched `version`
  updates zero rows, which the service turns into a `409`, and the caller
  refetches and retries against the current state instead of silently
  overselling. Checkout itself isn't built yet, but the safe-update
  mechanism it will rely on is now exercised end-to-end (see
  `docs/api-contract.md`'s "Inventory" section and
  `apps/api/test/products.e2e-spec.ts`).
- **No `>= 0` check constraint on the quantity columns.** Prisma's schema
  language doesn't declare Postgres `CHECK` constraints without a preview
  feature; adding one isn't worth that trade-off yet. It's an
  application-layer invariant for now — flagged here so it isn't forgotten,
  and addable later via a hand-edited migration
  (`ALTER TABLE inventories ADD CONSTRAINT ... CHECK (quantity_available >= 0)`)
  without a schema-language change.
- **1:1 with `Product` _or_ 1:1 with `ProductVariant`** — never both, per
  the mutually-exclusive `productId`/`variantId` columns described in
  "Product variants" above.

### Cart & CartItem

- **`Cart.userId` and `Cart.guestToken` are both nullable, both unique;
  exactly one is set per row.** Not enforced by the database (Prisma has no
  clean cross-column "exactly one of" constraint any more than it has
  `CHECK`) — `CartService` is the only code that ever writes a `Cart` row,
  and it always sets exactly one. Multiple rows with `userId: NULL` don't
  violate the unique index (Postgres doesn't treat `NULL`s as equal for
  uniqueness), which is exactly what allows many simultaneous guest carts.
- **`onDelete: Cascade` from `User`.** Unlike a `RefreshToken` or an
  `Order` would be, a cart has no standalone value once its owner's account
  is gone — deleting the user should delete their cart, not orphan it.
- **`CartItem` stores no price.** Deliberately different from how a future
  `Order`/`OrderItem` must behave (`docs/database.md`'s "Future order
  history and price snapshots" above): a cart is meant to reflect the
  product's _current_ price, computed at read time from `Product.price`/
  `salePrice`, not a point-in-time snapshot. Only a placed order freezes
  price.
- **`onDelete: Cascade` from `Product`.** If a product row is ever truly
  removed (not the normal `ARCHIVED` soft delete — see "Products" above),
  any cart line referencing it goes too rather than becoming a dangling
  reference. A cart item is an ephemeral, easily-recreated record, unlike
  an order line.
- **Optional `variantId`, narrowing (not replacing) the always-set
  `productId`** — a line either represents the plain product or one
  specific variant of it; `onDelete: Cascade` from `ProductVariant`, same
  reasoning as `Product`'s. See "Product variants" above.
- **`@@unique([cartId, productId, variantId])`** — one line per
  (product, variant) pair per cart. This only fully dedups the
  variant-specific case at the database level: Postgres never treats `NULL`
  as equal to `NULL`, even within a multi-column unique index, so it can't
  enforce "one no-variant line" the way the old 2-column
  `@@unique([cartId, productId])` could. `CartService.addItem` closes this
  at the application layer instead, folding a lost `P2002` race (which,
  for a variant-specific line, _does_ still fire) into the winning row —
  see `CartService.upsertItemQuantity`. An accepted trade-off, same
  category as `Cart.userId`/`guestToken`'s app-layer-only exclusivity
  above, not one that warrants a hand-written partial-index migration.

### Order & OrderItem

This is the schema the "Future order history and price snapshots" section
above was written in anticipation of — it's now real.

- **`Order.userId → User` is `RESTRICT`, not `CASCADE`.** Unlike a
  `RefreshToken` or a `Cart`, an order is a financial record: deleting a
  user account must never silently delete their purchase history. This
  schema has no account-deletion feature yet (deliberately, per
  `docs/authentication.md`'s "Deliberately out of scope"), but the FK
  behavior is chosen now so that if one is added later, it's forced to
  handle "this user has orders" explicitly (anonymize, block, or archive)
  rather than cascading by accident.
- **`OrderItem.productId → Product` is `RESTRICT`, for the same reason**:
  a receipt must keep resolving even after a product is removed from sale.
  In practice a product is essentially never hard-deleted (see "Products"
  above — `DELETE /products/:id` archives, it doesn't remove the row), so
  this constraint is mostly a safety net, verified live in
  `apps/api/test/orders.e2e-spec.ts` (`prisma.product.delete` on a product
  referenced by an order fails with a foreign key violation, exactly like
  the category-hierarchy `RESTRICT` case above).
- **Optional `variantId → ProductVariant`, also `RESTRICT`, same
  reasoning** — a receipt for a variant purchase must keep resolving even
  after that variant is archived/hard-deleted. `productId` stays set
  regardless of whether `variantId` is (see "Product variants" above), so
  a product's own `RESTRICT` always applies too. Accompanied by
  `variantSku`/`variantAttributes` snapshot columns, the same "never
  rewrite a past receipt" principle as `productName`/`productSku`/
  `unitPrice` below, only populated when `variantId` is set.
- **`OrderItem.orderId → Order` is `CASCADE`.** An order line has no
  meaning without its order — deleting an order (not currently exposed by
  any endpoint; this is a schema-level guarantee, not a feature) should
  take its lines with it, unlike the product it references.
- **Every price field on `OrderItem`/`Order` is a snapshot, not a live
  reference.** `productName`, `productSku`, and `unitPrice` are copied onto
  `OrderItem` at checkout time; `Order.subtotal` is the sum of those
  snapshotted line totals. None of these are recomputed from `Product` on
  read — a later price change, rename, or re-SKU on the product must never
  alter a past receipt. This is the opposite of `CartItem`, which
  deliberately stores no price (see "Cart & CartItem" above) because a cart
  is supposed to track current pricing.
- **`Order.subtotal`/`OrderItem.unitPrice`/`OrderItem.lineTotal` are
  `Decimal(12, 2)`**, same reasoning as `Product.price` above. `currency`
  is copied from the cart at checkout time (itself derived from the
  product), not re-derived per line — this schema doesn't yet support
  mixed-currency carts, which is consistent with `Product.currency` being a
  single column today.
- **The shipping address is denormalized directly onto `Order`** (
  `shippingRecipientName`, `shippingLine1`, `shippingLine2`,
  `shippingCity`, `shippingState`, `shippingPostalCode`,
  `shippingCountry`, `shippingPhone`) rather than a separate `Address`
  model with a foreign key. Two reasons: an order's shipping address must
  be a point-in-time snapshot (the same "never let it change after the
  fact" requirement as price), and there's no requirement yet for a user to
  have saved/reusable addresses — introducing an `Address` model now would
  be speculating about a feature (address book) that hasn't been asked
  for. If saved addresses are added later, `Address` becomes its own model
  with its own FK to `User`, and checkout would still copy the chosen
  address's fields onto the new `Order` row rather than referencing the
  `Address` row live, for the same snapshot reason.
- **No guest checkout — `Order.userId` is required, not nullable.**
  Unlike `Cart`, which supports an anonymous `guestToken` identity, placing
  an order requires an account (a product decision, not a technical one —
  see `docs/requirements.md`). This is why `Order` has no `guestToken`
  column the way `Cart` does.
- **`status: OrderStatus`, defaulting to `PLACED`.** The five-state flow
  (`PLACED → PAID → SHIPPED → DELIVERED`, with `CANCELLED` reachable only
  from `PLACED`) is enforced in `OrdersService`, not by a database check
  constraint or a state-machine library — the same "application-layer
  invariant, flagged here" approach as `Inventory`'s quantity columns
  above. `PATCH /api/v1/orders/:id/cancel` (customer-initiated, only while
  still `PLACED`) reaches `CANCELLED`; `PATCH /api/v1/orders/:id/status`
  (admin-only) advances `PLACED → PAID → SHIPPED → DELIVERED`, one stage at
  a time — `OrdersService` keeps a small next-status map and rejects
  skipping a stage, moving backward, or updating a terminal (`CANCELLED`/
  `DELIVERED`) order with `409`. See `docs/architecture.md`'s "Admin order
  management" for the full design. Payment integration itself is still
  stubbed pending a provider decision — `PATCH .../status` records that a
  payment happened, it doesn't process one.
- **Indexed on `userId`** (every list/detail query is scoped to "this
  caller's own orders", or filtered to one customer by an admin) **and
  `status`** (an admin order-management view filtering/queuing by status).

#### Checkout's inventory interaction

Checkout doesn't add a new inventory mechanism — it reuses
`Inventory.version` exactly as designed in "Inventory" above:
`OrdersService.checkout()` decrements `quantityAvailable` with the same
`WHERE product_id = ? AND version = ?` guarded update `InventoryService.adjust()`
uses, inside the same database transaction as the `Order`/`OrderItem`
creation and the cart clear (see `docs/architecture.md`'s "Orders: checkout,
price snapshots, and the one intentional exception" for why that needs to
be one transaction). A stale version aborts the whole transaction with
`409`, the same as a standalone inventory adjustment would.

Cancelling a `PLACED` order **restores** the decremented stock
(`quantityAvailable` incremented back), but deliberately without the same
version guard — an increment is commutative and safe to apply regardless
of what else has happened to the row in the meantime, unlike a decrement,
which is exactly the case optimistic concurrency exists to protect.

## Conventions applied throughout

- **Primary keys**: `String @id @default(uuid(7))` on every model. UUIDv7 is
  time-ordered (unlike v4), so inserts stay index-friendly while still
  avoiding sequential/guessable IDs in a public-facing API.
- **Table/column naming**: `@@map`/`@map` to `snake_case` (e.g. `users`,
  `category_id`, `is_primary`) — the Postgres-conventional naming, so raw
  SQL and any non-Prisma tooling reads naturally.
- **Timestamps**: every model has `createdAt`/`updatedAt`
  (`@default(now())` / `@updatedAt`), mapped to `created_at`/`updated_at`.
- **Indexes**: added on every foreign key (`categoryId`, `parentId`,
  `productId`) and every filterable enum column (`role`, `status`) —
  exactly the columns a list/filter endpoint will query on, nothing
  speculative beyond that.
- **onDelete behavior** — summarized:

  | Relation                                | Behavior   | Why                                                                       |
  | --------------------------------------- | ---------- | ------------------------------------------------------------------------- |
  | `Category.parent → Category`            | `RESTRICT` | Never silently orphan or cascade-delete a subtree                         |
  | `Product.category → Category`           | `SET NULL` | Deleting a category shouldn't delete or block-delete its products         |
  | `ProductImage.product → Product`        | `CASCADE`  | An image has no meaning without its product                               |
  | `ProductImage.variant → ProductVariant` | `CASCADE`  | A variant-specific image has no meaning without that variant              |
  | `Inventory.product → Product`           | `CASCADE`  | Inventory has no meaning without its product                              |
  | `Inventory.variant → ProductVariant`    | `CASCADE`  | Inventory has no meaning without its variant                              |
  | `ProductVariant.product → Product`      | `CASCADE`  | Safe: a product can only hard-delete once ARCHIVED and order-history-free |
  | `CartItem.variant → ProductVariant`     | `CASCADE`  | A cart line is ephemeral, same reasoning as `CartItem.product`            |
  | `Order.user → User`                     | `RESTRICT` | A financial record must never be silently deleted with the account        |
  | `OrderItem.order → Order`               | `CASCADE`  | An order line has no meaning without its order                            |
  | `OrderItem.product → Product`           | `RESTRICT` | A past receipt must keep resolving even if the product is removed         |
  | `OrderItem.variant → ProductVariant`    | `RESTRICT` | Same: a past receipt must keep resolving even if the variant is removed   |

## Migration & seed status

- Five migrations, all applied against a real local PostgreSQL 16 instance
  in this environment: `20260901121721_init_catalog_and_users` (catalog +
  bare `User`), `20260901130925_add_auth` (`User.passwordHash` +
  `RefreshToken`), `20260902084848_add_cart` (`Cart` + `CartItem`),
  `20260902091544_add_orders` (`Order` + `OrderItem`), and
  `20260902172934_add_product_variants` (`ProductVariant`, the nullable
  `Inventory.productId`/new `Inventory.variantId`, and the narrowing
  `variantId` columns on `CartItem`/`OrderItem`/`ProductImage` — entirely
  additive, no data backfill needed since no variants existed yet). Every
  constraint documented above — `RESTRICT`, `SET NULL`, `CASCADE`, unique
  `sku`/`slug`/`tokenHash`/`userId`/`guestToken`, the full registration/
  login/refresh-rotation/reuse-detection/authorization flow, the guest-
  cart/merge-on-login flow, the transactional checkout/cancel flow
  (including the `Order`/`OrderItem` `RESTRICT` FKs), and the variant
  cascade/restrict behavior above — was exercised directly against the
  live database via
  `apps/api/test/{auth,cart,orders,products,prisma-schema}.e2e-spec.ts`,
  not just validated statically.
- `prisma/seed.ts` creates one `User` per role (now with a hashed dev-only
  placeholder password — see the script for the value, never a real
  credential), a parent/child `Category` pair, and one `Product` with two
  `ProductImage`s and an `Inventory` row. It's idempotent (`upsert`, not
  `insert`) so it's safe to re-run. In Prisma 7, seeding is
  **explicit-only** (`prisma db seed`, wired here as
  `pnpm --filter @kiranabar/api prisma:seed`) — it's no longer triggered
  automatically by `migrate dev`/`migrate reset`.

## Explicitly not in this schema yet

- `Payment`, `Shipment` models, and a standalone `Address` model (saved/
  reusable addresses) — see `docs/requirements.md` (`Cart`/`CartItem` and
  `Order`/`OrderItem` are both implemented; see "Cart & CartItem" and
  "Order & OrderItem" above).
- An admin-initiated cancel/refund path (e.g. cancelling a `PAID` order) —
  cancellation stays customer-only and `PLACED`-only; see
  `docs/architecture.md`'s "Admin order management."
- A `CHECK` constraint on `Inventory`'s quantity columns.
- Many-to-many `Product`↔`Category`.
- Any further auth surface beyond `passwordHash`/`RefreshToken` — no
  password-reset tokens, email-verification tokens, or 2FA secrets; see
  `docs/authentication.md`'s "Deliberately out of scope."
