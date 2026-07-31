import { BadGatewayException, Injectable, UnauthorizedException } from '@nestjs/common';

import { IntegrationProvider } from '@prisma/client';

import { fetchWithTimeout } from '../../common/http/fetch-with-timeout.util';

import { ApiKeyAdapter } from '../integration-adapter.interface';

@Injectable()
export class ResendAdapter implements ApiKeyAdapter {
  readonly provider = IntegrationProvider.RESEND;
  readonly authType = 'api_key' as const;

  async validateKey(apiKey: string): Promise<void> {
    await this.testConnection(apiKey);
  }

  async testConnection(apiKey: string): Promise<void> {
    const res = await fetchWithTimeout('https://api.resend.com/domains', {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (res.status === 401 || res.status === 403) {
      const body = (await res.json().catch(() => null)) as { name?: string } | null;
      if (body?.name === 'restricted_api_key') {
        throw new UnauthorizedException(
          'This Resend API key is restricted to sending only, which this app cannot yet verify (no email-sending support exists until domain verification is built). Use a "Full access" key for now.',
        );
      }
      throw new UnauthorizedException('Invalid Resend API key');
    }
    if (!res.ok) {
      throw new BadGatewayException(`Resend connection test failed: ${res.status}`);
    }
  }

  async sendEmail(apiKey: string, params: {
    from: string;
    to: string;
    subject: string;
    html: string;
  }): Promise<void> {
    const res = await fetchWithTimeout('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(params),
    });
    if (res.status === 401 || res.status === 403) {
      throw new UnauthorizedException('Invalid or revoked Resend API key');
    }
    if (!res.ok) {
      const body = await res.json().catch(() => null) as { message?: string } | null;
      throw new BadGatewayException(
        `Resend email delivery failed: ${body?.message ?? res.status}`,
      );
    }
  }
}
