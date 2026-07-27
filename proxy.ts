import { clerkMiddleware } from "@clerk/nextjs/server";

// Next.js 16 renamed the middleware.ts convention to proxy.ts; behavior is
// unchanged. clerkMiddleware() is still required here for Clerk to work at
// all (session sync, its own frontend-API proxy route below) — but
// path-matcher-based auth gating (createRouteMatcher) is deprecated by
// Clerk in favor of resource-based checks. Each protected layout/page now
// calls auth.protect() itself: see app/[workspaceSlug]/layout.tsx and
// app/(onboarding)/*/page.tsx.
export default clerkMiddleware();

export const config = {
  matcher: [
    // Skip Next.js internals and all static files, unless found in search params
    "/((?!_next|.*\\.(?:png|jpg|jpeg|svg|ico|css|js|woff2?)$).*)",
    // Always run for Clerk's auto-proxy path
    "/__clerk/:path*",
  ],
};
