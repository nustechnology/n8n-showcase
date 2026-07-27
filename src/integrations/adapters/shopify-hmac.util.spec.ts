import { createHmac } from 'crypto';

import { verifyShopifyOAuthHmac, verifyShopifyWebhookHmac } from './shopify-hmac.util';

const SECRET = 'test-shopify-client-secret';

describe('verifyShopifyOAuthHmac', () => {
  function sign(params: Record<string, string>): string {
    const message = Object.keys(params)
      .sort()
      .map((key) => `${key}=${params[key]}`)
      .join('&');
    return createHmac('sha256', SECRET).update(message).digest('hex');
  }

  it('accepts a genuinely signed query string', () => {
    const params = { code: 'abc123', shop: 'test-shop.myshopify.com', state: 'xyz', timestamp: '1700000000' };
    const hmac = sign(params);
    expect(verifyShopifyOAuthHmac({ ...params, hmac }, SECRET)).toBe(true);
  });

  it('rejects a wrong hmac', () => {
    const params = { code: 'abc123', shop: 'test-shop.myshopify.com', state: 'xyz' };
    expect(verifyShopifyOAuthHmac({ ...params, hmac: 'not-the-real-hmac' }, SECRET)).toBe(false);
  });

  it('rejects when hmac is missing', () => {
    expect(verifyShopifyOAuthHmac({ code: 'abc123' }, SECRET)).toBe(false);
  });

  it('excludes hmac and signature from the signed message', () => {
    const params = { code: 'abc123', shop: 'test-shop.myshopify.com' };
    const hmac = sign(params); // signed without "signature" present at all
    expect(verifyShopifyOAuthHmac({ ...params, hmac, signature: 'irrelevant' }, SECRET)).toBe(true);
  });

  it('rejects a tampered parameter even if hmac matches a different value', () => {
    const params = { code: 'abc123', shop: 'test-shop.myshopify.com' };
    const hmac = sign(params);
    expect(verifyShopifyOAuthHmac({ code: 'tampered', shop: params.shop, hmac }, SECRET)).toBe(false);
  });
});

describe('verifyShopifyWebhookHmac', () => {
  function sign(rawBody: Buffer): string {
    return createHmac('sha256', SECRET).update(rawBody).digest('base64');
  }

  it('accepts a genuinely signed raw body', () => {
    const rawBody = Buffer.from(JSON.stringify({ id: 12345, email: 'buyer@example.com' }));
    const header = sign(rawBody);
    expect(verifyShopifyWebhookHmac(rawBody, header, SECRET)).toBe(true);
  });

  it('rejects a wrong signature', () => {
    const rawBody = Buffer.from(JSON.stringify({ id: 12345 }));
    expect(verifyShopifyWebhookHmac(rawBody, 'not-the-real-signature', SECRET)).toBe(false);
  });

  it('rejects when the header is missing', () => {
    const rawBody = Buffer.from('{}');
    expect(verifyShopifyWebhookHmac(rawBody, undefined, SECRET)).toBe(false);
  });

  it('rejects a byte-for-byte different re-serialization of the same logical JSON', () => {
    // Same data, different whitespace — this is exactly why the webhook
    // controller must verify against req.rawBody, never JSON.stringify(req.body).
    const original = Buffer.from('{"id":12345,"total_price":"10.00"}');
    const header = sign(original);
    const differentlyFormatted = Buffer.from('{"id": 12345, "total_price": "10.00"}');
    expect(verifyShopifyWebhookHmac(differentlyFormatted, header, SECRET)).toBe(false);
  });
});
