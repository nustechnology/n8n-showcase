import { BadGatewayException, Injectable, UnauthorizedException } from '@nestjs/common';

import { IntegrationProvider } from '@prisma/client';

import { fetchWithTimeout } from '../../common/http/fetch-with-timeout.util';

import { ApiKeyAdapter } from '../integration-adapter.interface';

// Same shape as SlackAdapter — the credential is the webhook URL itself,
// treated as a bare opaque string. Discord's webhook API is POST-only (no
// read endpoint), so validate/test are side-effecting just like Slack.
@Injectable()
export class DiscordAdapter implements ApiKeyAdapter {
  readonly provider = IntegrationProvider.DISCORD;
  readonly authType = 'api_key' as const;

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
    const res = await fetchWithTimeout(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: text }),
    });
    if (res.status === 404) {
      throw new UnauthorizedException('Invalid or revoked Discord webhook URL');
    }
    if (!res.ok) {
      throw new BadGatewayException(`Discord message delivery failed: ${res.status}`);
    }
  }
}
