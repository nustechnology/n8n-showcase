"use client";

import { useEffect, useRef } from "react";

import { useAuth, useOrganization } from "@clerk/nextjs";
import { EventStreamContentType, fetchEventSource } from "@microsoft/fetch-event-source";

class FatalError extends Error {}

const API_URL = process.env.NEXT_PUBLIC_API_URL;

const SSE_RECONNECT_MS = 5_000;

export function useEventStream(path: string | null, onMessage: (event: MessageEvent) => void) {
  const { getToken } = useAuth();
  const { organization } = useOrganization();
  const onMessageRef = useRef(onMessage);

  useEffect(() => {
    onMessageRef.current = onMessage;
  });

  useEffect(() => {
    if (!path || !API_URL) return;

    const controller = new AbortController();

    const buildHeaders = async () => {
      const token = await getToken({ skipCache: true });
      return {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(organization?.id ? { "X-Workspace-Id": organization.id } : {}),
      };
    };

    fetchEventSource(`${API_URL}${path}`, {
      signal: controller.signal,
      openWhenHidden: true,
      async fetch(input, init) {
        const headers = await buildHeaders();
        return fetch(input, {
          ...init,
          headers: {
            ...(init?.headers as Record<string, string> ?? {}),
            ...headers,
          },
        });
      },
      onmessage(event) {
        onMessageRef.current(event as unknown as MessageEvent);
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
        return SSE_RECONNECT_MS;
      },
    });

    return () => controller.abort();
  }, [path, getToken, organization?.id]);
}
