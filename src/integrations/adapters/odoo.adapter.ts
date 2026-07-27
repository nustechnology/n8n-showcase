import { BadGatewayException, Injectable, UnauthorizedException } from '@nestjs/common';

import { IntegrationProvider } from '@prisma/client';

import { ApiKeyAdapter } from '../integration-adapter.interface';

interface OdooCredential {
  url: string;
  db: string;
  username: string;
  apiKey: string;
}

@Injectable()
export class OdooAdapter implements ApiKeyAdapter {
  readonly provider = IntegrationProvider.ODOO;
  readonly authType = 'api_key' as const;

  async validateKey(credential: string): Promise<void> {
    await this.testConnection(credential);
  }

  async testConnection(credential: string): Promise<void> {
    const { url, db, username, apiKey } = this.parseCredential(credential);
    const res = await fetch(`${url}/web/session/authenticate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'call',
        params: { db, login: username, password: apiKey },
      }),
    });
    if (res.status === 401 || res.status === 403) {
      throw new UnauthorizedException('Invalid Odoo credentials — check URL, database, username, and API key');
    }
    if (!res.ok) {
      throw new BadGatewayException(`Odoo connection test failed: ${res.status}`);
    }
    const data = (await res.json()) as { error?: { data?: { message?: string } } } | null;
    if (data?.error) {
      throw new UnauthorizedException(
        `Odoo authentication failed: ${data.error.data?.message ?? 'Invalid credentials'}`,
      );
    }
  }

  async checkInventory(
    credential: string,
    items: { sku: string; quantity: number }[],
  ): Promise<{ inStock: boolean; availableQuantity?: number }> {
    const { url, db, username, apiKey } = this.parseCredential(credential);

    const authRes = await fetch(`${url}/web/session/authenticate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'call',
        params: { db, login: username, password: apiKey },
      }),
    });
    if (!authRes.ok) {
      throw new BadGatewayException(`Odoo authentication failed during inventory check`);
    }
    const session = (await authRes.json()) as { result?: { session_id?: string } } | null;

    // Odoo's search_read via JSON-RPC: look up products by SKU (default_code)
    // and return qty_available. If any SKU has insufficient stock, report
    // out-of-stock.
    let totalAvailable = 0;
    for (const item of items) {
      const res = await fetch(`${url}/jsonrpc`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: session?.result?.session_id
            ? `session_id=${session.result.session_id}`
            : '',
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          method: 'call',
          params: {
            model: 'product.product',
            method: 'search_read',
            args: [[['default_code', '=', item.sku]]],
            kwargs: { fields: ['qty_available'] },
          },
        }),
      });
      if (!res.ok) {
        throw new BadGatewayException(`Odoo inventory lookup failed for SKU ${item.sku}: ${res.status}`);
      }
      const data = (await res.json()) as { result?: Array<{ qty_available: number }> } | null;
      const product = data?.result?.[0];
      const onHand = product?.qty_available ?? 0;
      totalAvailable += onHand;
      if (onHand < item.quantity) {
        return { inStock: false, availableQuantity: onHand };
      }
    }

    return { inStock: true, availableQuantity: totalAvailable };
  }

  private parseCredential(credential: string): OdooCredential {
    const parsed = JSON.parse(credential) as OdooCredential;
    if (!parsed.url || !parsed.db || !parsed.username || !parsed.apiKey) {
      throw new UnauthorizedException('Odoo credential is missing required fields: url, db, username, apiKey');
    }
    return parsed;
  }
}
