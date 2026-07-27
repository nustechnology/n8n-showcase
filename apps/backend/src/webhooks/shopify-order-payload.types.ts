// Minimal shape for the orders/create Shopify webhook payload — only the
// fields this app actually reads, not the full Shopify Order resource. The
// full payload is stored verbatim in Order.rawPayload regardless of what's
// typed here (see ShopifyWebhookService.handleOrderCreated) — line_items/
// shipping_address are added below because IntegrationActionsService
// (src/internal/) now reads them back out of rawPayload for Zoho/
// ShipStation, not because the webhook payload itself changed shape.
export interface ShopifyOrderPayload {
  id: number;
  name?: string | null;
  email?: string | null;
  currency?: string | null;
  total_price?: string | null;
  customer?: {
    email?: string | null;
    first_name?: string | null;
    last_name?: string | null;
  } | null;
  line_items?: {
    sku?: string | null;
    name?: string | null;
    quantity: number;
  }[];
  shipping_address?: {
    name?: string | null;
    address1?: string | null;
    address2?: string | null;
    city?: string | null;
    province?: string | null;
    zip?: string | null;
    country?: string | null;
    phone?: string | null;
  } | null;
}
