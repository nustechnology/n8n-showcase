import type { ApiFetch } from "@/hooks/use-api-client";

import { orderSchema, orderTimelineResponseSchema, ordersResponseSchema } from "./schemas";
import type { OrderStatus } from "./types";

export interface ListOrdersParams {
  take: number;
  skip: number;
  status?: OrderStatus;
  search?: string;
}

export async function listOrders(api: ApiFetch, params: ListOrdersParams) {
  const query = new URLSearchParams({ take: String(params.take), skip: String(params.skip) });
  if (params.status) query.set("status", params.status);
  if (params.search) query.set("search", params.search);

  const data = await api<unknown>(`/orders?${query.toString()}`);
  return ordersResponseSchema.parse(data);
}

export async function getOrder(api: ApiFetch, id: string) {
  const data = await api<unknown>(`/orders/${id}`);
  return orderSchema.parse(data);
}

export async function getOrderTimeline(api: ApiFetch, id: string) {
  const data = await api<unknown>(`/orders/${id}/timeline`);
  return orderTimelineResponseSchema.parse(data);
}

export function updateOrderStatus(api: ApiFetch, id: string, body: { status: OrderStatus; reason?: string }) {
  return api<undefined>(`/orders/${id}/status`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}
