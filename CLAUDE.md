# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## What this is

Turborepo monorepo for a multi-tenant e-commerce order automation platform: Shopify orders flow through AI validation, inventory checks, shipment creation, and customer notification, orchestrated by n8n.

```
apps/
├── backend/     NestJS + Prisma + PostgreSQL (API server, port 3000)
├── frontend/    Next.js 16 + Tailwind v4 + shadcn/ui (dashboard, port 3001)
└── n8n/         n8n workflow engine (Docker, port 5680)

packages/
├── shared-schemas/   zod schemas — source of truth for API contracts, consumed by BE + FE
├── shared-types/     TypeScript interfaces shared by BE and FE
└── shared-config/    base tsconfig.json
```

**Each app directory has its own `CLAUDE.md` with deep architectural detail — read it before working inside that app.** `apps/backend/CLAUDE.md` covers the request/auth pipeline, tenant isolation model, third-party integration adapters, circuit breakers/rate limiting, and every known route. `apps/frontend/CLAUDE.md` covers routing/auth structure, the permission model, coding conventions (import order, JSX formatting, vertical spacing), and Base UI-vs-Radix gotchas. This root file only covers what spans multiple apps.

## Cross-app architecture

```
┌──────────────┐   Clerk JWT + X-Workspace-Id   ┌──────────────┐
│   Frontend   │ ───────────────────────────────> │   Backend    │
│  (Next.js)   │ <────── SSE streams ──────────── │  (NestJS)    │
│  :3001       │                                  │  :3000       │
└──────────────┘                                  └──────┬───────┘
                                                         │
                                           POST /webhook  │ POST /internal/*
                                           (order-received)│ (status, validation,
                                                         │  integrations)
                                                  ┌──────┴───────┐
                                                  │     n8n       │
                                                  │  (Docker)     │
                                                  │  :5680        │
                                                  └──────────────┘
```

- **Frontend** authenticates via Clerk and attaches `Authorization: Bearer <JWT>` + `X-Workspace-Id` to every backend call.
- **Backend** verifies the Clerk JWT, resolves tenant context, enforces RBAC, and is the **only** service that ever holds third-party credentials (Shopify, Zoho, EasyPost, Resend, Slack, OpenAI). It kicks off n8n runs via a webhook and exposes `/internal/*` for n8n to call back into.
- **n8n** orchestrates the one order-validation workflow and calls `/internal/*` for everything needing state or a secret. It never touches Postgres directly and never holds a third-party credential itself — this boundary is deliberate; don't add a shortcut that gives n8n direct DB or credential access.

A single order's journey: Shopify webhook → backend writes `Order` + starts n8n run → n8n calls `/internal/ai/validate-order` → `/internal/integrations/zoho/check-inventory` → `/internal/integrations/easypost/create-shipment` → `/internal/integrations/shopify/update-order` → `/internal/integrations/slack/send-message`, with status/step bookkeeping calls interleaved. See `apps/backend/CLAUDE.md`'s "Orchestrator callbacks" section for the exact contract.

## Environment

All services read one root `.env` file (`.env.example` is the template). Two tools can't read from the root, so they need a symlink instead of their own copy:

```bash
ln -sf $(pwd)/.env apps/backend/.env    # Prisma reads .env from its own project directory
ln -sf $(pwd)/.env apps/frontend/.env.local  # Next.js/Clerk reads .env.local from the app directory
```

## n8n workflow

`apps/n8n/workflows/order-validation.json` is the source of truth, not the live workflow in the n8n UI. After editing the workflow in n8n's UI: Export (three-dot menu → Download), overwrite that file, and commit it.

## CI

`.github/workflows/ci.yml` runs on push/PR to `main`: `typecheck` → `lint` / `test` (with a PostgreSQL service container) → `build` (depends on typecheck + test).
