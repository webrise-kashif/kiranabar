# CLAUDE.md

Guidance for Claude Code (and any other agent or human) working in this repository.

## What this is

Kiranabar, a production-ready ecommerce platform, built as a pnpm monorepo:

- **`apps/store`** — Customer Web Store (Vue 3 + Nuxt 4 + TypeScript, Composition API)
- **`apps/admin`** — Admin Portal (React 19 + Vite + TypeScript, functional components only)
- **`apps/api`** — Backend API (NestJS + TypeScript + Prisma + PostgreSQL, REST)
- **`packages/types`** — Shared, framework-independent TypeScript domain types
- **`packages/validation`** — Shared Zod schemas (request validation + form validation)
- **`packages/api-client`** — Shared, framework-independent HTTP client
- **`packages/config`** — Shared TypeScript/ESLint/Prettier/Vitest base configuration

A React Native mobile app for the customer store is planned. **Every backend and
contract decision must keep that client in mind even though it doesn't exist yet.**

See `docs/architecture.md` for the full architecture rationale, `docs/requirements.md`
for the current product scope, and `docs/api-contract.md` for API conventions.

## Non-negotiable architecture rules

1. **The backend is client-independent.** `apps/api` must never import Vue, React,
   React Native, or any UI framework, and must never contain UI-specific logic.
2. **One backend, three clients.** The Web Store, Admin Portal, and future React
   Native app all consume the same versioned REST API (`/api/v1/...`). Do not build
   parallel or admin-only APIs unless the actual authorization requirement (not the
   client) demands it — see rule 3.
3. **Authorization, not separate APIs, distinguishes Admin from Store.** The Admin
   Portal uses the same backend with different roles/permissions enforced by NestJS
   guards, not a separate service.
4. **Frontends never talk to PostgreSQL.** All data access goes through the REST
   API. `PrismaService` (`apps/api/src/prisma`) is the only code in the repo allowed
   to import `@prisma/client`.
5. **Business logic lives in the backend.** Frontends render and orchestrate calls;
   they do not re-implement backend rules.
6. **Shared packages are framework-independent.** Nothing under `packages/*` may
   import `vue`, `react`, `react-dom`, or React Native. `packages/api-client` is
   plain `fetch`; each app wraps it with its own composable/hook.
7. **No shared UI components.** Vue and React components are never shared between
   `apps/store` and `apps/admin` — only types, validation schemas, and API client
   logic are shared.
8. **Vue 3 Composition API only** (`<script setup>`), **React functional components
   only** — no class components, no Options API.
9. **TypeScript everywhere**, strict mode. Don't add a dependency to avoid writing a
   type.
10. Don't add a dependency unless it earns its place. Check what's already installed
    before reaching for a new package.

## Repository layout

```
apps/
  store/    # Nuxt 4 app, srcDir = app/
  admin/    # Vite + React app
  api/      # NestJS app
packages/
  types/         # domain types, response/pagination envelopes
  validation/    # Zod schemas shared by backend DTOs and frontend forms
  api-client/    # createApiClient() — framework-agnostic fetch wrapper
  config/        # tsconfig/eslint/prettier/vitest bases
docs/
  architecture.md
  requirements.md
  api-contract.md
docker-compose.yml   # local PostgreSQL for development
```

## Authentication architecture

**Implemented** — full design in `docs/authentication.md`.

- **Web Store & Admin Portal** (browser clients): JWT access tokens + opaque
  (random, DB-backed) refresh tokens, both in **httpOnly, secure cookies**.
  `useCredentials: true` on their `createApiClient()` instances reflects this.
- **Future React Native app** (non-browser client, not built yet): the same
  tokens delivered as a JSON payload (`X-Client-Platform: mobile` header),
  stored in secure device storage (Keychain/Keystore). `createApiClient()`'s
  `getAccessToken` option exists specifically for this.
- Both flows go through the same `AuthService`/`AuthController` and the same
  `User`/`RefreshToken` tables — only the token _transport_ differs per
  client type, decided by the `X-Client-Platform` request header.
- Refresh tokens rotate on every use; reuse of an already-rotated token is
  treated as theft and revokes every session the user has.
- Every route requires authentication by default (`JwtAuthGuard` is a
  global guard) — a new route must be explicitly marked `@Public()` to be
  open, not the other way around.

## Response & error contract

Already wired in `apps/api/src/main.ts` and `apps/api/src/common`:

