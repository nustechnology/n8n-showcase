import { BadGatewayException, Injectable, UnauthorizedException } from '@nestjs/common';

import { IntegrationProvider } from '@prisma/client';

import { ApiKeyAdapter } from '../integration-adapter.interface';

const EASYPOST_API_URL = 'https://api.easypost.com/v2';

// No parcel-dimensions/weight capture exists anywhere in this app yet (no
// per-order package config UI) — every shipment uses a fixed placeholder
// parcel, same kind of documented simplification as ShipStationAdapter's
// old fixed carrier/service pair. Revisit once real package data is
// captured somewhere upstream.
const PLACEHOLDER_PARCEL = { weight: 16 }; // ounces (~1 lb)

export interface EasyPostAddress {
  name?: string;
  company?: string;
  street1?: string;
  street2?: string;
  city?: string;
  state?: string;
  zip?: string;
  country?: string;
  phone?: string;
}

export interface EasyPostOrderInput {
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

// The credential is a single opaque API key — EasyPost auth is HTTP Basic
// with the key as username and an empty password, unlike ShipStation's
// two-secret credential (no JSON-blob serialization needed here).
@Injectable()
export class EasyPostAdapter implements ApiKeyAdapter {
  readonly provider = IntegrationProvider.EASYPOST;
  readonly authType = 'api_key' as const;

  async validateKey(apiKey: string): Promise<void> {
    if (!/^EZ[AT]K/.test(apiKey)) {
      throw new UnauthorizedException('Invalid EasyPost API key — should start with EZAK or EZTK');
    }
  }

  async testConnection(apiKey: string): Promise<void> {
    const res = await fetch(`${EASYPOST_API_URL}/carrier_accounts`, {
      headers: { Authorization: this.authHeader(apiKey) },
    });
    if (res.status === 401) {
      throw new UnauthorizedException('Invalid EasyPost API key');
    }
    if (!res.ok) {
      throw new BadGatewayException(`EasyPost connection test failed: ${await this.describeError(res)}`);
    }
  }

  // Creates the shipment, then buys the lowest-cost of the rates EasyPost
  // returns — rate shopping is native to EasyPost's model (unlike
  // ShipStation, which needed a hardcoded carrier/service pair here), so
  // "cheapest available" is a real, correct default, not a placeholder.
  async createShipment(
    apiKey: string,
    order: EasyPostOrderInput,
    fromAddress: EasyPostAddress,
  ): Promise<{ trackingNumber: string; carrier: string; shipmentId: string }> {
    const headers = { 'content-type': 'application/json', Authorization: this.authHeader(apiKey) };
    const toAddress: EasyPostAddress = {
      name: order.shippingAddress.name,
      street1: order.shippingAddress.street1,
      street2: order.shippingAddress.street2,
      city: order.shippingAddress.city,
      state: order.shippingAddress.state,
      zip: order.shippingAddress.postalCode,
      country: order.shippingAddress.country,
      phone: order.shippingAddress.phone,
    };

    const shipmentPayload = {
      shipment: { to_address: toAddress, from_address: fromAddress, parcel: PLACEHOLDER_PARCEL },
    };

    const createRes = await fetch(`${EASYPOST_API_URL}/shipments`, {
      method: 'POST',
      headers,
      body: JSON.stringify(shipmentPayload),
    });
    if (!createRes.ok) {
      throw new BadGatewayException(`EasyPost shipment creation failed: ${await this.describeError(createRes)}`);
    }
    const created = (await createRes.json()) as {
      id: string;
      rates?: { id: string; carrier: string; service: string; rate: string }[];
    };
    const validRates = (created.rates ?? []).filter((rate) => Number.isFinite(parseFloat(rate.rate)));
    if (validRates.length === 0) {
      throw new BadGatewayException('EasyPost returned no shippable rates for this address/parcel');
    }
    // Explicit initial value — a plain `.reduce((a,b) => ...)` with no seed
    // uses rates[0] as the starting accumulator, and a NaN comparison is
    // always false, so a malformed first-position rate would never lose to
    // a valid cheaper one later in the array. Filtering to parseable rates
    // above and seeding with the first of those avoids that trap.
    const cheapest = validRates.reduce(
      (lowest, rate) => (parseFloat(rate.rate) < parseFloat(lowest.rate) ? rate : lowest),
      validRates[0],
    );

    const buyRes = await fetch(`${EASYPOST_API_URL}/shipments/${created.id}/buy`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ rate: { id: cheapest.id } }),
    });
    if (!buyRes.ok) {
      throw new BadGatewayException(`EasyPost label purchase failed: ${await this.describeError(buyRes)}`);
    }
    const bought = (await buyRes.json()) as {
      id: string;
      tracking_code: string;
      selected_rate?: { carrier: string };
    };

    return {
      trackingNumber: bought.tracking_code,
      carrier: bought.selected_rate?.carrier ?? cheapest.carrier,
      shipmentId: bought.id,
    };
  }

  private authHeader(apiKey: string): string {
    return `Basic ${Buffer.from(`${apiKey}:`).toString('base64')}`;
  }

  // A bare status code (e.g. "403") isn't diagnostic on its own — EasyPost's
  // error responses are JSON ({ error: { code, message } }) with the actual
  // reason (bad address, unverified account, no valid rates, etc.). Falls
  // back to raw response text if the body isn't the expected shape, since a
  // 5xx from EasyPost's own infra might not be JSON at all.
  private async describeError(res: Response): Promise<string> {
    const text = await res.text().catch(() => '');
    if (!text) return String(res.status);
    try {
      const body = JSON.parse(text) as { error?: { code?: string; message?: string } };
      if (body.error?.message) {
        return `${res.status} — ${body.error.message}${body.error.code ? ` (${body.error.code})` : ''}`;
      }
    } catch {
      // Not JSON — fall through to raw text below.
    }
    return `${res.status} — ${text.slice(0, 300)}`;
  }
}
