import { createHmac, timingSafeEqual } from 'crypto';

function safeEqual(expected: string, actual: string): boolean {
  const expectedBuf = Buffer.from(expected, 'utf8');
  const actualBuf = Buffer.from(actual, 'utf8');
  if (expectedBuf.length !== actualBuf.length) return false;
  return timingSafeEqual(expectedBuf, actualBuf);
}

/**
 * OAuth callback HMAC: over the sorted, `&`-joined query string (excluding
 * hmac/signature), hex-encoded. Deliberately a separate function from
 * verifyShopifyWebhookHmac below, even though both are "verify a Shopify
 * HMAC" — the encoding and the thing being signed are different enough
 * that sharing one helper (or copy-pasting between call sites) is exactly
 * how one gets silently swapped for the other.
 */
export function verifyShopifyOAuthHmac(
  query: Record<string, string | undefined>,
  clientSecret: string,
): boolean {
  const { hmac, signature: _signature, ...rest } = query;
  if (!hmac) return false;
  const message = Object.keys(rest)
    .sort()
    .map((key) => `${key}=${rest[key] ?? ''}`)
    .join('&');
  const expected = createHmac('sha256', clientSecret).update(message).digest('hex');
  return safeEqual(expected, hmac);
}

/**
 * Webhook body HMAC: over the raw request body bytes, base64-encoded.
 * Must be computed over the untouched raw Buffer (req.rawBody), never a
 * re-serialized `JSON.stringify(req.body)` — that isn't guaranteed
 * byte-identical to what Shopify signed (key order, whitespace, unicode
 * escaping), and would make this reject genuine requests.
 */
export function verifyShopifyWebhookHmac(
  rawBody: Buffer,
  header: string | undefined,
  clientSecret: string,
): boolean {
  if (!header) return false;
  const expected = createHmac('sha256', clientSecret).update(rawBody).digest('base64');
  return safeEqual(expected, header);
}
