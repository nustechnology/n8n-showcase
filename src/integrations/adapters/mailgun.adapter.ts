import { BadGatewayException, Injectable, UnauthorizedException } from '@nestjs/common';

import { IntegrationProvider } from '@prisma/client';

import { ApiKeyAdapter } from '../integration-adapter.interface';

@Injectable()
export class MailgunAdapter implements ApiKeyAdapter {
  readonly provider = IntegrationProvider.MAILGUN;
  readonly authType = 'api_key' as const;

  async validateKey(apiKey: string): Promise<void> {
    await this.testConnection(apiKey);
  }

  async testConnection(apiKey: string): Promise<void> {
    const { domain, key } = this.parseCredential(apiKey);
    const res = await fetch(`https://api.mailgun.net/v3/${domain}/events?limit=1`, {
      headers: { Authorization: `Basic ${Buffer.from(`api:${key}`).toString('base64')}` },
    });
    if (res.status === 401 || res.status === 403) {
      throw new UnauthorizedException('Invalid Mailgun API key or domain');
    }
    if (!res.ok) {
      throw new BadGatewayException(`Mailgun connection test failed: ${res.status}`);
    }
  }

  async sendEmail(apiKey: string, params: {
    from: string;
    to: string;
    subject: string;
    html: string;
  }): Promise<void> {
    const { domain, key } = this.parseCredential(apiKey);

    const formBody = new URLSearchParams();
    formBody.append('from', params.from);
    formBody.append('to', params.to);
    formBody.append('subject', params.subject);
    formBody.append('html', params.html);

    const res = await fetch(`https://api.mailgun.net/v3/${domain}/messages`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`api:${key}`).toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: formBody.toString(),
    });
    if (res.status === 401 || res.status === 403) {
      throw new UnauthorizedException('Invalid or revoked Mailgun API key');
    }
    if (!res.ok) {
      const body = await res.json().catch(() => null) as { message?: string } | null;
      throw new BadGatewayException(
        `Mailgun email delivery failed: ${body?.message ?? res.status}`,
      );
    }
  }

  private parseCredential(apiKey: string): { domain: string; key: string } {
    // Mailgun needs both a domain and API key. The credential stored is
    // JSON-stringified: { domain, key } — same self-parsing pattern as
    // ZohoInventoryAdapter's token pair.
    const parsed = JSON.parse(apiKey) as { domain: string; key: string };
    if (!parsed.domain || !parsed.key) {
      throw new UnauthorizedException('Mailgun credential is missing domain or API key');
    }
    return parsed;
  }
}
