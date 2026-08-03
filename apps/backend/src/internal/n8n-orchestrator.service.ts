import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { fetchWithTimeout } from '../common/http/fetch-with-timeout.util';

export interface StartOrderValidationRunInput {
  tenantId: string;
  orderId: string;
  correlationId: string;
}

export interface StartCartReminderRunInput {
  tenantId: string;
  checkoutToken: string;
  customerEmail: string | null;
  customerName: string | null;
  items: { name: string; quantity: number }[];
  correlationId: string;
}

// The one call that goes backend -> n8n; everything else under src/internal/
// is n8n calling back into us. Kicks off n8n's "Order Validation" workflow,
// whose own HTTP Request nodes then call InternalController for everything
// that needs state or a secret. Authenticated with the same shared secret
// InternalAuthGuard checks incoming calls against — n8n's Webhook trigger
// node verifies it the same way.
@Injectable()
export class N8nOrchestratorService {
  private readonly logger = new Logger(N8nOrchestratorService.name);
  private readonly orderValidationWebhookUrl: string;
  private readonly cartReminderWebhookUrl: string;
  private readonly sharedSecret: string;

  constructor(config: ConfigService) {
    const baseUrl = config.getOrThrow<string>('N8N_BASE_URL');
    this.orderValidationWebhookUrl = `${baseUrl}/webhook/order-received`;
    this.cartReminderWebhookUrl = `${baseUrl}/webhook/cart-reminder`;
    this.sharedSecret = config.getOrThrow<string>('N8N_INTERNAL_TOKEN');
  }

  async startOrderValidationRun(input: StartOrderValidationRunInput): Promise<void> {
    const res = await fetchWithTimeout(this.orderValidationWebhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.sharedSecret}`,
      },
      body: JSON.stringify(input),
    });

    if (!res.ok) {
      throw new Error(`n8n order-received webhook responded with ${res.status}`);
    }

    this.logger.log(
      `Started order-validation workflow run for order ${input.orderId} (correlationId=${input.correlationId})`,
    );
  }

  async startCartReminderRun(input: StartCartReminderRunInput): Promise<void> {
    const res = await fetchWithTimeout(this.cartReminderWebhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.sharedSecret}`,
      },
      body: JSON.stringify(input),
    });

    if (!res.ok) {
      throw new Error(`n8n cart-reminder webhook responded with ${res.status}`);
    }

    this.logger.log(
      `Started cart-reminder workflow run for checkout ${input.checkoutToken} (correlationId=${input.correlationId})`,
    );
  }
}
