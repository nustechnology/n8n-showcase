# n8n Showcase — Frontend

Multi-tenant dashboard for monitoring e-commerce automation: Shopify orders flowing through AI validation, inventory checks, shipment creation, and customer notification.

See the Frontend Architecture Plan for the full routing, auth, and phase breakdown this scaffold follows.

## Stack

Next.js 16 (App Router) · TypeScript · Tailwind CSS v4 · shadcn/ui (`base-nova` style, on Base UI) · Clerk (Organizations = workspaces) · TanStack Query · Zustand

## Setup

```bash
cp .env.example .env.local
```

Fill in:
- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` / `CLERK_SECRET_KEY` — from the [Clerk dashboard](https://dashboard.clerk.com)
- In Clerk's dashboard, under **Organizations → Roles**, create four custom roles with exactly these keys: `org:owner`, `org:admin`, `org:operator`, `org:viewer`. `lib/roles.ts` maps UI permissions off these; without them every `usePermission()` check fails closed.
- `NEXT_PUBLIC_API_URL` — the NestJS backend. Nothing in this repo talks to it yet beyond `hooks/use-api-client.ts` and `hooks/use-event-stream.ts`, which are wired but have no callers until a feature needs them.

```bash
npm install
npm run dev
```

## Notable things a fresh clone won't guess

- **`proxy.ts`, not `middleware.ts`.** Next 16 renamed the convention. It only runs `clerkMiddleware()` — no path-based auth gating. Auth is enforced per-resource instead: see `auth.protect()` in `app/[workspaceSlug]/layout.tsx` and the two onboarding pages (Clerk deprecated `createRouteMatcher`-based gating).
- **Workspace-slug reconciliation is client-side.** `components/domain/workspace-shell.tsx` is what actually confirms a signed-in user belongs to the org behind `:workspaceSlug` and calls Clerk's `setActive()` if it needs to switch — `proxy.ts` intentionally doesn't do this (Next's own guidance: no DB/membership lookups in Proxy).
- **`components/ui/` is Base UI, not Radix**, even though it's the shadcn/ui CLI. Composing `<Button>` with a non-button element needs both `render={<Link .../>}` (not `asChild`) and an explicit `nativeButton={false}`, or Base UI logs an accessibility warning.
- **SSE uses `@microsoft/fetch-event-source`, not the native `EventSource`.** The backend's two stream endpoints (`hooks/use-event-stream.ts`) need a Bearer token, which browsers give native `EventSource` no way to send.
- **n8n and AI validation never appear in the UI.** Both are hidden platform infrastructure per the backend integration contract — there's no "connect n8n" card and no link out to it anywhere tenant-facing. See `components/domain/integration-catalog.ts` for the actual (smaller) tenant-facing list.
- **`npm run codegen:api`** generates typed API bindings from the backend's OpenAPI spec via `NEXT_PUBLIC_API_URL`. Not run yet — there's no backend to point it at.
