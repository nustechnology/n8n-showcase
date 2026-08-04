"use client";

import { useCallback } from "react";

import { useAuth, useOrganization } from "@clerk/nextjs";
import { toast } from "sonner";

import { ApiError } from "@/lib/api-error";

const API_URL = process.env.NEXT_PUBLIC_API_URL;

export type ApiFetch = <T>(path: string, init?: RequestInit) => Promise<T>;

// Exact text of the 403 Clerk's session-vs-membership gap produces (backend
// API contract §1.1) — checked verbatim rather than retrying every 403,
// since most 403s (role lacks permission, workspace not ACTIVE) are genuine
// and retrying them would just fail the same way again.
//
// NOTE: this message can also appear for a reason no frontend retry can fix.
// Decoding an actual rejected token found `{ o: { id, slg, rol } }` — Clerk's
// newer compact session-token claim shape — with no top-level org_id at all.
// If the backend's Clerk SDK reads `payload.org_id` directly instead of
// through the SDK's own auth() helper, every request 403s this way
// regardless of how fresh the token is. Confirmed via decoding a live
// rejected token on 2026-07-10; if this recurs, check that first before
// assuming it's a frontend timing issue again.
const NO_ACTIVE_WORKSPACE_MESSAGE = "No active workspace selected for this session";

/**
 * NestJS treats X-Workspace-Id as a checked hint against the JWT's own org
 * claim, not the tenant source of truth — a stale header after an org switch
 * gets a 400 (integration contract §1). getToken() mints a fresh token
 * against Clerk's current active org, so a single retry with skipCache
 * covers the brief window right after switching workspaces — including the
 * 403 variant of the same staleness (see NO_ACTIVE_WORKSPACE_MESSAGE above).
 */
export function useApiClient(): ApiFetch {
  const { getToken } = useAuth();
  const { organization } = useOrganization();

  return useCallback(
    async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
      if (!API_URL) {
        throw new Error("NEXT_PUBLIC_API_URL is not configured — see .env.example");
      }

      const request = async (skipCache: boolean) => {
        const token = await getToken(skipCache ? { skipCache: true } : undefined);
        const res = await fetch(`${API_URL}${path}`, {
          ...init,
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
            ...(organization?.id ? { "X-Workspace-Id": organization.id } : {}),
            ...init?.headers,
          },
        });
        // Parse via text first: some endpoints return 200 with an empty body
        // (e.g. POST /integrations/:provider/test), not just 204, and
        // `res.json()` throws on an empty string.
        const raw = await res.text();
        let body: Record<string, unknown> | undefined;
        if (raw) {
          try {
            body = JSON.parse(raw);
          } catch {
            // non-JSON response — treat as raw text message
            body = { message: raw };
          }
        }
        return { res, body };
      };

      let { res, body } = await request(false);

      const isStaleTokenError =
        res.status === 401 || (res.status === 403 && body?.message === NO_ACTIVE_WORKSPACE_MESSAGE);
      if (isStaleTokenError) {
        ({ res, body } = await request(true));
      }

      if (!res.ok) {
        const error = new ApiError(
          res.status,
          (body?.message as string | undefined) ?? res.statusText,
          body,
          body?.error as string | undefined,
          body?.retryAfterMs as number | undefined,
        );

        // Fixed here, at the one place every request passes through, rather
        // than in each mutation's onError — a 429 isn't specific to any one
        // call site (backend Phase 4 contract).
        if (error.errorCode === "TooManyRequests") {
          toast.error("You're doing that a bit fast — try again in a few seconds");
        }

        throw error;
      }

      return body as T;
    },
    // Depend on `organization` itself, not `.id` — the linter's react-hooks
    // rule (from eslint-plugin-react-hooks, shipped by default even without
    // the React Compiler runtime enabled) infers the coarser dependency and
    // flags a mismatch otherwise.
    [getToken, organization]
  );
}
