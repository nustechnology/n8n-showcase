FROM node:22-alpine AS builder

RUN apk add --no-cache openssl

WORKDIR /app

COPY package.json package-lock.json turbo.json ./
COPY packages/shared-schemas/package.json packages/shared-schemas/
COPY packages/shared-types/package.json packages/shared-types/
COPY apps/backend/package.json apps/backend/

RUN npm install

COPY packages/shared-schemas/tsconfig.json packages/shared-schemas/
COPY packages/shared-schemas/src/ packages/shared-schemas/src/
COPY packages/shared-types/tsconfig.json packages/shared-types/
COPY packages/shared-types/src/ packages/shared-types/src/
COPY apps/backend/tsconfig.json apps/backend/
COPY apps/backend/tsconfig.build.json apps/backend/
COPY apps/backend/nest-cli.json apps/backend/
COPY apps/backend/prisma/ apps/backend/prisma/
COPY apps/backend/src/ apps/backend/src/

ENV DATABASE_URL=postgresql://placeholder:placeholder@localhost:5432/postgres

RUN npx turbo prisma:generate --filter=@n8n-showcase/backend
RUN npx turbo build --filter=@n8n-showcase/backend

FROM node:22-alpine AS production

RUN apk add --no-cache openssl

WORKDIR /app

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json /app/package-lock.json ./
COPY --from=builder /app/packages/shared-schemas/dist ./packages/shared-schemas/dist
COPY --from=builder /app/packages/shared-schemas/package.json ./packages/shared-schemas/
COPY --from=builder /app/apps/backend/dist ./apps/backend/dist
COPY --from=builder /app/apps/backend/prisma ./apps/backend/prisma
COPY --from=builder /app/apps/backend/package.json ./apps/backend/

ENV NODE_ENV=production
EXPOSE 3000

CMD ["node", "apps/backend/dist/main.js"]
