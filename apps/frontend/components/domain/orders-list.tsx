"use client";

import { useState } from "react";

import Link from "next/link";
import { AlertTriangle, Package } from "lucide-react";
import { parseAsString, parseAsStringLiteral, useQueryState } from "nuqs";
import { toast } from "sonner";

import { useBulkUpdateOrderStatus, useOrders } from "@/features/orders/hooks";
import { orderStatusSchema } from "@/features/orders/schemas";
import { mapOrderStatus } from "@/features/orders/status";
import type { Order, OrderStatus } from "@/features/orders/types";

import { usePermission } from "@/hooks/use-permission";

import { formatMoney } from "@/lib/format-money";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StatusBadge } from "@/components/patterns/status-badge";
import { EmptyState } from "@/components/patterns/empty-state";
import { OrderValidationFailureDialog } from "@/components/domain/order-validation-failure-dialog";
import { OVERRIDE_TARGETS } from "@/components/domain/order-status-override";

// "ALL" is a UI-only sentinel — never sent to the backend, which has no
// filter query params at all (both filters below run client-side over the
// already-fetched full list, matching this app's current scale).
const STATUS_FILTER_VALUES = ["ALL", ...orderStatusSchema.options] as const;
type StatusFilterValue = (typeof STATUS_FILTER_VALUES)[number];

function matchesSearch(order: Order, search: string): boolean {
  const q = search.trim().toLowerCase();
  if (!q) return true;
  return (
    order.shopifyOrderId.toLowerCase().includes(q) ||
    (order.customerName?.toLowerCase().includes(q) ?? false) ||
    (order.customerEmail?.toLowerCase().includes(q) ?? false)
  );
}

export function OrdersList({ workspaceSlug }: { workspaceSlug: string }) {
  const { data: orders, isPending, isError, error } = useOrders();
  const canOverride = usePermission("order:override");
  const bulkUpdate = useBulkUpdateOrderStatus();

  const [statusFilter, setStatusFilter] = useQueryState(
    "status",
    parseAsStringLiteral(STATUS_FILTER_VALUES).withDefault("ALL")
  );
  const [search, setSearch] = useQueryState("q", parseAsString.withDefault(""));

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkTarget, setBulkTarget] = useState<OrderStatus | null>(null);

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
      <div className="flex items-start gap-3 rounded-lg border border-status-failed/30 bg-status-failed-bg px-4 py-3e text-status-failed">
        <AlertTriangle className="mt-0.5 size-4 shrink-0" />
        <div>
          <p className="font-medium">Couldn&apos;t load orders</p>
          <p className="text-status-failed/80">{error instanceof Error ? error.message : "Unknown error"}</p>
        </div>
      </div>
    );
  }

  if (orders.length === 0) {
    return (
      <EmptyState
        icon={Package}
        title="No orders yet"
        description="Connect Shopify to start seeing orders flow through validation, inventory, and shipment."
      />
    );
  }

  const filtered = orders
    .filter((order) => statusFilter === "ALL" || order.status === statusFilter)
    .filter((order) => matchesSearch(order, search));

  function toggleAll() {
    setSelected((prev) => (prev.size === filtered.length ? new Set() : new Set(filtered.map((o) => o.id))));
  }

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function applyBulk() {
    if (!bulkTarget || selected.size === 0) return;
    const ids = Array.from(selected);

    bulkUpdate.mutate(
      { ids, status: bulkTarget },
      {
        onSuccess: ({ succeeded, failed }) => {
          if (failed === 0) {
            toast.success(`Updated ${succeeded} order${succeeded === 1 ? "" : "s"}.`);
          } else {
            toast.error(`Updated ${succeeded} of ${succeeded + failed} orders — ${failed} failed.`);
          }
          setSelected(new Set());
          setBulkTarget(null);
        },
        onError: () => toast.error("Couldn't update the selected orders — try again."),
      }
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          placeholder="Search order # or customer…"
          value={search}
          onChange={(e) => setSearch(e.target.value || null)}
          className="w-64"
        />
        <Select
          value={statusFilter}
          onValueChange={(value) => setStatusFilter(value as StatusFilterValue)}
        >
          <SelectTrigger className="w-44">
            <SelectValue placeholder="All statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All statuses</SelectItem>
            {orderStatusSchema.options.map((status) => (
              <SelectItem
                key={status}
                value={status}
              >
                {status}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {canOverride && selected.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/50 px-3 py-2">
          <span className="font-medium">{selected.size} selected</span>
          <Select
            value={bulkTarget ?? undefined}
            onValueChange={(value) => setBulkTarget(value as OrderStatus)}
          >
            <SelectTrigger className="w-40">
              <SelectValue placeholder="New status" />
            </SelectTrigger>
            <SelectContent>
              {OVERRIDE_TARGETS.map((status) => (
                <SelectItem
                  key={status}
                  value={status}
                >
                  {status}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            size="sm"
            disabled={!bulkTarget || bulkUpdate.isPending}
            onClick={applyBulk}
          >
            {bulkUpdate.isPending ? "Applying…" : `Apply to ${selected.size} order${selected.size === 1 ? "" : "s"}`}
          </Button>
        </div>
      )}

      {filtered.length === 0 ? (
        <EmptyState
          icon={Package}
          title="No matching orders"
          description="Try a different status filter or search term."
        />
      ) : (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                {canOverride && (
                  <TableHead className="w-10">
                    <Checkbox
                      checked={selected.size > 0 && selected.size === filtered.length}
                      indeterminate={selected.size > 0 && selected.size < filtered.length}
                      onCheckedChange={toggleAll}
                      aria-label="Select all orders"
                    />
                  </TableHead>
                )}
                <TableHead>Order</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead className="text-right">Date</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((order) => {
                const { tone, label } = mapOrderStatus(order.status);
                return (
                  <TableRow key={order.id}>
                    {canOverride && (
                      <TableCell>
                        <Checkbox
                          checked={selected.has(order.id)}
                          onCheckedChange={() => toggleOne(order.id)}
                          aria-label={`Select order #${order.shopifyOrderId}`}
                        />
                      </TableCell>
                    )}
                    <TableCell>
                      <Link
                        href={`/${workspaceSlug}/orders/${order.id}`}
                        className="font-medium hover:underline"
                      >
                        #{order.shopifyOrderId}
                      </Link>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{order.customerName ?? order.customerEmail ?? "—"}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <StatusBadge
                          tone={tone}
                          label={label}
                        />
                        {order.status === "VALIDATION_FAILED" && <OrderValidationFailureDialog order={order} />}
                      </div>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{formatMoney(order.totalAmount, order.currency)}</TableCell>
                    <TableCell className="text-right text-muted-foreground">{new Date(order.createdAt).toLocaleDateString()}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
