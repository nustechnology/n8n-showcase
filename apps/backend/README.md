# Order Automation Platform — Backend

NestJS + Prisma + PostgreSQL backend for the multi-tenant order automation platform. Tenant identity comes from a verified Clerk session JWT. Tenant data isolation is application-level only: every tenant-scoped query in the codebase filters by `tenantId` explicitly. There's no database-level Row-Level Security backstop — that was a deliberate call to keep this project simple, not an oversight. See "Tenant isolation" below for what that means in practice.

## Prerequisites

- Node.js 20+ and npm
- A PostgreSQL 16 instance (a local install, or `docker run -e POSTGRES_PASSWORD=postgres -p 5432:5432 postgres:16-alpine`)
- A Clerk application with Organizations enabled

## 1. Install dependencies

```bash
npm install
```

## 2. Create the database role

One Postgres role, full privileges on the schema:

```sql
CREATE ROLE n8n-showcase LOGIN PASSWORD 'pick-a-password';
GRANT ALL ON SCHEMA public TO n8n-showcase;
```

## 3. Configure environment

```bash
cp .env.example .env
```

Fill in:
- `DATABASE_URL` — connection string using `n8n-showcase`
- `CLERK_ISSUER` — your Clerk instance's frontend API origin (Clerk dashboard → API Keys). The app fetches `${CLERK_ISSUER}/.well-known/jwks.json` and verifies every request's session token against it — this is why the app fails fast at boot without it.
- `CLERK_WEBHOOK_SECRET` — from Clerk dashboard → Webhooks → your endpoint → Signing Secret (`whsec_...`). Also fails the app at boot if missing, same as `CLERK_ISSUER`. You'll need a webhook endpoint registered in Clerk pointing at `POST /webhooks/clerk` on a URL Clerk can reach (a tunnel like `ngrok`/Clerk's own CLI forwarding for local dev) — subscribed to `organization.*`, `user.*`, and `organizationMembership.*` events.
- `CREDENTIALS_ENCRYPTION_KEY` — 32 bytes, base64: `openssl rand -base64 32`. Also fails the app at boot if missing or the wrong length after decoding.
- `SHOPIFY_CLIENT_ID` / `SHOPIFY_CLIENT_SECRET` / `SHOPIFY_SCOPES` — from your Shopify Partner app (partners.shopify.com → your app → Client credentials).
- `APP_BASE_URL` — publicly reachable base URL of *this* backend. In local dev this has to be a tunnel (`ngrok http $PORT` or similar), not `localhost` — Shopify's servers need to reach it directly for both the OAuth redirect and the order webhook. Update the Partner app's redirect URI to `${APP_BASE_URL}/integrations/shopify/callback` to match.
- `FRONTEND_URL` — base URL of the Next.js app, where a tenant lands after completing (or failing) the Shopify connect flow.

## 4. Set up the database

```bash
npm run prisma:migrate:deploy   # creates tables
npm run prisma:generate         # generates the Prisma Client used by PrismaService
npm run prisma:seed             # seeds the system roles (Owner/Admin/Operator/Viewer) + permission catalog
```

Tenants are provisioned automatically: creating a Clerk organization fires `organization.created`, which `POST /webhooks/clerk` turns into a `tenants` row (see "Tenant provisioning" below). If your local webhook endpoint isn't reachable from Clerk yet, you can still insert one by hand to unblock testing the rest of the API:

```sql
INSERT INTO tenants (id, clerk_org_id, slug, name, plan, status, settings, created_at, updated_at)
VALUES ('t_dev', 'org_...', 'dev', 'Dev Co', 'TRIAL', 'ACTIVE', '{}', now(), now());
```
(use the real `org_id` of an organization in your Clerk instance).

## 5. Run it

```bash
npm run start:dev
```

- `GET /health` — public, no auth
- `POST /webhooks/clerk` — public, verified via Svix signature instead of a Clerk session (see "Tenant provisioning" below)
- `GET /tenants/me` — requires `Authorization: Bearer <Clerk session token>` and an `X-Workspace-Id` header matching that token's active organization id
- `PATCH /tenants/me` — same auth, plus `tenant:manage` permission (Owner only)
- `GET /integrations`, `POST /integrations/:provider/connect`, `GET /integrations/:provider/callback` (public — see "Integrations" below), `POST /integrations/:provider/test`, `DELETE /integrations/:provider`
- `POST /webhooks/shopify/:integrationId` — public, verified via Shopify's HMAC instead of a Clerk session
- `GET /orders`, `GET /orders/:id`, `GET /orders/:id/timeline`, `GET /workflow-runs` — all require `orders:read`

