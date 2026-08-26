import { Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';

import { IntegrationProvider, Order } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';

import { CircuitBreakerService } from '../common/circuit-breaker/circuit-breaker.service';

import { DiscordAdapter } from '../integrations/adapters/discord.adapter';
import { EasyPostAdapter } from '../integrations/adapters/easypost.adapter';
import { OdooAdapter } from '../integrations/adapters/odoo.adapter';
import { ShippoAdapter } from '../integrations/adapters/shippo.adapter';
import { MailgunAdapter } from '../integrations/adapters/mailgun.adapter';
import { ResendAdapter } from '../integrations/adapters/resend.adapter';
import { SendGridAdapter } from '../integrations/adapters/sendgrid.adapter';
import { ShopifyAdapter } from '../integrations/adapters/shopify.adapter';
import { SlackAdapter } from '../integrations/adapters/slack.adapter';
import { ZohoInventoryAdapter } from '../integrations/adapters/zoho-inventory.adapter';
import { IntegrationsService } from '../integrations/integrations.service';

import { ShopifyOrderPayload } from '../webhooks/shopify-order-payload.types';

const MAILER_PROVIDERS: IntegrationProvider[] = [
  IntegrationProvider.RESEND,
  IntegrationProvider.SENDGRID,
  IntegrationProvider.MAILGUN,
];

const MAILER_ADAPTER_FACTORY: Record<
  string,
  (adapter: unknown) => (secret: string, params: { from: string; to: string; subject: string; html: string }) => Promise<void>
> = {
  [IntegrationProvider.RESEND]: (a) => (a as ResendAdapter).sendEmail.bind(a),
  [IntegrationProvider.SENDGRID]: (a) => (a as SendGridAdapter).sendEmail.bind(a),
  [IntegrationProvider.MAILGUN]: (a) => (a as MailgunAdapter).sendEmail.bind(a),
};

const ALERT_PROVIDERS: IntegrationProvider[] = [
  IntegrationProvider.SLACK,
  IntegrationProvider.DISCORD,
];

const ALERT_ADAPTER_FACTORY: Record<
  string,
  (adapter: unknown) => (secret: string, message: string) => Promise<void>
> = {
  [IntegrationProvider.SLACK]: (a) => (a as SlackAdapter).sendMessage.bind(a),
  [IntegrationProvider.DISCORD]: (a) => (a as DiscordAdapter).sendMessage.bind(a),
};

const SHIPPING_PROVIDERS: IntegrationProvider[] = [
  IntegrationProvider.EASYPOST,
  IntegrationProvider.SHIPPO,
];

interface ShippingOrderInput {
  shopifyOrderId: string;
  shippingAddress: {
    name?: string;
    street1?: string;
    street2?: string;
    city?: string;
    state?: string;
    postalCode?: string;
    country?: string;
    phone?: string;
  };
}

type ShippingAdapterFn = (
  secret: string,
  order: ShippingOrderInput,
  fromAddress: Record<string, unknown>,
) => Promise<{ trackingNumber: string; carrier: string; shipmentId: string }>;

const SHIPPING_ADAPTER_FACTORY: Record<string, (adapter: unknown) => ShippingAdapterFn> = {
  [IntegrationProvider.EASYPOST]: (a) => (a as EasyPostAdapter).createShipment.bind(a),
  [IntegrationProvider.SHIPPO]: (a) => (a as ShippoAdapter).createShipment.bind(a),
};

const INVENTORY_PROVIDERS: IntegrationProvider[] = [
  IntegrationProvider.ZOHO_INVENTORY,
  IntegrationProvider.ODOO,
];

type InventoryCheckFn = (
  secret: string,
  items: { sku: string; quantity: number }[],
  organizationId: string | undefined,
) => Promise<{ inStock: boolean; availableQuantity?: number }>;

const INVENTORY_ADAPTER_FACTORY: Record<string, (adapter: unknown) => InventoryCheckFn> = {
  [IntegrationProvider.ZOHO_INVENTORY]: (a) => (secret, items, orgId) =>
    (a as ZohoInventoryAdapter).checkInventory(secret, items, orgId!),
  [IntegrationProvider.ODOO]: (a) => (secret, items) =>
    (a as OdooAdapter).checkInventory(secret, items),
};

// One thing owns each third-party call — no Order/WorkflowRun writes happen
// here (that's InternalService's job, via the separate bookkeeping
// endpoints n8n calls next); this service only reads Order for input data
// and calls the adapter's business method.
@Injectable()
export class IntegrationActionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly integrations: IntegrationsService,
    private readonly circuitBreaker: CircuitBreakerService,
  ) {}

  async checkInventory(
    tenantId: string,
    orderId: string,
  ): Promise<{ inStock: boolean; availableQuantity?: number }> {
    const order = await this.getOrderOrThrow(tenantId, orderId);
    const items = this.extractLineItems(order);

    const inv = await this.prisma.integration.findFirst({
      where: {
        tenantId,
        provider: { in: INVENTORY_PROVIDERS },
        status: { in: ['ACTIVE', 'DEGRADED'] },
      },
    });
    if (!inv) {
      throw new NotFoundException('No active inventory provider is connected for this tenant');
    }

    const { integrationId, secret, config } = await this.integrations.getDecryptedCredential(
      tenantId,
      inv.provider,
    );
    const adapter = this.integrations.getAdapter(inv.provider);
    const checkFn = INVENTORY_ADAPTER_FACTORY[inv.provider]?.(adapter);
    if (!checkFn) {
      throw new NotFoundException(`Inventory provider "${inv.provider}" cannot check inventory`);
    }

    const organizationId = config.organizationId as string | undefined;

    try {
      return await this.circuitBreaker.fire(inv.provider, () =>
        checkFn(secret, items, organizationId),
      );
    } catch (error) {
      if (!(error instanceof UnauthorizedException)) {
        throw error;
      }
      if (inv.provider !== IntegrationProvider.ZOHO_INVENTORY) {
        throw error;
      }
      const zohoAdapter = adapter as ZohoInventoryAdapter;
      const refreshed = await this.circuitBreaker.fire(IntegrationProvider.ZOHO_INVENTORY, () =>
        zohoAdapter.refreshToken(secret),
      );
      await this.integrations.updateCredential(integrationId, refreshed);
      return this.circuitBreaker.fire(IntegrationProvider.ZOHO_INVENTORY, () =>
        zohoAdapter.checkInventory(refreshed, items, organizationId!),
      );
    }
  }

  async createShipment(
    tenantId: string,
    orderId: string,
  ): Promise<{ trackingNumber: string; carrier: string; shipmentId: string }> {
    const order = await this.getOrderOrThrow(tenantId, orderId);
    const payload = order.rawPayload as unknown as ShopifyOrderPayload;

    const shipper = await this.prisma.integration.findFirst({
      where: {
        tenantId,
        provider: { in: SHIPPING_PROVIDERS },
        status: { in: ['ACTIVE', 'DEGRADED'] },
      },
    });
    if (!shipper) {
      throw new NotFoundException('No active shipping provider is connected for this tenant');
    }

    const { secret, config } = await this.integrations.getDecryptedCredential(
      tenantId,
      shipper.provider,
    );
    const adapter = this.integrations.getAdapter(shipper.provider);
    const createShipmentFn = SHIPPING_ADAPTER_FACTORY[shipper.provider]?.(adapter);
    if (!createShipmentFn) {
      throw new NotFoundException(`Shipping provider "${shipper.provider}" cannot create shipments`);
    }

    const fromAddress = config.fromAddress as Record<string, unknown>;
    const shippingAddress = payload.shipping_address;
    const hasCoreAddress = !!(shippingAddress?.address1 && shippingAddress?.city && shippingAddress?.zip);
    if (!hasCoreAddress) {
      throw new NotFoundException('Order has no complete shipping address (address1/city/zip)');
    }
    const orderInput: ShippingOrderInput = {
      shopifyOrderId: order.shopifyOrderId,
      shippingAddress: {
        name: shippingAddress.name ?? undefined,
        street1: shippingAddress.address1 ?? undefined,
        street2: shippingAddress.address2 ?? undefined,
        city: shippingAddress.city ?? undefined,
        state: shippingAddress.province ?? undefined,
        postalCode: shippingAddress.zip ?? undefined,
        country: shippingAddress.country ?? undefined,
        phone: shippingAddress.phone ?? undefined,
      },
    };

    return this.circuitBreaker.fire(shipper.provider, () =>
      createShipmentFn(secret, orderInput, fromAddress),
    );
  }

  async updateShopifyOrder(
    tenantId: string,
    orderId: string,
    trackingNumber: string,
    carrier: string,
  ): Promise<void> {
    const order = await this.getOrderOrThrow(tenantId, orderId);
    const payload = order.rawPayload as unknown as ShopifyOrderPayload;
    const lineItems = (payload.line_items ?? []).map((item) => ({
      id: item.id!,
      quantity: item.quantity,
    }));
    const { secret, config } = await this.integrations.getDecryptedCredential(
      tenantId,
      IntegrationProvider.SHOPIFY,
    );
    const adapter = this.integrations.getAdapter(IntegrationProvider.SHOPIFY) as ShopifyAdapter;
    const shop = config.shop as string;

    await this.circuitBreaker.fire(IntegrationProvider.SHOPIFY, () =>
      adapter.updateOrder(secret, shop, order.shopifyOrderId, { trackingNumber, carrier, lineItems }),
    );
  }

  async sendSlackMessage(tenantId: string, message: string): Promise<void> {
    const alert = await this.prisma.integration.findFirst({
      where: {
        tenantId,
        provider: { in: ALERT_PROVIDERS },
        status: { in: ['ACTIVE', 'DEGRADED'] },
      },
    });
    if (!alert) {
      throw new NotFoundException('No active alert service is connected for this tenant');
    }

    const { secret } = await this.integrations.getDecryptedCredential(tenantId, alert.provider);
    const adapter = this.integrations.getAdapter(alert.provider);
    const sendFn = ALERT_ADAPTER_FACTORY[alert.provider]?.(adapter);
    if (!sendFn) {
      throw new NotFoundException(`Alert provider "${alert.provider}" cannot send messages`);
    }

    await this.circuitBreaker.fire(alert.provider, () => sendFn(secret, message));
  }

  async sendResendEmail(tenantId: string, orderId: string): Promise<void> {
    const order = await this.getOrderOrThrow(tenantId, orderId);
    const payload = order.rawPayload as unknown as ShopifyOrderPayload;
    const email = payload.email ?? payload.customer?.email ?? null;
    if (!email) {
      throw new NotFoundException('Order has no customer email address');
    }

    const mailer = await this.prisma.integration.findFirst({
      where: {
        tenantId,
        provider: { in: MAILER_PROVIDERS },
        status: { in: ['ACTIVE', 'DEGRADED'] },
      },
    });
    if (!mailer) {
      throw new NotFoundException('No active mailer is connected for this tenant');
    }

    const { secret, config } = await this.integrations.getDecryptedCredential(
      tenantId,
      mailer.provider,
    );
    const adapter = this.integrations.getAdapter(mailer.provider);
    const sendFn = MAILER_ADAPTER_FACTORY[mailer.provider]?.(adapter);
    if (!sendFn) {
      throw new NotFoundException(`Mailer provider "${mailer.provider}" cannot send email`);
    }

    const from = (config.from as string | undefined) ?? 'noreply@n8n-showcase.com';
    const orderName = payload.name ?? `#${order.shopifyOrderId}`;

    await this.circuitBreaker.fire(mailer.provider, () =>
      sendFn(secret, {
        from,
        to: email,
        subject: `Your order ${orderName} has shipped`,
        html: `<p>Your order <strong>${orderName}</strong> has been fulfilled and is on its way.</p><p>Thank you for shopping with us.</p>`,
      }),
    );
  }

  async checkCartCheckout(
    tenantId: string,
    cartToken: string,
  ): Promise<{ orderFound: boolean; customerEmail?: string; customerName?: string }> {
    const { secret, config } = await this.integrations.getDecryptedCredential(
      tenantId,
      IntegrationProvider.SHOPIFY,
    );
    const adapter = this.integrations.getAdapter(IntegrationProvider.SHOPIFY) as ShopifyAdapter;
    const shop = config.shop as string;

    return this.circuitBreaker.fire(IntegrationProvider.SHOPIFY, () =>
      adapter.checkCartCheckout(secret, shop, cartToken),
    );
  }

  async sendCartReminderEmail(
    tenantId: string,
    toEmail: string,
    customerName: string | null,
    itemNames: string[],
  ): Promise<void> {
    const mailer = await this.prisma.integration.findFirst({
      where: {
        tenantId,
        provider: { in: MAILER_PROVIDERS },
        status: { in: ['ACTIVE', 'DEGRADED'] },
      },
    });
    if (!mailer) {
      throw new NotFoundException('No active mailer is connected for this tenant');
    }

    const { secret, config } = await this.integrations.getDecryptedCredential(
      tenantId,
      mailer.provider,
    );
    const adapter = this.integrations.getAdapter(mailer.provider);
    const sendFn = MAILER_ADAPTER_FACTORY[mailer.provider]?.(adapter);
    if (!sendFn) {
      throw new NotFoundException(`Mailer provider "${mailer.provider}" cannot send email`);
    }

    const from = (config.from as string | undefined) ?? 'noreply@n8n-showcase.com';
    const greeting = customerName ?? 'Customer';
    const itemList = itemNames.map((name) => `  - ${name}`).join('\n');

    await this.circuitBreaker.fire(mailer.provider, () =>
      sendFn(secret, {
        from,
        to: toEmail,
        subject: `Your cart is waiting — complete your order`,
        html: `<p>Hi ${greeting},</p><p>You left the following items in your cart:</p><pre>${itemList}</pre><p>Come back and complete your order before they're gone.</p>`,
      }),
    );
  }

  private async getOrderOrThrow(tenantId: string, orderId: string): Promise<Order> {
    const order = await this.prisma.order.findFirst({ where: { id: orderId, tenantId } });
    if (!order) {
      throw new NotFoundException('Order not found for this tenant');
    }
    return order;
  }

  // Only SKU'd line items are checkable against Zoho — a variant with no
  // SKU has nothing to look up, so it's excluded rather than failing the
  // whole check.
  private extractLineItems(order: Order): { sku: string; quantity: number }[] {
    const payload = order.rawPayload as unknown as ShopifyOrderPayload;
    return (payload.line_items ?? [])
      .filter((item): item is { id: number; sku: string; name?: string | null; quantity: number } => !!item.sku)
      .map((item) => ({ sku: item.sku, quantity: item.quantity }));
  }
}
