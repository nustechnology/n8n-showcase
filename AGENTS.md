# AGENTS.md

This is a turborepo monorepo using npm workspaces. Key conventions for AI
tooling and contributors:

## Monorepo Structure

```
apps/backend/     @n8n-showcase/backend   (NestJS + Prisma, port 3000)
apps/frontend/    @n8n-showcase/frontend  (Next.js 16, port 3001)
apps/n8n/         @n8n-showcase/n8n       (n8n Docker, port 5680)
packages/shared-schemas/  @n8n-showcase/shared-schemas
packages/shared-types/    @n8n-showcase/shared-types
packages/shared-config/   shared tsconfig base
```

## Commands

Never run npm commands from within an app directory. Always from root:

```bash
npm run dev        # turbo dev (all apps)
npm run build      # turbo build
npm run typecheck  # turbo typecheck
npm run test       # turbo test
npm run lint       # turbo lint
```

To add a package in an app, run from root:
```bash
npm install <pkg> -w @n8n-showcase/backend
```

## Shared Schemas

Zod schemas go in `packages/shared-schemas/src/`, never in app-specific
directories. Both BE and FE import from `@n8n-showcase/shared-schemas`.

- Enum schemas → `packages/shared-schemas/src/enums.ts`
- Connect/request DTOs → `packages/shared-schemas/src/connect-schemas.ts`
- Member schema → `packages/shared-schemas/src/member-schemas.ts`
- Tenant schema → `packages/shared-schemas/src/tenant-schemas.ts`

After adding a schema, run `npm run build` to compile the shared package.

## Prisma

The Prisma schema lives at `apps/backend/prisma/schema.prisma`. After any
schema change:
```bash
npm run db:generate    # update Prisma client types
```

For migrations (from `apps/backend` dir):
```bash
npx prisma migrate dev --name <name>
```

## Docker

Root `docker-compose.yml` orchestrates all 4 services. Build:
```bash
npm run docker:build
```

## Dependencies between apps

Each app must declare its shared package dependencies in its own
`package.json`. This is required for turbo's `^build` resolution:

- `apps/backend/package.json` → `"@n8n-showcase/shared-schemas": "*"`
- `apps/frontend/package.json` → `"@n8n-showcase/shared-schemas": "*"` + `"@n8n-showcase/shared-types": "*"`