## Scripts

| Command | What it does |
| --- | --- |
| `npm run start:dev` | Watch-mode dev server (`nest start --watch`) |
| `npm run build` | Compile to `dist/` |
| `npm run start:prod` | Run the compiled build (`node dist/main.js`) |
| `npm test` | Jest unit tests |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run prisma:generate` | Regenerate the Prisma Client after a schema change |
| `npm run prisma:migrate:deploy` | Apply pending migrations |
| `npm run prisma:seed` | Compile and run `prisma/seed.ts` against `DATABASE_URL` |

## Architecture notes

- **`src/auth/guards/clerk-tenant.guard.ts`** — the only source of tenant/user identity. Verifies the session JWT against Clerk's JWKS, requires `X-Workspace-Id` to match the token's `org_id` claim (400 on mismatch or if missing — see the integration contract, §1), resolves the Clerk org to an internal `Tenant` and the Clerk user to an internal `User` (403 if either isn't provisioned yet), and stores `tenantId`/`userId`/`clerkOrgId`/`clerkUserId`/`orgRole`/`orgSlug` in request-scoped context (`nestjs-cls`).
- **`src/auth/guards/permissions.guard.ts`** — registered globally *after* the tenant guard (order matters — it reads `tenantId`/`userId` from CLS). No-op unless the route/controller has `@RequirePermission('resource:action')`; otherwise checks the caller's `TenantMembership` role against the seeded permission catalog, 403 if missing.
- **`src/prisma/prisma.service.ts`** — a plain Nest-lifecycle-managed `PrismaClient`, one connection for everything.
- **`@Public()`** (`src/common/decorators/public.decorator.ts`) — exempts a route (or a whole controller, e.g. `ClerkWebhookController`) from both guards above. Used by `/health` and the `webhooks/*`/`integrations/:provider/callback` routes, which authenticate via provider signatures instead of a Clerk session.
- **Validation** — zod, per-route via `ZodValidationPipe` (`src/common/pipes`), not `class-validator`. Schema + inferred type live together in `src/<feature>/dto/*.schema.ts`.

## Tenant provisioning

`POST /webhooks/clerk` (`src/webhooks/`) is what keeps `tenants`/`users`/`tenant_memberships` in sync with Clerk — there's no manual "create tenant" endpoint. It:

1. Verifies the Svix signature over the raw request body (`main.ts` enables `rawBody: true` specifically for this — a re-serialized `req.body` would produce a different signature and always fail verification).
2. Dedupes on `svix-id` via the `webhooks_inbound` table — Svix redelivers on any non-2xx response, and can occasionally redeliver a succeeded event too.
3. Dispatches to `ClerkWebhookService`, which handles `organization.created/updated/deleted`, `user.created/updated`, and `organizationMembership.created/updated/deleted`. Everything else is logged and ignored.

The one non-obvious piece is role assignment: Clerk's built-in org roles are just `org:admin`/`org:member`, with no concept of "Owner." `ClerkWebhookService.resolveRoleName()` treats the **first** `org:admin` membership on a given tenant as Owner, every subsequent `org:admin` as Admin, and `org:member` as Operator. Promoting someone to Viewer, or changing this mapping, is an app-level action with no Clerk equivalent — there's no UI for it yet.

Organization deletion soft-cancels the tenant (`status: CANCELED`) rather than deleting it — orders and audit history hang off that row.

## Integrations

Third-party credentials (Shopify OAuth tokens, Resend API keys) are encrypted with AES-256-GCM (`src/credentials/credentials.service.ts`) before hitting `integration_credentials`. Every encrypt/decrypt call binds AAD to the credential's `integrationId` — that table deliberately has no `tenantId` column (isolation is via the `integrationId` FK join), so a ciphertext/iv/authTag triple copied or swapped between rows fails to decrypt instead of silently succeeding against the wrong one. `CREDENTIALS_ENCRYPTION_KEY` is validated at boot, not lazily on first use.

**Shopify (OAuth)** — `POST /integrations/shopify/connect` generates a random CSRF state (stored in dedicated `Integration.oauthState`/`oauthStateExpiresAt` columns, not buried in the `config` JSON — that keeps the callback's tenant lookup an indexed, uniqueness-guaranteed read instead of an unindexed scan) and returns an authorize URL for the frontend to redirect to. `GET /integrations/shopify/callback` (public — Shopify's redirect carries no Clerk session) verifies Shopify's own HMAC, resolves the tenant via the state token, confirms the shop matches what was stored at connect time, rejects if another tenant already has this same shop `ACTIVE` (prevents two tenants both ending up connected to one store), exchanges the code for a token, stores it, and registers an `orders/create` webhook subscription pointing at `POST /webhooks/shopify/:integrationId`. If webhook registration fails after a successful token exchange, the integration is marked `DEGRADED` (not `ACTIVE` or `ERROR`) — the credential is genuinely valid, but orders won't sync until that's retried.

The order webhook itself is path-scoped by `Integration.id` rather than a single shared URL — Shopify's webhook HMAC is signed with the app's client secret (shared across every tenant's shop), so it can't identify *which* tenant on its own; a primary-key path lookup is the indexed way to resolve that instead of scanning every tenant's stored shop domain on every order.

**Resend (API key)** — `POST /integrations/resend/connect` takes `{apiKey}` directly (no OAuth redirect) and validates it immediately against `GET https://api.resend.com/domains`. There is deliberately no email-sending endpoint yet: Resend requires a verified sending domain before any mail can go out at all, and there's no sandbox sender that bypasses that — building real send capability means building domain verification too, which is out of scope for now. Both `connect` and `test` are read-only connectivity checks.

**`POST /integrations/shopify/test` clears `DEGRADED` back to `ACTIVE` on success, but only because it verifies more than credential validity.** `ShopifyAdapter.testConnection` checks `shop.json` *and* re-fetches the stored `shopifyWebhookId` (`GET /admin/api/{version}/webhooks/{id}.json`) — both read-only, so `test` stays side-effect-free. A `DEGRADED` integration has no `shopifyWebhookId` in `config` yet (webhook registration is what failed), so `testConnection` throws every time until a disconnect/reconnect actually registers one — it can't silently mark orders-aren't-syncing as healthy just because the token still works. Don't drop the webhook check from `testConnection` without also reverting `test()`'s DEGRADED→ACTIVE transition in `IntegrationsService` — the two changed together on purpose.

### Debugging a specific order

There's no verbose logging across the Shopify → backend → n8n round trip by default — `N8nOrchestratorService`'s "Started order-validation workflow run" line is the only thing that logs on its own. To inspect a specific order's actual webhook payload or why `AiValidationService` rejected it, query the DB directly rather than adding console logging: the full raw Shopify payload is on `WebhookInboundEvent.payload`/`Order.rawPayload`, and validation is a plain, re-runnable check (`Boolean(order.customerEmail) && Number(order.totalAmount) > 0` — see `AiValidationService.validateOrder`) against `Order.customerEmail`/`Order.totalAmount`. The FE's `OrderValidationFailureDialog` (on a `VALIDATION_FAILED` order row) and `WorkflowRunFailureDialog` (on a `FAILED` workflow-run row) surface this same reasoning in the UI without needing a DB query at all.

## Environment files

Everything in this repo reads a single `.env` file: `ConfigModule` (the app) and the Prisma CLI both default to it, and `prisma/seed.ts` loads it explicitly itself since it's a standalone script, not part of the Nest app. One file, no precedence rules to remember.

## Tenant isolation

This is the one thing every future PR touching a query needs to get right, so it's called out on its own: **there is no database-level check.** `ClerkTenantGuard` resolves `tenantId` and puts it in CLS (`@CurrentTenant()` reads it back out), but nothing stops a query from omitting it. Every tenant-scoped read or write must include an explicit filter:

```ts
this.prisma.order.findMany({ where: { tenantId, /* ... */ } })
```

A query that forgets `tenantId` doesn't error — it silently returns every tenant's rows. If this project's scope grows to handling real customer data, revisit adding Postgres Row-Level Security as a second layer (the multi-tenancy section of the backend plan describes what that looked like); for now, code review is the only backstop.

## Troubleshooting

**`Access to fetch at 'http://localhost:3002/...' from origin 'http://localhost:3000' has been blocked by CORS policy`**
CORS is enabled in `main.ts` for exactly one origin — `FRONTEND_URL` — since the frontend and backend run on different ports in local dev. If you see this, either `FRONTEND_URL` in `.env` doesn't match the origin the frontend is actually running on (protocol + host + port, exact string), or the backend needs a restart to pick up an `.env` change (`ConfigService` doesn't hot-reload env values). This is a static allow-list, not a wildcard — a request from any other origin is expected to fail the same way, by design.

**`Error: Cannot find module '.../dist/main'` when running `npm run start:dev`, right after "Found 0 errors."**
This means TypeScript's incremental build cache (`dist/tsconfig.tsbuildinfo`) is out of sync with the actual contents of `dist/` — usually from deleting `dist/` by hand without also clearing the cache. Fixed at the config level (the build info file now lives inside `dist/`, so the two can't drift apart — deleting one deletes the other), but if it ever resurfaces: `rm -rf dist` and restart.

**`(node:...) [DEP0190] DeprecationWarning: Passing args to a child process with shell option true...`**
Comes from `@nestjs/cli`'s internal watch-mode process spawning on newer Node versions. Harmless — safe to ignore.

**`TypeError: Configuration key "CLERK_ISSUER"` (or `"CLERK_WEBHOOK_SECRET"`, `"CREDENTIALS_ENCRYPTION_KEY"`, `"SHOPIFY_CLIENT_ID"`, etc.) `does not exist"` at boot, or `Environment variable not found: DATABASE_URL` from a Prisma command**
No `.env` file, or it's missing one of the required vars. See step 3 — if you set this project up before a given feature was added, your existing `.env` is missing that feature's vars and needs them added.

