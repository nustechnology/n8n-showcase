"use client";

import { notFound } from "next/navigation";
import { AlertTriangle } from "lucide-react";

import { useOrder, useOrderTimeline } from "@/features/orders/hooks";
import { mapFailureReason, mapOrderStatus } from "@/features/orders/status";

import { formatMoney } from "@/lib/format-money";
import { ApiError } from "@/lib/api-error";

import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/patterns/page-header";
import { StatusBadge } from "@/components/patterns/status-badge";
import { OrderStatusPipeline } from "@/components/domain/order-status-pipeline";
import { OrderStatusOverride } from "@/components/domain/order-status-override";

export function OrderDetail({ orderId }: { orderId: string }) {
  const order = useOrder(orderId);
  const timeline = useOrderTimeline(orderId);

  if (order.error instanceof ApiError && order.error.statusCode === 404) {
    notFound();
  }

  if (order.isPending) {
    return (
      <div className="space-y-4 p-6 sm:p-8">
        <Skeleton className="h-32 rounded-lg" />
        <Skeleton className="h-24 rounded-lg" />
      </div>
    );
  }

  if (order.isError) {
    return (
      <div className="flex items-start gap-3 rounded-lg border border-status-failed/30 bg-status-failed-bg px-4 py-3 text-status-failed m-6 sm:m-8">
        <AlertTriangle className="mt-0.5 size-4 shrink-0" />
        <p>Couldn&apos;t load this order — {order.error instanceof Error ? order.error.message : "unknown error"}.</p>
      </div>
    );
  }

  const data = order.data;
  const { tone, label } = mapOrderStatus(data.status);

  return (
    <>
      <PageHeader
        title={`Order #${data.shopifyOrderId}`}
        action={
          <StatusBadge
            tone={tone}
            label={label}
          />
        }
      />
      <div className="max-w-2xl space-y-6 p-6 sm:p-8">
        <section className="rounded-lg border bg-card p-4">
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2">
            <dt className="text-muted-foreground">Customer</dt>
            <dd>{data.customerName ?? "—"}</dd>
            <dt className="text-muted-foreground">Email</dt>
            <dd>{data.customerEmail ?? "—"}</dd>
            <dt className="text-muted-foreground">Total</dt>
            <dd className="tabular-nums">{formatMoney(data.totalAmount, data.currency)}</dd>
            <dt className="text-muted-foreground">Received</dt>
            <dd>{new Date(data.createdAt).toLocaleString()}</dd>
          </dl>
        </section>

        <section className="space-y-3">
          <h2 className="font-semibold">Pipeline</h2>
          <OrderStatusPipeline status={data.status} />
        </section>

        <OrderStatusOverride order={data} />

        <section className="space-y-3">
          <h2 className="font-semibold">Activity</h2>
          {timeline.isPending ? (
            <Skeleton className="h-16 rounded-lg" />
          ) : timeline.isError ? (
            <p className="text-muted-foreground">Couldn&apos;t load activity.</p>
          ) : (
            <ol className="space-y-2">
              {timeline.data.map((event) => {
                const reason = typeof event.payload?.reason === "string" ? event.payload.reason : null;
                const failureBadge = event.eventType === "order_failed" && reason ? mapFailureReason(reason) : null;

                return (
                  <li
                    key={event.id}
                    className="flex items-center justify-between rounded-lg border bg-card px-3 py-2"
                  >
                    <span className="flex items-center gap-2">
                      {event.eventType.replace(/_/g, " ")}
                      {failureBadge && (
                        <StatusBadge
                          tone={failureBadge.tone}
                          label={failureBadge.label}
                        />
                      )}
                      {event.eventType === "manual_override" && reason && (
                        <span className="text-xs text-muted-foreground">— {reason}</span>
                      )}
                    </span>
                    <span className="text-muted-foreground">{new Date(event.createdAt).toLocaleString()}</span>
                  </li>
                );
              })}
            </ol>
          )}
        </section>
      </div>
    </>
  );
}
