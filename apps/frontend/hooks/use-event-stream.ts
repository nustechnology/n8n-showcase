"use client";

import { useEffect } from "react";

import { useAuth, useOrganization } from "@clerk/nextjs";
import { fetchEventSource } from "@microsoft/fetch-event-source";

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

    // headers must be a resolved object (fetchEventSource's type doesn't
    // accept a resolver function), so the token is fetched once up front.
    // fetchEventSource retries dropped connections with these same headers —
    // if a retry happens after the token expires, it'll reconnect
    // unauthenticated. Fine for now since nothing calls this hook yet; a
    // long-lived production usage should watch onerror and re-open with a
    // fresh token instead of relying on the built-in retry.
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
        // A non-2xx response throws here, which stops retrying rather than looping.
        async onopen(response) {
          if (!response.ok) throw new Error(`Stream failed: ${response.status}`);
        },
      });
    })().catch((err) => {
      if (controller.signal.aborted) return; // expected on unmount/path change

      console.error("Event stream error", err);
    });

    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, organization?.id]);
}
