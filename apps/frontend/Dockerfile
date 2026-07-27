FROM node:22-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json turbo.json ./
COPY packages/shared-schemas/package.json packages/shared-schemas/
COPY packages/shared-types/package.json packages/shared-types/
COPY apps/frontend/package.json apps/frontend/

RUN npm install

COPY packages/shared-schemas/tsconfig.json packages/shared-schemas/
COPY packages/shared-schemas/src/ packages/shared-schemas/src/
COPY packages/shared-types/tsconfig.json packages/shared-types/
COPY packages/shared-types/src/ packages/shared-types/src/
COPY apps/frontend/tsconfig.json apps/frontend/
COPY apps/frontend/next.config.ts apps/frontend/
COPY apps/frontend/components.json apps/frontend/
COPY apps/frontend/postcss.config.mjs apps/frontend/
COPY apps/frontend/eslint.config.mjs apps/frontend/
COPY apps/frontend/public/ apps/frontend/public/
COPY apps/frontend/app/ apps/frontend/app/
COPY apps/frontend/components/ apps/frontend/components/
COPY apps/frontend/features/ apps/frontend/features/
COPY apps/frontend/hooks/ apps/frontend/hooks/
COPY apps/frontend/lib/ apps/frontend/lib/

RUN npx turbo build --filter=@n8n-showcase/frontend

FROM node:22-alpine AS production

WORKDIR /app

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./
COPY --from=builder /app/packages/shared-schemas/dist ./packages/shared-schemas/dist
COPY --from=builder /app/packages/shared-schemas/package.json ./packages/shared-schemas/
COPY --from=builder /app/packages/shared-types/dist ./packages/shared-types/dist
COPY --from=builder /app/packages/shared-types/package.json ./packages/shared-types/
COPY --from=builder /app/apps/frontend/.next ./apps/frontend/.next
COPY --from=builder /app/apps/frontend/public ./apps/frontend/public
COPY --from=builder /app/apps/frontend/package.json ./apps/frontend/
COPY --from=builder /app/apps/frontend/next.config.ts ./apps/frontend/

ENV NODE_ENV=production
ENV PORT=3001

EXPOSE 3001

CMD ["node_modules/.bin/next", "start", "-p", "3001"]
