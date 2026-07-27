"use client";

import { useState } from "react";

import { toast } from "sonner";

import { useUpdateOrderStatus } from "@/features/orders/hooks";
import type { Order, OrderStatus } from "@/features/orders/types";

import { usePermission } from "@/hooks/use-permission";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

// Backend API contract §3 — PATCH /orders/:id/status only accepts these four
// targets; anything else 400s. Not a generic "fix it" control. Exported so
// the bulk override toolbar (orders-list.tsx) offers the exact same set,
// not a second hand-maintained list.
export const OVERRIDE_TARGETS: OrderStatus[] = ["FULFILLED", "NOTIFIED", "COMPLETED", "CANCELED"];

export function OrderStatusOverride({ order }: { order: Order }) {
  const canOverride = usePermission("order:override");
  const updateStatus = useUpdateOrderStatus(order.id);
  const [target, setTarget] = useState<OrderStatus | null>(null);
  const [reason, setReason] = useState("");

  if (!canOverride) return null;

  function handleSubmit() {
    if (!target) return;

    updateStatus.mutate(
      { status: target, reason: reason.trim() || undefined },
      {
        onSuccess: () => {
          toast.success("Order status updated.");
          setTarget(null);
          setReason("");
        },
        onError: () => toast.error("Couldn't update order status — try again."),
      }
    );
  }

  return (
    <section className="space-y-3 rounded-lg border bg-card p-4">
      <h2 className="font-semibold">Override status</h2>
      <div className="flex flex-wrap items-end gap-2">
        <Select
          value={target ?? undefined}
          onValueChange={(value) => setTarget(value as OrderStatus)}
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
        <Input
          placeholder="Reason (optional)"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          className="w-56"
        />
        <Button
          size="sm"
          disabled={!target || updateStatus.isPending}
          onClick={handleSubmit}
        >
          {updateStatus.isPending ? "Updating…" : "Apply"}
        </Button>
      </div>
    </section>
  );
}
