import { mapRunStatus, type StatusTone } from "@/lib/status";
import type { OrderStatus } from "./types";

/** Shared by OrdersList and OrderDetail so the two views can't drift on how a given Order.status renders. */
export function mapOrderStatus(status: OrderStatus) {
  switch (status) {
    case "COMPLETED":
    case "FULFILLED":
    case "NOTIFIED":
      return mapRunStatus("SUCCEEDED");
    case "FAILED":
    case "VALIDATION_FAILED":
      return mapRunStatus("FAILED");
    case "CANCELED":
      return mapRunStatus("CANCELED");
    case "VALIDATING":
    case "VALIDATED":
    case "INVENTORY_CHECKED":
    case "SHIPMENT_CREATED":
      return mapRunStatus("RUNNING");
    case "RECEIVED":
    default:
      return mapRunStatus("PENDING");
  }
}

/**
 * The `reason` n8n sends on an `order_failed` OrderEvent — a circuit trip is
 * transient and not the tenant's fault, distinct from the three hard
 * pipeline failures, hence its own "degraded" tone rather than "failed".
 */
export function mapFailureReason(reason: string): { tone: StatusTone; label: string } {
  switch (reason) {
    case "circuit_open":
      return { tone: "degraded", label: "Temporarily unavailable" };
    case "insufficient_stock":
      return { tone: "failed", label: "Out of stock" };
    case "shipment_creation_failed":
      return { tone: "failed", label: "Shipment failed" };
    case "shopify_update_failed":
      return { tone: "failed", label: "Shopify update failed" };
    default:
      return { tone: "failed", label: reason };
  }
}