- Every success response is wrapped as `{ data: T }` (`ResponseEnvelopeInterceptor`).
- Every error response is normalized to `{ error: { code, message, details? } }`
  (`HttpExceptionFilter`), regardless of whether it came from a Nest `HttpException`,
  a Zod validation failure, or an unexpected exception.
- `@kiranabar/types` defines `ApiResponse<T>` / `isApiErrorResponse` — the single
  source of truth for this shape on both backend and frontend.
- Validation is Zod-based end to end: `nestjs-zod`'s `ZodValidationPipe` is the
  global pipe; DTOs should be created with `createZodDto()` from schemas that live
  in (or are re-exported through) `packages/validation` so the same schema can
  validate a form on the frontend.

## Coding standards

- **TypeScript**: strict mode is on everywhere (`packages/config/tsconfig/*`).
  Don't disable strict flags locally to make an error go away — fix the type.
- **NestJS**: CommonJS + `experimentalDecorators`/`emitDecoratorMetadata`. One
  module per bounded concern (see `health/`, `prisma/` as the pattern). Global
  cross-cutting concerns (pipes, filters, interceptors) live in `src/common/`.
- **Nuxt**: `srcDir` is `app/` (Nuxt 4 default). Put HTTP calls behind a composable
  in `app/composables/`, never call `fetch`/`$fetch` directly from a component.
- **React (admin)**: functional components + hooks only. Co-locate a component's
  test as `Component.test.tsx` next to it.
- **Formatting**: Prettier via `packages/config/prettier.mjs` (root `.prettierrc.mjs`
  re-exports it). Run `pnpm format` before committing.
- **Linting**: ESLint flat config per app, composed from `packages/config/eslint/*`.
  The Nuxt app additionally uses `@nuxt/eslint`'s generated config (needed for
  Nuxt's auto-import globals) layered with the shared Prettier-compatibility rules.

## Testing requirements

Vitest everywhere, plus the library that fits each surface:

- **`packages/*`**: Vitest, `environment: node`. Every exported function/schema
  needs at least a happy-path and a rejection/edge-case test (see
  `packages/validation/src/pagination.test.ts` as the pattern).
- **`apps/api`**: two separate Vitest configs.
  - `pnpm --filter @kiranabar/api test` — unit tests (`**/*.spec.ts`), via
    `unplugin-swc` so NestJS decorator metadata works under Vitest.
  - `pnpm --filter @kiranabar/api test:e2e` — e2e tests (`test/**/*.e2e-spec.ts`)
    via `supertest`, bootstrapping the real `AppModule`. These require a reachable
    PostgreSQL (`docker compose up -d`) because bootstrapping connects
    `PrismaService` — though note the connection is lazy (via the driver adapter),
    so endpoints that never query the database will pass even without one.
    The database must also be migrated and **seeded**
    (`pnpm --filter @kiranabar/api prisma:seed`) — several specs log in as the
    seeded users (e.g. `admin@example.com`).
- **CI** (`.github/workflows/ci.yml`) runs on every push to `main` and every
  pull request: format check, lint, typecheck, unit tests, and build in one
  job; API e2e tests against a PostgreSQL service container (migrated and
  seeded) in another. Both must be green before merging.
- **`apps/admin`**: Vitest + `@testing-library/react` + `jsdom`. Query by role/text,
  not by test id, unless there's no accessible alternative.
- **`apps/store`**: Vitest with `@nuxt/test-utils`'s `nuxt` environment (needed for
  Nuxt auto-imports like `ref`/`useRuntimeConfig` inside components) and
  `mountSuspended` from `@nuxt/test-utils/runtime`.
- New business logic (once implemented) needs tests before it's considered done —
  don't add product/cart/checkout/order code without corresponding tests.

## Test-driven development (required)

This project is developed test-first. Every behavior change — feature, bug fix,
or contract change — follows red → green → refactor:

1. **Red.** Write the smallest test that describes the next piece of behavior,
   at the level where that behavior lives (see "Which test, where" below). Run
   it and **watch it fail for the expected reason** — an assertion about the
   missing behavior, not an import error or typo. A test that passes before
   the implementation exists isn't testing the change.
2. **Green.** Write the minimum production code that makes it pass. Don't add
   behavior no test asks for yet.
3. **Refactor.** With the suite green, clean up both production and test code.
   Re-run tests after every refactoring step.

Repeat in small increments: one behavior per cycle, not a whole feature's
tests up front.

**Bug fixes start with a reproducing test.** First write a test that fails
because of the bug, then fix the bug. The test stays in the suite as a
regression guard.

