import { BadGatewayException, Injectable, UnauthorizedException } from '@nestjs/common';

import { IntegrationProvider } from '@prisma/client';

import { fetchWithTimeout } from '../../common/http/fetch-with-timeout.util';

import { ApiKeyAdapter } from '../integration-adapter.interface';

const SHIPPO_API_URL = 'https://api.goshippo.com';

const PLACEHOLDER_PARCEL = {
  length: '10',
  width: '8',
  height: '4',
  distance_unit: 'in',
  weight: '1',
  mass_unit: 'lb',
};

export interface ShippoAddress {
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

export interface ShippoOrderInput {
  shopifyOrderId: string;
  shippingAddress: ShippoAddress;
}

@Injectable()
export class ShippoAdapter implements ApiKeyAdapter {
  readonly provider = IntegrationProvider.SHIPPO;
  readonly authType = 'api_key' as const;

  async validateKey(apiKey: string): Promise<void> {
    await this.testConnection(apiKey);
  }

  async testConnection(apiKey: string): Promise<void> {
    const res = await fetchWithTimeout(`${SHIPPO_API_URL}/v1/parcels`, {
      headers: { Authorization: `ShippoToken ${apiKey}` },
    });
    if (res.status === 401) {
      throw new UnauthorizedException('Invalid Shippo API token');
    }
    if (!res.ok) {
      throw new BadGatewayException(`Shippo connection test failed: ${res.status}`);
    }
  }

  async createShipment(
    apiKey: string,
    order: ShippoOrderInput,
    fromAddress: ShippoAddress,
  ): Promise<{ trackingNumber: string; carrier: string; shipmentId: string }> {
    const headers = {
      'Content-Type': 'application/json',
      Authorization: `ShippoToken ${apiKey}`,
    };

    const body = {
      address_from: fromAddress,
      address_to: {
        name: order.shippingAddress.name,
        street1: order.shippingAddress.street1,
        street2: order.shippingAddress.street2,
        city: order.shippingAddress.city,
        state: order.shippingAddress.state,
        zip: order.shippingAddress.zip,
        country: order.shippingAddress.country,
        phone: order.shippingAddress.phone,
      },
      parcels: [PLACEHOLDER_PARCEL],
      async: false,
    };

    const res = await fetchWithTimeout(`${SHIPPO_API_URL}/shipments/`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new BadGatewayException(`Shippo shipment creation failed: ${text.slice(0, 200) || res.status}`);
    }

    const shipment = (await res.json()) as {
      object_id: string;
      rates?: { object_id: string; provider: string; servicelevel: { name: string }; amount: string }[];
    };

    const validRates = (shipment.rates ?? []).filter((r) => Number.isFinite(parseFloat(r.amount)));
    if (validRates.length === 0) {
      throw new BadGatewayException('Shippo returned no shippable rates for this address/parcel');
    }
    const cheapest = validRates.reduce(
      (lowest, rate) => (parseFloat(rate.amount) < parseFloat(lowest.amount) ? rate : lowest),
      validRates[0],
    );

    const txRes = await fetchWithTimeout(`${SHIPPO_API_URL}/transactions/`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ rate: cheapest.object_id, async: false }),
    });
    if (!txRes.ok) {
      const text = await txRes.text().catch(() => '');
      throw new BadGatewayException(`Shippo label purchase failed: ${text.slice(0, 200) || res.status}`);
    }

    const tx = (await txRes.json()) as {
      object_id: string;
      tracking_number: string;
      tracking_status?: string;
    };

    return {
      trackingNumber: tx.tracking_number,
      carrier: cheapest.provider,
      shipmentId: tx.object_id,
    };
  }
}