**`Error: CREDENTIALS_ENCRYPTION_KEY must decode to exactly 32 bytes` at boot**
The value isn't valid base64 for 32 bytes — regenerate with `openssl rand -base64 32` and use that exact output, don't hand-write one.

**A Shopify connect never completes / the callback redirects with `?status=error`**
Almost always `APP_BASE_URL` not matching what's actually registered as the redirect URI on the Shopify Partner app, or `APP_BASE_URL` pointing at `localhost` instead of a reachable tunnel — Shopify's servers have to hit this URL directly. Check the tunnel is still running (tunnel URLs from free ngrok accounts change on restart) and that the Partner app's redirect URI is exactly `${APP_BASE_URL}/integrations/shopify/callback`. Note that with `nest start --watch`, editing `.env` alone does not restart the process — the watcher only rebuilds on source file changes, so a stale `APP_BASE_URL` (and therefore a stale `redirect_uri`) keeps being served until the server is restarted by hand.

**`ERROR [IntegrationsService] TypeError: fetch failed` in the logs during the Shopify callback, redirecting to `?status=error` with "Token exchange with Shopify failed"**
This is a network-level failure of the outbound `fetch()` to `https://<shop>/admin/oauth/access_token`, not an app bug — Node throws this same generic error for DNS failures, TLS errors, and connection timeouts alike, so check the underlying cause rather than assuming config. One confirmed cause on Linux dev machines: `*.myshopify.com` resolves both an `A` and an `AAAA` record, and Node's `fetch` prefers IPv6 (Happy Eyeballs). If the machine has a dead/non-forwarding IPv6 default route (common with some routers/ISPs that advertise one via RA but don't actually route it), every outbound call to a dual-stack host hangs until timeout and throws `fetch failed`, even though plain IPv4-only sites work fine. Diagnose with `dig AAAA <shop>.myshopify.com` + `curl -6 https://google.com` (fails fast if IPv6 is broken) vs `curl -4` to the same host (succeeds). `main.ts` calls `dns.setDefaultResultOrder('ipv4first')` at boot specifically to route around this — if it resurfaces, verify that call is still there before re-diagnosing from scratch.

