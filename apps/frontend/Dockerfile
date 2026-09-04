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
COPY apps/frontend/proxy.ts apps/frontend/proxy.ts
COPY apps/frontend/components/ apps/frontend/components/
COPY apps/frontend/features/ apps/frontend/features/
COPY apps/frontend/hooks/ apps/frontend/hooks/
COPY apps/frontend/lib/ apps/frontend/lib/

ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
ARG NEXT_PUBLIC_CLERK_SIGN_IN_URL
ARG NEXT_PUBLIC_CLERK_SIGN_UP_URL
ARG NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL
ARG NEXT_PUBLIC_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL
ARG NEXT_PUBLIC_GEOAPIFY_API_KEY

ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}
ENV NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=${NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY}
ENV NEXT_PUBLIC_CLERK_SIGN_IN_URL=${NEXT_PUBLIC_CLERK_SIGN_IN_URL}
ENV NEXT_PUBLIC_CLERK_SIGN_UP_URL=${NEXT_PUBLIC_CLERK_SIGN_UP_URL}
ENV NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL=${NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL}
ENV NEXT_PUBLIC_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL=${NEXT_PUBLIC_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL}
ENV NEXT_PUBLIC_GEOAPIFY_API_KEY=${NEXT_PUBLIC_GEOAPIFY_API_KEY}

RUN npx turbo build --filter=@n8n-showcase/frontend

FROM node:22-alpine AS production

RUN addgroup -g 1001 -S nodejs && adduser -S nextjs -u 1001

WORKDIR /app

COPY --from=builder --chown=nextjs:nodejs /app/apps/frontend/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/apps/frontend/.next/static ./apps/frontend/.next/static
COPY --from=builder --chown=nextjs:nodejs /app/apps/frontend/public ./apps/frontend/public

ENV NODE_ENV=production
ENV PORT=3001

EXPOSE 3001

USER nextjs

CMD ["node", "apps/frontend/server.js"]