**Which test, where:**

| Behavior                                      | Test first in                                                     |
| --------------------------------------------- | ----------------------------------------------------------------- |
| Validation rule / shared schema               | `packages/validation/src/*.test.ts`                               |
| Client transport (headers, refresh, errors)   | `packages/api-client/src/*.test.ts`                               |
| Business rule (pricing, stock, status, auth)  | `apps/api/src/**/*.service.spec.ts` (Prisma mocked)               |
| HTTP contract (status code, envelope, guards) | `apps/api/test/*.e2e-spec.ts` (needs PostgreSQL)                  |
| Concurrency / transaction behavior            | `apps/api/test/*.e2e-spec.ts` — unit mocks can't show a real race |
| Admin UI behavior                             | `apps/admin/src/**/Component.test.tsx`, next to the component     |
| Store UI / composable behavior                | `apps/store/app/**/*.test.ts`                                     |

A new endpoint usually takes both: an e2e test for the contract (status codes,
`{ data }`/`{ error }` shape, `401`/`403`), then service specs driving out the
rules behind it.

**Rules:**

- Don't write production code without a failing test that requires it.
  Exceptions: pure config, type-only changes, docs, and mechanical renames
  already covered by the existing suite. Say so when you use one.
- Test behavior through public interfaces (service methods, HTTP endpoints,
  what a user sees and clicks), not private helpers or implementation details.
  Then a refactor never breaks a test.
- Never weaken, skip (`.skip`/`.only`), or delete a failing test to get to
  green. If a test is wrong, fix it in its own step and explain why.
- Keep the loop fast: use `pnpm --filter <pkg> test:watch` while working, and
  scope it to the file at hand (e.g. `... test:watch cart.service`).
- A change is done only when `pnpm test`, `pnpm typecheck`, and `pnpm lint`
  pass. When the change touches API behavior, the API e2e suite
  (`pnpm --filter @kiranabar/api test:e2e`) must pass too.
- When reporting work, state which tests were written first and confirm you
  saw them fail before the implementation.

## Development workflow

```bash
nvm use                          # Node version pinned in .nvmrc
pnpm install
cp apps/api/.env.example apps/api/.env
cp apps/store/.env.example apps/store/.env
cp apps/admin/.env.example apps/admin/.env
docker compose up -d             # PostgreSQL for apps/api
pnpm --filter @kiranabar/api prisma:generate
pnpm dev                         # all apps in parallel, via Turborepo
```

Common commands (run from the repo root; Turborepo fans them out and caches):

| Command           | What it does                                                      |
| ----------------- | ----------------------------------------------------------------- |
| `pnpm dev`        | Run store (`:3001`), admin (`:5173`), api (`:3000`) in watch mode |
| `pnpm build`      | Build every app/package (dependency-ordered)                      |
| `pnpm typecheck`  | `tsc --noEmit` / `nuxt typecheck` everywhere                      |
| `pnpm lint`       | ESLint everywhere                                                 |
| `pnpm test`       | Vitest unit tests everywhere                                      |
| `pnpm test:watch` | Vitest in watch mode everywhere (TDD loop; prefer `--filter`)     |
| `pnpm format`     | Prettier `--write .`                                              |

Scope any command to one package with `pnpm --filter <name> <script>`, e.g.
`pnpm --filter @kiranabar/api test:e2e`.

## What's deliberately not built yet

Authentication (registration, login, logout, refresh, roles — see
`docs/authentication.md`), the product catalog (categories, products,
images, inventory — full CRUD for `ADMIN`/`SUPER_ADMIN`, public role-aware
browsing for everyone else), cart (works with or without an account,
merges into the account on login — see `docs/architecture.md`'s "Cart:
identity, pricing, and merge on login"), customer-side checkout/orders
(cart → order, order history, cancel while `PLACED`), and admin order
management (view all orders or one customer's history, advance status
`PLACED`→`PAID`→`SHIPPED`→`DELIVERED` one stage at a time — see
`docs/architecture.md`'s "Orders: checkout, price snapshots, and the one
intentional exception" and its "Admin order management" subsection) are
implemented; see `docs/api-contract.md`'s "What exists today" for the full
endpoint list. Real payment integration (beyond a stub) and an
admin-initiated cancel/refund path are not. Product image **upload** isn't
either — `POST /products/:id/images` takes a URL, not a file. Do not add
business features without an explicit request — see `docs/requirements.md`
for the agreed MVP scope before starting any of it, and update that
document if scope changes.
