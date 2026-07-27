"use client";

import { AlertTriangle, History, Lock } from "lucide-react";

import { useAuditLog } from "@/features/audit-log/hooks";
import type { AuditLogEntry } from "@/features/audit-log/types";

import { usePermission } from "@/hooks/use-permission";

import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState } from "@/components/patterns/empty-state";

function actorLabel(entry: AuditLogEntry): string {
  return entry.user?.name ?? entry.user?.email ?? "System";
}

export function AuditLogList() {
  const canRead = usePermission("audit:read");
  const { data, isPending, isError, error } = useAuditLog();

  // Hide-not-disable, same convention as the single-item permission gates
  // elsewhere (order-status-override.tsx, integration-detail.tsx) — a
  // Viewer/Operator never sees this content at all, not a disabled version
  // of it. The route itself has no server-side redirect; the backend's own
  // @RequirePermission('audit:read') is the real enforcement.
  if (!canRead) {
    return (
      <EmptyState
        icon={Lock}
        title="Restricted"
        description="Only the workspace Owner and Admins can view the audit log."
      />
    );
  }

  if (isPending) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton
            key={i}
            className="h-11 rounded-lg"
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
          <p className="font-medium">Couldn&apos;t load the audit log</p>
          <p className="text-status-failed/80">{error instanceof Error ? error.message : "Unknown error"}</p>
        </div>
      </div>
    );
  }

  if (data.items.length === 0) {
    return (
      <EmptyState
        icon={History}
        title="No activity yet"
        description="Member changes, order overrides, and integration connects will show up here as they happen."
      />
    );
  }

  return (
    <div className="rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>When</TableHead>
            <TableHead>Actor</TableHead>
            <TableHead>Action</TableHead>
            <TableHead>Resource</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.items.map((entry) => (
            <TableRow key={entry.id}>
              <TableCell className="text-muted-foreground">{new Date(entry.createdAt).toLocaleString()}</TableCell>
              <TableCell>{actorLabel(entry)}</TableCell>
              <TableCell className="font-medium">{entry.action}</TableCell>
              <TableCell className="text-muted-foreground">
                {entry.resourceType}
                {entry.resourceId ? ` #${entry.resourceId.slice(-8)}` : ""}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
