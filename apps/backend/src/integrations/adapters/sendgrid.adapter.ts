import { BadGatewayException, Injectable, UnauthorizedException } from '@nestjs/common';

import { IntegrationProvider } from '@prisma/client';

import { fetchWithTimeout } from '../../common/http/fetch-with-timeout.util';

import { ApiKeyAdapter } from '../integration-adapter.interface';

@Injectable()
export class SendGridAdapter implements ApiKeyAdapter {
  readonly provider = IntegrationProvider.SENDGRID;
  readonly authType = 'api_key' as const;

  async validateKey(apiKey: string): Promise<void> {
    await this.testConnection(apiKey);
  }

  async testConnection(apiKey: string): Promise<void> {
    const res = await fetchWithTimeout('https://api.sendgrid.com/v3/templates?page_size=1', {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (res.status === 401 || res.status === 403) {
      throw new UnauthorizedException('Invalid SendGrid API key');
    }
    if (!res.ok) {
      throw new BadGatewayException(`SendGrid connection test failed: ${res.status}`);
    }
  }

  async sendEmail(apiKey: string, params: {
    from: string;
    to: string;
    subject: string;
    html: string;
  }): Promise<void> {
    const res = await fetchWithTimeout('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: params.to }] }],
        from: { email: params.from },
        subject: params.subject,
        content: [{ type: 'text/html', value: params.html }],
      }),
    });
    if (res.status === 401 || res.status === 403) {
      throw new UnauthorizedException('Invalid or revoked SendGrid API key');
    }
    if (!res.ok) {
      const body = await res.json().catch(() => null) as { errors?: { message: string }[] } | null;
      throw new BadGatewayException(
        `SendGrid email delivery failed: ${body?.errors?.[0]?.message ?? res.status}`,
      );
    }
  }
}
