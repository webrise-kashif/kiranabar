# Authentication

This documents the authentication system implemented in `apps/api/src/auth`
and `apps/api/src/users`. It covers registration, login, logout, the current
authenticated user, refresh, and role-based authorization — the scope
defined in `docs/requirements.md`. Password reset, email verification, 2FA,
OAuth/social login, and account deletion are explicitly **not** implemented;
see "Deliberately out of scope" below.

## Goals

The same goals as the rest of the API (`docs/architecture.md`), applied to
auth specifically:

1. **One auth system, not one per client.** A single set of endpoints, one
   token format, one user/session model. What differs between Web Store,
   Admin Portal, and the future React Native app is only how the token
   _travels_ — never the underlying logic.
2. **The backend is the only place authorization is enforced.** Every
   protected route is gated by a real guard, not by a frontend route
   deciding not to render a link. A request with no/invalid/wrong-role
   credentials is rejected by the API regardless of what any client does.
3. **No invented security theater.** Every mechanism below is used because
   it closes a specific, real gap — not adopted by default. Where a
   mechanism was deliberately _not_ added (CSRF tokens, rate limiting), the
   reasoning is written down, not silently skipped.

## Password hashing

**Argon2id** (the `argon2` npm package, native bindings), explicitly
configured with `type: argon2id` — the package's own default is `argon2i`,
so this is a deliberate choice, not the out-of-the-box behavior. Argon2id is
OWASP's current recommendation: resistant to both GPU-parallel attacks
(unlike bcrypt) and side-channel/tradeoff attacks (unlike pure argon2i or
argon2d). Verification (`PasswordService.verify`) uses the library's
constant-time comparison internally — never a manual `===` on hashes.

Passwords are validated for **length only** (8–128 characters,
`packages/validation/src/auth.ts`), not composition rules (no forced
uppercase/number/symbol). This follows current NIST 800-63B guidance:
composition rules mostly push users toward predictable substitutions
(`Password1!`) without meaningfully increasing entropy, while length is the
strongest lever available. The 128 cap exists to bound hashing cost on a
deliberately long input, not as a security control.

## Token/session strategy

Two different mechanisms, chosen for two different jobs:

|                          | Access token                          | Refresh token                                |
| ------------------------ | ------------------------------------- | -------------------------------------------- |
| Format                   | JWT (HS256)                           | Opaque random value (32 bytes)               |
| Lifetime                 | `AUTH_JWT_ACCESS_TTL` (default `15m`) | `AUTH_JWT_REFRESH_TTL` (default `30d`)       |
| Verified by              | Signature + expiry (stateless)        | Database lookup by hash                      |
| Revocable before expiry? | No                                    | Yes                                          |
| Stored server-side?      | No                                    | Only a SHA-256 hash (`refresh_tokens` table) |

**Why not one JWT for both:** a self-verifying JWT can't be un-issued short
of maintaining a blocklist — which is just a database-backed revocation
list by another name, so the refresh token might as well _be_ one directly,
without also paying for JWT's signature/parsing overhead on something
that's checked against the database on every use anyway.

**Why SHA-256 and not Argon2id for the refresh token:** Argon2's
deliberate slowness defends against brute-forcing a _low-entropy,
human-chosen_ secret (a password). A refresh token is already a
high-entropy 256-bit random value — nothing to brute-force — so a fast
cryptographic hash is the correct tool; using Argon2id here would just add
latency to every refresh request for no security benefit.

### Rotation and reuse detection

Every successful `/auth/refresh` call **rotates** the token: the presented
refresh token is revoked and a new one is issued in the same operation.
Reuse of an already-revoked token is treated as evidence of theft or replay
— the response is to revoke **every** refresh token the user has, not just
reject that one request, forcing re-authentication on every device/session.
This is deliberately the more aggressive of the two common responses (revoke
one chain vs. revoke everything); it was chosen because it needs no extra
schema (no parent/child chain-linking column, just `revokedAt`) while still
fully closing the reuse window — see `docs/database.md`'s `RefreshToken`
section for the schema.

