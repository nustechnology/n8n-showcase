"use client";

import Link from "next/link";
import { Plug } from "lucide-react";

import { useIntegrations } from "@/features/integrations/hooks";
import { useOrders } from "@/features/orders/hooks";
import { useWorkflowRuns } from "@/features/workflows/hooks";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { StatTile } from "@/components/patterns/stat-tile";
import { EmptyState } from "@/components/patterns/empty-state";
import { ActivityFeed } from "@/components/domain/activity-feed";

function isToday(iso: string): boolean {
  const d = new Date(iso);
  const now = new Date();
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
}

function isWithinLast24h(iso: string): boolean {
  return Date.now() - new Date(iso).getTime() <= 24 * 60 * 60 * 1000;
}

// The dashboard aggregates stats over the recent set rather than paginating
// — mirrors the backend's old MAX_ORDERS_RETURNED/MAX_WORKFLOW_RUNS_RETURNED
// caps, now expressed as an explicit `take` override on the paginated hooks.
const DASHBOARD_SAMPLE_SIZE = 100;

export function DashboardOverview({ workspaceSlug }: { workspaceSlug: string }) {
  const integrations = useIntegrations();
  const orders = useOrders({ page: 1, take: DASHBOARD_SAMPLE_SIZE });
  const runs = useWorkflowRuns({ page: 1, take: DASHBOARD_SAMPLE_SIZE });

  const loading = integrations.isPending || orders.isPending || runs.isPending;

  const ordersToday = orders.data?.items.filter((o) => isToday(o.createdAt)).length ?? 0;
  const activeRuns = runs.data?.items.filter((r) => r.status === "PENDING" || r.status === "RUNNING").length ?? 0;
  const needsAttention = integrations.data?.filter((i) => i.status === "DEGRADED" || i.status === "ERROR").length ?? 0;

  const recentRuns =
    runs.data?.items.filter((r) => isWithinLast24h(r.startedAt) && (r.status === "SUCCEEDED" || r.status === "FAILED")) ?? [];
  const successRate24h =
    recentRuns.length === 0 ? "—" : `${Math.round((recentRuns.filter((r) => r.status === "SUCCEEDED").length / recentRuns.length) * 100)}%`;

  const hasActiveIntegration = integrations.data?.some((i) => i.status === "ACTIVE") ?? false;
  const hasOrders = (orders.data?.total ?? 0) > 0;

  return (
    <div className="space-y-6">
      {loading ? (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton
              key={i}
              className="h-18.5 rounded-lg"
            />
          ))}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <StatTile
              label="Orders today"
              value={String(ordersToday)}
            />
            <StatTile
              label="Active runs"
              value={String(activeRuns)}
            />
            <StatTile
              label="24h success rate"
              value={successRate24h}
            />
            <StatTile
              label="Needs attention"
              value={String(needsAttention)}
              tone={needsAttention > 0 ? "warning" : "neutral"}
            />
          </div>

          {!hasActiveIntegration ? (
            <EmptyState
              icon={Plug}
              title="Connect your first integration"
              description="Link your Shopify store to start seeing orders flow through validation, inventory, and shipment."
              action={
                <Button
                  nativeButton={false}
                  render={<Link href={`/${workspaceSlug}/integrations`}>Connect an integration</Link>}
                />
              }
            />
          ) : !hasOrders ? (
            <EmptyState
              icon={Plug}
              title="Connected — waiting on your first order"
              description="Shopify is connected. Orders will start appearing here as soon as one comes in."
            />
          ) : null}
        </>
      )}

      <section className="space-y-3">
        <h2 className="font-semibold">Live activity</h2>
        <ActivityFeed />
      </section>
    </div>
  );
}
