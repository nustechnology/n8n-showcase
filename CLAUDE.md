# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## What this is

Multi-tenant dashboard for monitoring e-commerce automation: Shopify orders flowing through AI validation, inventory checks, shipment creation, and customer notification. Next.js 16 (App Router) · TypeScript · Tailwind CSS v4 · shadcn/ui (`base-nova` style, on Base UI, not Radix) · Clerk (Organizations = workspaces) · TanStack Query · Zustand.

Routes, layout, auth, and the core domain screens are wired to real data now. `useApiClient` has callers across `features/orders`, `features/workflows`, `features/integrations`, and `features/notifications`; `useEventStream` backs the workflow-run-detail live status and the dashboard's live activity panel. What's still genuinely unbuilt: per-step run detail (backend doesn't populate `WorkflowRun.steps` yet) and settings/billing. Check the relevant `features/<name>/` module before assuming a screen is still a stub.

## Commands

```bash
npm run dev          # start dev server
npm run build         # production build
npm run lint          # eslint
npm run codegen:api   # regenerate lib/api-schema.generated.ts from the backend's OpenAPI spec (needs NEXT_PUBLIC_API_URL reachable; not runnable until a backend exists)
```

No test runner is configured. `tsconfig.json` has `noEmit: true` — use `npx tsc --noEmit` for a standalone type check if needed.

## Environment

Copy `.env.example` to `.env.local`. Requires Clerk keys and, in the Clerk dashboard under Organizations → Roles, four custom roles with exactly these keys: `org:owner`, `org:admin`, `org:operator`, `org:viewer`. Without them, `lib/roles.ts` can't map a Clerk org role to a `WorkspaceRole` and every `usePermission()` check fails closed.

## Architecture

**Routing** is under `app/`, split by route group:
- `(marketing)` — public landing page
- `(auth)` — Clerk `<SignIn>`/`<SignUp>` catch-all routes
- `(onboarding)` — `create-workspace`, `join-workspace`, both call `auth.protect()` directly
- `[workspaceSlug]` — the authenticated app shell (dashboard, integrations, workflows, orders, notifications, settings)

**Auth is resource-based, not path-based.** Next 16 renamed `middleware.ts` to `proxy.ts`; `proxy.ts` here only runs `clerkMiddleware()` for session sync — it does *not* gate routes (Clerk deprecated `createRouteMatcher`-style matching). Each protected layout/page calls `auth.protect()` itself: see `app/[workspaceSlug]/layout.tsx` and the two onboarding pages. When adding a new protected route, add its own `auth.protect()` call — don't expect the proxy to cover it.

**Workspace-slug reconciliation is client-side**, in `components/domain/workspace-shell.tsx`. The proxy only confirms the user is signed in; this component confirms the signed-in user actually belongs to the org behind `:workspaceSlug` (via `useOrganizationList`) and calls Clerk's `setActive()` to switch orgs if needed. This is intentional — Next's own Proxy guidance says not to do DB/membership lookups there.

**Permissions** (`lib/roles.ts` + `hooks/use-permission.ts`) are a ranked role system (`viewer < operator < admin < owner`) mapped from Clerk's `org:*` custom roles, gating actions like `workflow:retry` or `integration:manage`. This is UI-only — it hides/disables actions a role can't perform so a Viewer never sees a "Retry" button, but the NestJS backend's own guards are the actual enforcement. Don't treat a passing `usePermission()` check as a security boundary.

**API access** goes through `useApiClient()` (`hooks/use-api-client.ts`), not raw `fetch`. It attaches a Clerk bearer token and an `X-Workspace-Id` header (checked by NestJS against the JWT's org claim), and retries once with a fresh token on 401/400 to cover the window right after an org switch. Streaming endpoints use `useEventStream()` (`hooks/use-event-stream.ts`), built on `@microsoft/fetch-event-source` rather than native `EventSource` because native `EventSource` can't send an Authorization header.

**Status vocabularies are two distinct enums** — do not cross them. `RunStatus` (`lib/status.ts`) is for workflow runs/orders; `IntegrationStatus` is the backend's 5-state integration health vocabulary. Each has its own `map*Status()` helper to a `{ tone, label }` pair for `StatusBadge`.

**n8n and AI validation are hidden platform infrastructure** and must never surface in tenant-facing UI — no "connect n8n" card, no link out to it. The actual tenant-facing integration list lives in `components/domain/integration-catalog.ts` (Shopify, Resend, Zoho Inventory, EasyPost, Slack); check that file rather than assuming an integration belongs in the catalog.

**`components/ui/` is shadcn/ui on Base UI, not Radix**, despite using the standard shadcn CLI (`components.json` sets `"style": "base-nova"`). Composing e.g. `<Button>` with a non-button element (a `Link`, for example) needs `render={<Link .../>}` instead of `asChild`, plus an explicit `nativeButton={false}` — otherwise Base UI logs an accessibility warning. See `app/(marketing)/page.tsx` or `components/patterns/topbar.tsx` for examples.

**Feature-local types** live under `features/<name>/types.ts` (`orders`, `workflows`, `integrations`) — domain shapes the UI consumes, distinct from anything generated into `lib/api-schema.generated.ts` by `codegen:api`.

## Coding conventions

### Import order

```ts
// 1. React
import { useState } from "react";

// 2. Next.js
import Link from "next/link";

// 3. Third-party (zod, react-hook-form, etc.)
import { z } from "zod";

// 4. Server Actions
import { createOrder } from "@/app/actions/create-order";

// 5. Contexts
import { WorkspaceContext } from "@/contexts/workspace-context";

// 6. Hooks
import { usePermission } from "@/hooks/use-permission";

// 7. lib (constants → definitions → utils)
import { WORKSPACE_NAV_ITEMS } from "@/lib/constants";
import type { WorkspaceRole } from "@/lib/roles";
import { cn } from "@/lib/utils";

// 8. shadcn/ui components
import { Button } from "@/components/ui/button";

// 9. Normal components
import { PageHeader } from "@/components/patterns/page-header";
```

A blank line separates every group — including between individual groups that each only have one import. Omit a group's comment entirely if nothing in the file belongs to it; don't leave an empty comment with no imports under it.

### Props typing

- **Regular components** — use `interface` for prop types (see `PageHeaderProps` in `components/patterns/page-header.tsx`).
- **`page.tsx` files** — use `type` for `Params` and `SearchParams` as async promises (Next.js 16 format):

```ts
type Params = Promise<{ categorySlug: string }>;
type SearchParams = Promise<{ query: string }>;

export default async function Page(props: { params: Params; searchParams: SearchParams }) {
  const params = await props.params;
  const searchParams = await props.searchParams;
  // ...
}
```

### React types

In hand-written app code (`app/`, `components/domain/`, `components/patterns/`, `hooks/`), import React's types by name instead of reaching for them through the `React` namespace:

```ts
// Good
import { useState, type ReactNode, type KeyboardEvent } from "react";

function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) { ... }
```

```ts
// Bad
function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) { ... }
```

This does **not** apply to `components/ui/`: those files are shadcn/ui-generated primitives that use `React.ComponentProps<...>` as their own upstream convention — leave that pattern alone there so the files stay close to what the shadcn CLI would regenerate.

### JSX attribute formatting

An element with 2 or more attributes goes multi-line, one attribute per line, closing tag/bracket on its own line:

```tsx
// Good
<Button
  nativeButton={false}
  render={<Link href="/sign-up">Sign up</Link>}
/>

// Bad
<Button nativeButton={false} render={<Link href="/sign-up">Sign up</Link>} />
```

A single attribute can stay on one line. This repo isn't consistent about it yet (e.g. `components/patterns/topbar.tsx`, `app/(marketing)/page.tsx`) — apply the multi-line form to new or touched code rather than reformatting untouched lines as a drive-by.

### Vertical spacing

Use blank lines to separate **logical sections**, not individual statements.

```ts
// Good
clearTimeout(debounceRef.current);

if (!API_KEY) {
  return;
}

abortRef.current?.abort(); // cancels the *previous* request — a different action from setting up this one

const controller = new AbortController();
abortRef.current = controller; // still setting up the same request — no break

try {
  const res = await fetch(...);

  if (!res.ok) {
    throw new Error("...");
  }

  const data = await res.json();

  setData(data); // a new action (persisting to state), not just forwarding res.json()'s result
} catch (error) {
  // ...
}
```

```ts
// Bad — unrelated statements crammed together
const controller = new AbortController();

abortRef.current = controller;
```

```ts
// Bad — no separation between fetching and acting on the result
const data = await res.json();
setData(data);
setIsOpen(true);
```

```ts
// Good — same statements, corrected
const data = await res.json();

setData(data);
setIsOpen(true);
```

Guidelines:

- Insert one blank line between distinct logical sections.
- Keep closely related statements together without blank lines — specifically, when a statement's only purpose is to store or forward a value for the *same* setup step (e.g., assigning a fresh value to a ref, passing it as an argument into the next call in the same sequence), don't separate them.
- After any `await` (or other Promise-based call), insert a blank line before the next statement **unless** that next statement's only job is to store/forward the awaited value as part of the same setup step. As soon as a later statement does something new with the value — branches on it, validates it, hands it to a different subsystem, persists it to state — that's a new logical section and gets the blank line before it.
- After variable declarations, insert a blank line before the following `if`, `for`, `while`, `switch`, or `try` when the declarations form their own logical section.
- Releasing or canceling an existing resource (e.g. `clearTimeout`, `abortRef.current?.abort()`) is a distinct action from constructing its replacement — insert a blank line between the two, even though the replacement's own construct-then-store pair stays together.
- After a guard clause that exits early (`return`, `throw`, `break`, or `continue`) from the enclosing block or function, leave a blank line before the statements that follow it in that block — this applies whether the guard sits at the top of a function or inside a nested block like `try`.
- Avoid consecutive blank lines.

### Validation

Use `zod` for validation — form schemas via `@hookform/resolvers` with `react-hook-form`, and any data crossing a trust boundary (route params, search params, API responses not already covered by `lib/api-schema.generated.ts`). Both are already dependencies; don't hand-rolled-validate where a `z.object()` schema would do.