```
Login/Register → refresh_token A issued (stored as hash(A))
  ↓
Client calls /auth/refresh with A
  → A is revoked, refresh_token B issued
  ↓
Client calls /auth/refresh with B → rotates to C. Normal operation.

  ── OR, if A leaks and an attacker replays it ──

Attacker calls /auth/refresh with A (already revoked)
  → reuse detected → every refresh token for this user is revoked
  → the legitimate holder of B is also logged out on next refresh
  → both parties must log in again; only the real credential holder can
```

**Concurrent use of the same token** is resolved in the database, not by
the initial read: the rotation claims the token with a conditional update
(`revokedAt IS NULL`) and issues its replacement **in one transaction**.
Of several concurrent refreshes presenting the same token, exactly one
wins. Each loser waits on the row lock until the winner commits, matches
no row, and is treated as **reuse**: `401`, and every token the user has
is revoked, including the winner's just-issued replacement. This is
deliberately the same strict response as a reuse that arrives a moment
later; it means a client that fires two refreshes at the same instant
(e.g. two browser tabs) will be logged out everywhere. Without the guard,
N concurrent refreshes turned one token into N valid sessions.

### Transport, per client

Decided by an `X-Client-Platform: web | mobile` request header, defaulting
to `web` (the safer behavior) for any missing/unrecognized value:

- **Web** (Web Store, Admin Portal): both tokens are set as `httpOnly`,
  `Secure` (in production; omitted so `http://localhost` works in dev),
  `SameSite=Lax` cookies. **Never included in the JSON response body** — if
  they were, `httpOnly` would buy nothing against an XSS payload that just
  reads the response instead of `document.cookie`.
  - The access-token cookie is scoped `path: "/"` (needed on every request).
  - The refresh-token cookie is scoped `path: "/api/v1/auth"` — it's only
    ever read by `/refresh` and `/logout`, so narrowing its path reduces
    which requests carry it at all.