**`GET /integrations` shows a Shopify integration as `DEGRADED` right after connecting**
The OAuth exchange itself succeeded (the credential is real and stored) but registering the `orders/create` webhook subscription failed — check `lastErrorMessage` on that integration. Orders won't sync until this is resolved; disconnecting and reconnecting will retry the whole flow.

One confirmed cause: `BadGatewayException: Shopify webhook registration failed: 403`. `shopify.adapter.ts`'s `registerWebhook` doesn't log the response body, so the 403 alone is uninformative — replaying the same call manually (decrypt the stored credential, POST to `https://<shop>/admin/api/2024-10/webhooks.json`) surfaces the real reason: `"You do not have permission to create or update webhooks with orders/create topic. This topic contains protected customer data."` This is Shopify's **Protected Customer Data** access control, separate from OAuth scopes — `read_orders` lets you authorize the scope, but `orders/create` payloads carry customer PII, so the Partner app additionally needs explicit approval before it can subscribe to that topic at all. Fix: **partners.shopify.com → App distribution → All apps → this app → API access requests → Protected customer data access → Request access**, select **Store management** as the reason (this app tracks orders/inventory, not customer service/marketing/personalization — don't select reasons that don't apply), then disconnect and reconnect to retry. On a development store this takes effect immediately, no Shopify review needed. The frontend surfaces a "How to fix" button with these steps on a `DEGRADED` Shopify integration (`components/domain/shopify-protected-data-dialog.tsx` in the FE repo).

