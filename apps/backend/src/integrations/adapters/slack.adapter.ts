import { BadGatewayException, Injectable, UnauthorizedException } from '@nestjs/common';

import { IntegrationProvider } from '@prisma/client';

import { ApiKeyAdapter } from '../integration-adapter.interface';

// The credential is the incoming-webhook URL itself, treated as a bare
// opaque string — simplest correct model for "post an alert," no bot-token
// OAuth needed. Single value, same shape as Resend's API key (no JSON
// wrapping required, unlike ShipStation's two-secret credential).
@Injectable()
export class SlackAdapter implements ApiKeyAdapter {
  readonly provider = IntegrationProvider.SLACK;
  readonly authType = 'api_key' as const;

  // Slack's incoming-webhook API has no read-only/dry-run endpoint to probe
  // — a POST is the only way to verify the URL actually works, so unlike
  // every other adapter's validate/test, this one is not side-effect-free:
  // it really does post a visible message to the channel.
  async validateKey(webhookUrl: string): Promise<void> {
    await this.post(webhookUrl, 'Connected — this workspace will receive order alerts here.');
  }

  async testConnection(webhookUrl: string): Promise<void> {
    await this.post(webhookUrl, 'Connection test successful.');
  }

  async sendMessage(webhookUrl: string, text: string): Promise<void> {
    await this.post(webhookUrl, text);
  }

  private async post(webhookUrl: string, text: string): Promise<void> {
    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text }),
    });
    if (res.status === 404 || res.status === 403) {
      throw new UnauthorizedException('Invalid or revoked Slack webhook URL');
    }
    if (!res.ok) {
      throw new BadGatewayException(`Slack message delivery failed: ${res.status}`);
    }
  }
}