- **Mobile** (future React Native app): no cookie jar exists in that
  runtime, so both tokens are returned once in the JSON response body, for
  the app to store in the platform's secure storage (Keychain on iOS,
  Keystore on Android — e.g. via `expo-secure-store`). **Never** in
  `AsyncStorage`/`localStorage`-equivalent, which is plain, unencrypted,
  JS-readable storage. This is the standard pattern for native apps (how
  Auth0/Firebase/Supabase's mobile SDKs work) — not an exception carved out
  of "don't expose refresh credentials," which is about _unintended_
  exposure (e.g. `GET /me` never returns a token to any client).

Cookies are set for both platforms unconditionally (harmless for mobile,
which has no jar to store them in); only the _body_ shape differs.

### GET /auth/me and role freshness

`JwtStrategy.validate()` re-fetches the user by id from the database on
**every** authenticated request, rather than trusting the role embedded in
the JWT payload. This costs one indexed primary-key lookup per request; in
exchange, a role change (e.g. a `SUPER_ADMIN` demoting an `ADMIN`) takes
effect on the very next request instead of waiting out the access token's
TTL. This is a deliberate trade-off, not a free choice — the alternative
(trust the JWT claims, zero DB hits) is a legitimate design too, and worth
revisiting if this ever becomes a real load concern.

## Logout / revocation

`POST /auth/logout` is deliberately **not** behind `JwtAuthGuard` — "log me
out" must succeed even if the access token has already expired, since only
the refresh token identifies which session to revoke. It's idempotent: it
always returns `{ success: true }` and clears both cookies, even if there
was no valid session to revoke (e.g. calling it twice, or with an already-
expired session).

## Role-based authorization

Reusable, NestJS-conventional building blocks in `apps/api/src/auth`:

- **`JwtAuthGuard`** (`guards/jwt-auth.guard.ts`) — registered **globally**
  (`APP_GUARD` in `AuthModule`). Every route requires authentication unless
  explicitly marked `@Public()`. This is fail-closed by design: forgetting
  to protect a new route is not a way to accidentally expose it, at the
  cost of needing an explicit `@Public()` tag on the handful of routes that
  should be open (`/health`, `/auth/register`, `/auth/login`,
  `/auth/refresh`, `/auth/logout`).
- **`RolesGuard`** (`guards/roles.guard.ts`) — also global, a no-op unless
  the route carries `@Roles(...)`. Runs after `JwtAuthGuard` (order matters:
  it reads `request.user`, which `JwtAuthGuard` populates).
- **`@Public()`** — opts a route out of `JwtAuthGuard`.
- **`@Roles("ADMIN", "SUPER_ADMIN")`** — requires the caller's role to be
  one of the listed roles.
- **`@CurrentUser()`** — injects the authenticated `PublicUser` into a
  handler parameter.

Demonstrated end-to-end on two real endpoints in `UsersModule` (not
throwaway examples — genuine account-administration groundwork):

- `GET /api/v1/users` — paginated user list, `@Roles("ADMIN", "SUPER_ADMIN")`.
- `PATCH /api/v1/users/:id/role` — change a user's role, `@Roles("SUPER_ADMIN")`
  only (an elevated action: only a super admin may grant admin/super-admin
  access).

Every layer is enforced server-side; nothing above depends on a frontend
hiding a button or route.

## Security considerations

- **No plaintext passwords, ever** — hashed with Argon2id before the first
  write; the plaintext is never logged or stored.
- **No raw refresh tokens stored** — only a SHA-256 hash, so a database leak
  doesn't hand out usable session tokens directly (see `docs/database.md`).
- **Generic credential errors** — login returns the identical "Invalid email
  or password" message whether the email doesn't exist or the password is
  wrong, so the endpoint can't be used to enumerate registered emails.
- **CSRF: no separate token mechanism was added.** The API only accepts
  `application/json` bodies, and CORS is restricted to an explicit origin
  allowlist (`AppConfigService.corsOrigins`). A cross-site request with a
  JSON body is not a CORS "simple request," so the browser sends a
  preflight `OPTIONS` first — which the disallowed origin fails, so the
  browser never sends the actual state-changing request at all. Combined
  with `SameSite=Lax` cookies, this closes the practical CSRF vector without
  a double-submit token adding complexity for a gap that isn't open. This
  would need revisiting if the API ever needs to accept
  `application/x-www-form-urlencoded` bodies (which _are_ CORS-simple) or
  GET-based state changes.
- **Password hash / refresh token never appear in any response.**
  `UsersService`'s public-facing methods use Prisma's `omit: { passwordHash:
true }` at the query level — the hash never leaves the database layer on
  those paths, not just "stripped before responding." Enforced by tests
  (`test/auth.e2e-spec.ts`'s "security" assertions and every `UsersService`
  unit test).
- **Every protected endpoint rejects unauthenticated requests** — enforced
  by the global `JwtAuthGuard`, verified by e2e tests hitting real routes
  with no/garbage/expired credentials.

## Deliberately out of scope

Per the task's explicit exclusions — not implemented, and not silently
half-built:

- Password reset, email verification, 2FA/MFA, OAuth/social login, account
  deletion.
- **Login rate limiting / brute-force protection.** A real gap before a
  production launch, but out of the requested scope for this task and would
  mean adding `@nestjs/throttler` as a new dependency for a concern that
  wasn't asked for. Flagged here so it isn't forgotten.

## Configuration

Added to `apps/api/src/config/env.schema.ts` (see `docs/architecture.md`'s
"Configuration architecture" for how this layer works in general):

| Variable                  | Required        | Default | Purpose                            |
| ------------------------- | --------------- | ------- | ---------------------------------- |
| `AUTH_JWT_ACCESS_SECRET`  | Yes (≥32 chars) | —       | Signs/verifies access tokens       |
| `AUTH_JWT_REFRESH_SECRET` | Yes (≥32 chars) | —       | Reserved for future use (see note) |
| `AUTH_JWT_ACCESS_TTL`     | No              | `15m`   | Access token lifetime              |
| `AUTH_JWT_REFRESH_TTL`    | No              | `30d`   | Refresh token lifetime             |

Access and refresh secrets are required to be **different** — a leaked
access-token secret must not also compromise refresh tokens. Note:
`AUTH_JWT_REFRESH_SECRET` is validated and reserved by the config layer, but
today's refresh token is an opaque random value (not a JWT), so nothing
currently signs anything with it — it exists so a future move to a signed/
self-describing refresh token format doesn't need a config-layer change.
See `apps/api/.env.example` for how to generate real values.

## API endpoints

All under `/api/v1/auth` and `/api/v1/users` — see `docs/api-contract.md`
for the general envelope/versioning/error conventions these follow.

### `POST /api/v1/auth/register`

```json
// Request
{ "email": "jane@example.com", "password": "correct horse battery staple" }

// 201, web client (cookies set, not shown)
{ "data": { "user": { "id": "...", "email": "jane@example.com", "role": "CUSTOMER", "createdAt": "..." } } }

// 201, mobile client (X-Client-Platform: mobile)
{ "data": { "user": { ... }, "accessToken": "...", "refreshToken": "..." } }

// 409 -- email already registered
{ "error": { "code": "CONFLICT", "message": "An account with this email already exists" } }
```

### `POST /api/v1/auth/login`

Same response shape as register. `401` with `{ "error": { "message":
"Invalid email or password" } }` for either an unknown email or a wrong
password.

### `POST /api/v1/auth/logout`

```json
// Request: {} for web (cookie identifies the session) or
//          { "refreshToken": "..." } for mobile
// 200, always
{ "data": { "success": true } }
```

### `GET /api/v1/auth/me`

Requires authentication (cookie or `Authorization: Bearer`).

```json
{
  "data": {
    "user": { "id": "...", "email": "jane@example.com", "role": "CUSTOMER", "createdAt": "..." }
  }
}
```

`401` if no/invalid/expired credentials are presented.

### `POST /api/v1/auth/refresh`

Same request/response shape as login (minus registering a new account) —
rotates the refresh token and issues a new access token. `401` if the
presented token is missing, unknown, expired, or already used.

### `GET /api/v1/users` — `ADMIN` or `SUPER_ADMIN`

```json
{
  "data": {
    "items": [{ "id": "...", "email": "...", "role": "...", "createdAt": "..." }],
    "total": 3,
    "page": 1,
    "pageSize": 20
  }
}
```

### `PATCH /api/v1/users/:id/role` — `SUPER_ADMIN` only

```json
// Request
{ "role": "ADMIN" }
// 200
{ "data": { "id": "...", "email": "...", "role": "ADMIN", "createdAt": "..." } }
```

`403` for any caller without the required role; `401` for no caller at all.

## Frontend integration

Both apps follow "keep frontend auth logic thin" — a composable/hook that
calls the endpoints above and holds the current user in local
framework state, nothing more. Neither app touches a token directly; the
browser's cookie jar does that.

- **Web Store** (`apps/store/app/composables/useAuth.ts`): SSR-safe shared
  state (`useState`) exposing `user`, `register`, `login`, `logout`,
  `fetchCurrentUser`. Demonstrated in `app/app.vue` with a minimal
  login/register form and current-user display — not real application UI.
- **Admin Portal** (`apps/admin/src/auth/`): a React context
  (`AuthContext.tsx` provider + `auth-context.ts` hook) with the same
  shape, minus registration (admin accounts aren't self-service). `App.tsx`
  conditionally renders: loading → login form → (if the user's role isn't
  `ADMIN`/`SUPER_ADMIN`) an access-denied message → a minimal dashboard
  placeholder. With only one screen today, this conditional render _is_ the
  "protected route" — a real router (`react-router-dom`) is worth adding
  once there's more than one screen to actually route between. **The gate
  is a UX convenience only**: every API call the dashboard would make is
  independently authorized by the backend regardless of what the frontend
  renders.
- **Future React Native app**: not built. The backend is ready for it (see
  "Transport, per client" above) — the app would send
  `X-Client-Platform: mobile`, store the returned tokens in Keychain/
  Keystore, and attach `Authorization: Bearer <accessToken>` via
  `@kiranabar/api-client`'s existing `getAccessToken` option.
