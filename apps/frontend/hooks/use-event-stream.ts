"use client";

import { useEffect } from "react";

import { useAuth, useOrganization } from "@clerk/nextjs";
import { EventStreamContentType, fetchEventSource } from "@microsoft/fetch-event-source";

class RetriableError extends Error {}
class FatalError extends Error {}

const API_URL = process.env.NEXT_PUBLIC_API_URL;

/**
 * Backs the two SSE endpoints from the integration contract §7 —
 * GET /workflow-runs/:id/stream and GET /tenants/:id/activity/stream — both
 * authenticated with the same Clerk Bearer token as REST. Native EventSource
 * can't send an Authorization header, so this uses fetchEventSource instead
 * of `new EventSource(url)`, which would silently connect unauthenticated.
 */
export function useEventStream(path: string | null, onMessage: (event: MessageEvent) => void) {
  const { getToken } = useAuth();
  const { organization } = useOrganization();

  useEffect(() => {
    if (!path || !API_URL) return;

    const controller = new AbortController();

    (async () => {
      const token = await getToken();
      await fetchEventSource(`${API_URL}${path}`, {
        signal: controller.signal,
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(organization?.id ? { "X-Workspace-Id": organization.id } : {}),
        },
        onmessage(event) {
          onMessage(event as unknown as MessageEvent);
        },
        async onopen(response) {
          if (response.ok && response.headers.get("content-type")?.startsWith(EventStreamContentType)) return;

          const status = response.status;
          throw new FatalError(
            status === 401 || status === 403
              ? `Unauthorized — token likely expired (HTTP ${status})`
              : `Stream failed (HTTP ${status})`,
          );
        },
        onerror(err) {
          if (err instanceof FatalError) throw err;
          throw new RetriableError();
        },
      });
    })().catch((err) => {
      if (controller.signal.aborted) return;

      if (err instanceof FatalError) return;

      console.error("Event stream error", err);
    });

    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, organization?.id]);
}