**The `orders/create` webhook arrives fine, but `payload.customer` is missing `email`/`first_name`/`last_name` (and the top-level `payload.email` is also absent), even though the order genuinely has a customer attached in Shopify admin**
This is the *next* gate after the one above, easy to miss because "Protected customer data access" approval (previous entry) is a two-step process, not one: (1) request access and pick a reason (e.g. **Store management**) — this is what unblocks the webhook *subscription* itself — and separately (2) **individually select which protected fields you need** (Name, Email, Phone, Address) on that same Partner Dashboard page, each with its own approval. Completing only step 1 gets you the webhook with the PII silently stripped out of it — no error, no 4xx, just empty fields. Fix: **partners.shopify.com → this app → API access requests → Protected customer data access**, go past the reason picker to the field list, and check **Name** and **Email** (the two fields `shopify-webhook.service.ts` actually reads — `payload.email`/`payload.customer.email` and `payload.customer.first_name`/`last_name`). Immediate on a development store. Confirm the fix on the next test order: check `Order.customerEmail` directly, or open the "Why" dialog on that order's row in the FE (`OrderValidationFailureDialog`) once it's landed.

**Clicking "Test connection" shows a success toast, but the badge stays `DEGRADED`/"Needs attention"**
Expected on an old build — `POST /integrations/shopify/test` used to only check `shop.json` (credential validity) and never touched `status` on success, so a `DEGRADED` integration (no webhook registered) would clear its `lastErrorMessage` but never turn back into `ACTIVE`, leaving an unhealthy badge with no visible explanation. Fixed: `testConnection` now also re-fetches the stored `shopifyWebhookId` (read-only, no side effects), and `IntegrationsService.test()` restores `ACTIVE` when that succeeds. If this resurfaces, disconnect and reconnect to force a fresh webhook registration rather than repeatedly clicking Test connection — that's still the only thing that can *create* a missing webhook.

**`400 Bad Request` ("Invalid webhook signature") from `POST /webhooks/shopify/:integrationId`**
`SHOPIFY_CLIENT_SECRET` doesn't match the Partner app's actual client secret, or the request body was altered in transit — same class of issue as the Clerk webhook signature failure below, but Shopify's webhook HMAC is base64 over the raw body (different encoding from the OAuth callback's own hex/query-string HMAC — see `src/integrations/adapters/shopify-hmac.util.ts`, these are deliberately two separate functions).

**`The table 'public.X' does not exist in the current database` from `npm run prisma:seed`**
Migrations haven't been applied to whatever database `DATABASE_URL` points at yet. Run `npm run prisma:migrate:deploy` first.

**`400 Bad Request` ("Invalid webhook signature") from `POST /webhooks/clerk`**
Either `CLERK_WEBHOOK_SECRET` doesn't match the signing secret for that specific endpoint in the Clerk dashboard (each endpoint has its own), or something between Clerk and this app re-serialized the request body — Svix signs the exact raw bytes, so any proxy that re-encodes JSON in transit breaks verification.

**`role "n8n-showcase" does not exist` while migrating**
The database role (step 2) doesn't exist yet, or was dropped along with a recreated schema (`DROP SCHEMA public CASCADE` also drops that role's grants — re-run the `GRANT` from step 2 after recreating the schema).
