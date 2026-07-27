"use client";

import { useState } from "react";

import { useOrganization } from "@clerk/nextjs";

import { useEventStream } from "@/hooks/use-event-stream";

interface ActivityItem {
  id: string;
  label: string;
  timestamp: string;
}

const MAX_ITEMS = 20;

// The activity stream's event payload isn't pinned down by a schema yet (no
// GET list endpoint to shape it against, only the SSE stream itself) — this
// reads opportunistically off common fields so an unexpected shape degrades
// to a generic line instead of breaking the feed.
function describeActivityEvent(payload: Record<string, unknown>): string {
  if (typeof payload.message === "string") return payload.message;
  if (typeof payload.eventType === "string") return payload.eventType.replace(/_/g, " ");
  return "Activity update";
}

/** Backs the dashboard's live activity panel — GET /tenants/:id/activity/stream (backend API contract §7), useEventStream's other real call site alongside the run-detail page. */
export function ActivityFeed() {
  const { organization } = useOrganization();
  const [items, setItems] = useState<ActivityItem[]>([]);

  useEventStream(organization ? `/tenants/${organization.id}/activity/stream` : null, (event) => {
    let parsed: unknown = null;
    try {
      parsed = JSON.parse(event.data);
    } catch {
      // fall through to the generic line below
    }
    const payload = parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
    const id = typeof payload.id === "string" ? payload.id : crypto.randomUUID();
    const timestamp = typeof payload.createdAt === "string" ? payload.createdAt : new Date().toISOString();

    setItems((prev) => [{ id, label: describeActivityEvent(payload), timestamp }, ...prev].slice(0, MAX_ITEMS));
  });

  if (items.length === 0) {
    return <p className="text-muted-foreground">No activity yet — updates will appear here in real time.</p>;
  }

  return (
    <ol className="space-y-2">
      {items.map((item) => (
        <li
          key={item.id}
          className="flex items-center justify-between rounded-lg border bg-card px-3 py-2"
        >
          <span>{item.label}</span>
          <span className="text-muted-foreground">{new Date(item.timestamp).toLocaleTimeString()}</span>
        </li>
      ))}
    </ol>
  );
}
