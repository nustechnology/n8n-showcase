# n8n Showcase — Order Automation Platform

Turborepo monorepo for a multi-tenant e-commerce order automation platform.

```
apps/
├── backend/     NestJS + Prisma + PostgreSQL (API server)
├── frontend/    Next.js 16 + Tailwind v4 + shadcn/ui (dashboard)
└── n8n/         n8n workflow engine (Docker)

packages/
├── shared-schemas/   zod schemas — source of truth for API contracts
├── shared-types/     TypeScript interfaces shared by BE and FE
└── shared-config/    base tsconfig.json
```

## Prerequisites

- **Node.js 22+** and **npm 11+**
- **Docker + Docker Compose**
- A **Clerk** application with Organizations enabled
- (Optional) Shopify Partner app, Zoho API Console, Resend, EasyPost accounts

## Quick Start

```bash
# 1. Clone
git clone <repo-url> && cd automation-experience-center

# 2. Install dependencies
npm install

# 3. Generate Prisma client
npm run db:generate

# 4. Set up environment
cp .env.example .env
# Fill in CLERK_ISSUER, CLERK_SECRET_KEY, CLERK_WEBHOOK_SECRET,
# CREDENTIALS_ENCRYPTION_KEY, POSTGRES_PASSWORD, N8N_INTERNAL_TOKEN, etc.

# 5. Start PostgreSQL + n8n (for local dev, use Docker)
docker compose up -d postgres n8n

# 6. Apply migrations + seed
npm run db:migrate:deploy
npm run db:seed

# 7. Start development servers
npm run dev
```

- **Backend** → http://localhost:3000
- **Frontend** → http://localhost:3001
- **n8n** → http://localhost:5680

## Development Commands

| Command | Description |
|---|---|
| `npm run dev` | Start all apps in watch mode (turbo) |
| `npm run build` | Build all apps and shared packages |
| `npm run typecheck` | Type-check everything |
| `npm run test` | Run all test suites |
| `npm run lint` | Lint all apps |
| `npm run db:generate` | Regenerate Prisma client |
| `npm run db:migrate:deploy` | Apply pending database migrations |
| `npm run db:seed` | Seed system roles and permissions |
| `npm run codegen:api` | Generate frontend API types from backend |

### Filtering by app

```bash
npx turbo dev --filter=@n8n-showcase/backend
npx turbo test --filter=@n8n-showcase/backend
npx turbo build --filter=@n8n-showcase/frontend
```

## Docker (Full Stack)

```bash
npm run docker:build    # Build all images
npm run docker:up       # Start all services
npm run docker:down     # Stop everything
npm run docker:logs     # Tail logs
```

See `.env.example` for all required environment variables.

## Architecture

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

- **Frontend** authenticates via Clerk. Attaches `Authorization: Bearer <JWT>` + `X-Workspace-Id` header to every API call.
- **Backend** verifies the Clerk JWT, resolves tenant context, and enforces RBAC permissions.
- **n8n** receives workflow triggers from the backend and calls back into `/internal/*` endpoints for everything that needs state or credentials. n8n never holds third-party API keys or talks directly to Shopify/Zoho/etc.

## Shared Packages

| Package | Purpose | Consumers |
|---|---|---|
| `@n8n-showcase/shared-schemas` | Zod validation schemas (enums, connect DTOs, member/tenant) | BE + FE |
| `@n8n-showcase/shared-types` | TypeScript interfaces (WorkspaceRole, PermissionAction, API responses) | FE |

Adding a new shared schema:
1. Add it to `packages/shared-schemas/src/` and re-export in `index.ts`
2. Both apps import from `@n8n-showcase/shared-schemas`
3. Run `npm run build` to compile the shared package

## Environment Variables

All services share a single `.env` file at the monorepo root (Docker Compose reads from it). Key variables:

