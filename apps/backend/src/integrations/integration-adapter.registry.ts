import { Injectable, NotFoundException } from '@nestjs/common';

import { IntegrationProvider } from '@prisma/client';

import { EasyPostAdapter } from './adapters/easypost.adapter';
import { OdooAdapter } from './adapters/odoo.adapter';
import { ShippoAdapter } from './adapters/shippo.adapter';
import { DiscordAdapter } from './adapters/discord.adapter';
import { MailgunAdapter } from './adapters/mailgun.adapter';
import { ResendAdapter } from './adapters/resend.adapter';
import { SendGridAdapter } from './adapters/sendgrid.adapter';
import { ShopifyAdapter } from './adapters/shopify.adapter';
import { SlackAdapter } from './adapters/slack.adapter';
import { ZohoInventoryAdapter } from './adapters/zoho-inventory.adapter';
import { IntegrationAdapter } from './integration-adapter.interface';

@Injectable()
export class IntegrationAdapterRegistry {
  private readonly adapters: Partial<Record<IntegrationProvider, IntegrationAdapter>>;

  constructor(
    shopify: ShopifyAdapter,
    resend: ResendAdapter,
    sendgrid: SendGridAdapter,
    mailgun: MailgunAdapter,
    zohoInventory: ZohoInventoryAdapter,
    odoo: OdooAdapter,
    easyPost: EasyPostAdapter,
    shippo: ShippoAdapter,
    slack: SlackAdapter,
    discord: DiscordAdapter,
  ) {
    this.adapters = {
      [IntegrationProvider.SHOPIFY]: shopify,
      [IntegrationProvider.RESEND]: resend,
      [IntegrationProvider.SENDGRID]: sendgrid,
      [IntegrationProvider.MAILGUN]: mailgun,
      [IntegrationProvider.ZOHO_INVENTORY]: zohoInventory,
      [IntegrationProvider.ODOO]: odoo,
      [IntegrationProvider.EASYPOST]: easyPost,
      [IntegrationProvider.SHIPPO]: shippo,
      [IntegrationProvider.SLACK]: slack,
      [IntegrationProvider.DISCORD]: discord,
    };
  }

  get(provider: IntegrationProvider): IntegrationAdapter {
    const adapter = this.adapters[provider];
    if (!adapter) {
      throw new NotFoundException(`Integration provider "${provider}" is not supported yet`);
    }
    return adapter;
  }
}
