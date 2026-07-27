"use client";

import { AlertTriangle, Bell } from "lucide-react";

import { useMarkNotificationRead, useNotifications } from "@/features/notifications/hooks";
import type { Notification } from "@/features/notifications/types";

import { cn } from "@/lib/utils";

import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/patterns/empty-state";

function NotificationRow({ notification, onRead }: { notification: Notification; onRead: (id: string) => void }) {
  const unread = notification.readAt === null;

  return (
    <li>
      <button
        type="button"
        onClick={() => unread && onRead(notification.id)}
        className={cn(
          "flex w-full items-start justify-between gap-3 rounded-lg border bg-card px-3 py-2.5 text-left transition-colors hover:bg-muted/50",
          unread && "border-l-2 border-l-primary"
        )}
      >
        <span className="flex items-start gap-2">
          {unread && <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-primary" aria-hidden="true" />}
          <span className={cn(unread ? "font-medium" : "text-muted-foreground")}>{notification.message}</span>
        </span>
        <span className="shrink-0 text-muted-foreground">{new Date(notification.createdAt).toLocaleString()}</span>
      </button>
    </li>
  );
}

export function NotificationsList() {
  const { data, isPending, isError, error } = useNotifications();
  const markRead = useMarkNotificationRead();

  if (isPending) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton
            key={i}
            className="h-14 rounded-lg"
          />
        ))}
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex items-start gap-3 rounded-lg border border-status-failed/30 bg-status-failed-bg px-4 py-3 text-status-failed">
        <AlertTriangle className="mt-0.5 size-4 shrink-0" />
        <div>
          <p className="font-medium">Couldn&apos;t load notifications</p>
          <p className="text-status-failed/80">{error instanceof Error ? error.message : "Unknown error"}</p>
        </div>
      </div>
    );
  }

  if (data.items.length === 0) {
    return (
      <EmptyState
        icon={Bell}
        title="No notifications yet"
        description="Run failures and integration alerts will show up here as they happen."
      />
    );
  }

  const sorted = [...data.items].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  return (
    <ol className="space-y-2">
      {sorted.map((notification) => (
        <NotificationRow
          key={notification.id}
          notification={notification}
          onRead={(id) => markRead.mutate(id)}
        />
      ))}
    </ol>
  );
}