| Variable | Service | Required |
|---|---|---|
| `POSTGRES_PASSWORD` | PostgreSQL | Yes |
| `DATABASE_URL` | Backend | Yes |
| `CLERK_ISSUER` | Backend | Yes |
| `CLERK_SECRET_KEY` | Backend + Frontend | Yes |
| `CLERK_WEBHOOK_SECRET` | Backend | Yes |
| `CREDENTIALS_ENCRYPTION_KEY` | Backend | Yes |
| `N8N_INTERNAL_TOKEN` | Backend + n8n | Yes |
| `N8N_ENCRYPTION_KEY` | n8n | Yes |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Frontend | Yes |
| `SHOPIFY_CLIENT_ID` / `SHOPIFY_CLIENT_SECRET` | Backend | Optional |
| `ZOHO_CLIENT_ID` / `ZOHO_CLIENT_SECRET` | Backend | Optional |

## n8n Workflow Setup

The Docker Compose starts n8n with a persistent volume. On first run:

1. Open http://localhost:5680 and complete the owner signup
2. Create a **Header Auth credential** — name: `Backend Internal Token`, header: `Authorization`, value: `Bearer <N8N_INTERNAL_TOKEN value>`
3. Import the workflow from `apps/n8n/workflows/order-validation.json` (Import → File)
4. Update HTTP Request node URLs to point at `http://backend:3000` (the Docker service name — all services are on the same Docker network)

When you modify the workflow in the UI:
- Export (three-dot menu → Download) and overwrite `apps/n8n/workflows/order-validation.json`
- Commit it — the JSON file is the source of truth

## CI/CD

`.github/workflows/ci.yml` runs on push/PR to `main`:

| Job | Steps |
|---|---|
| `typecheck` | `turbo typecheck` |
| `lint` | `turbo lint` |
| `test` | `turbo test` (with PostgreSQL service container) |
| `build` | `turbo build` (depends on typecheck + test) |

## Project Structure

```
.
├── apps/
│   ├── backend/           NestJS app
│   │   ├── src/           Source code
│   │   ├── prisma/        Schema + migrations + seed
│   │   └── Dockerfile
│   ├── frontend/          Next.js app
│   │   ├── app/           App Router pages
│   │   ├── components/    UI + domain + pattern components
│   │   ├── features/      Domain feature modules
│   │   └── Dockerfile
│   └── n8n/               Workflow engine
│       ├── workflows/     Exported workflow JSON
│       └── docker-compose.yml (legacy — use root docker-compose)
├── packages/
│   ├── shared-schemas/    Zod schemas
│   └── shared-types/      TypeScript types
├── docker-compose.yml     Full stack orchestration
├── turbo.json             Turborepo pipeline config
├── package.json           Root workspace config
└── .env.example           Environment template
```

## Troubleshooting

**`npm install` fails with workspace errors**
Check that Node.js ≥ 22 and npm ≥ 11 are installed. Run `rm -rf node_modules package-lock.json && npm install` for a clean reinstall.

**Prisma client not found / `@prisma/client` has no exported member**
Run `npm run db:generate` to regenerate the Prisma client. This must be re-run after every `prisma/schema.prisma` change.

**Docker compose won't start — port already in use**
PostgreSQL may already be running on port 5432. Stop the local instance or change the port in `docker-compose.yml`.

**Backend can't reach n8n / n8n can't reach backend**
In Docker Compose mode, use service names (`backend:3000`, `n8n:5678`) instead of `localhost`. The old `host.docker.internal` approach only worked when n8n was Docker-only and the backend ran on the host.

**Backend starts but `GET /health` doesn't respond / immediate crash**
Check that all required environment variables are set (see `.env.example`). The backend fails fast at boot if `CLERK_ISSUER`, `CLERK_SECRET_KEY`, `CLERK_WEBHOOK_SECRET`, `DATABASE_URL`, `CREDENTIALS_ENCRYPTION_KEY`, `APP_BASE_URL`, `FRONTEND_URL`, `N8N_INTERNAL_TOKEN`, or `N8N_BASE_URL` are missing.
