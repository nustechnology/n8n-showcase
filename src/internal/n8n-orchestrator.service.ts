import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface StartOrderValidationRunInput {
  tenantId: string;
  orderId: string;
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
  private readonly webhookUrl: string;
  private readonly sharedSecret: string;

  constructor(config: ConfigService) {
    this.webhookUrl = `${config.getOrThrow<string>('N8N_BASE_URL')}/webhook/order-received`;
    this.sharedSecret = config.getOrThrow<string>('N8N_INTERNAL_TOKEN');
  }

  async startOrderValidationRun(input: StartOrderValidationRunInput): Promise<void> {
    const res = await fetch(this.webhookUrl, {
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
}
