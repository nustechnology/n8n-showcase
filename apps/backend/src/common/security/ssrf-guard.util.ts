import { lookup } from 'dns/promises';
import { isIPv4, isIPv6 } from 'net';

import { BadGatewayException } from '@nestjs/common';

function isPrivateOrReservedIpv4(ip: string): boolean {
  const [a, b] = ip.split('.').map(Number);
  return (
    a === 0 || // "this network"
    a === 10 || // RFC1918
    a === 127 || // loopback
    (a === 169 && b === 254) || // link-local, incl. cloud metadata (169.254.169.254)
    (a === 172 && b >= 16 && b <= 31) || // RFC1918
    (a === 192 && b === 168) // RFC1918
  );
}

function isPrivateOrReservedIpv6(ip: string): boolean {
  const lower = ip.toLowerCase();

  // IPv4-mapped IPv6 addresses (::ffff/96) — extract the embedded IPv4
  // address and check it with the IPv4 private/reserved logic. Handles both
  // mixed notation (::ffff:127.0.0.1) and hex notation (::ffff:7f00:1),
  // since Node's URL parser normalizes the former into the latter.
  if (lower.startsWith('::ffff:')) {
    const ipv4Suffix = lower.slice(7);
    if (ipv4Suffix.includes('.')) {
      if (isIPv4(ipv4Suffix)) return isPrivateOrReservedIpv4(ipv4Suffix);
    } else {
      const hexParts = ipv4Suffix.split(':');
      if (hexParts.length === 2) {
        const high = parseInt(hexParts[0], 16);
        const low = parseInt(hexParts[1], 16);
        if (!isNaN(high) && !isNaN(low)) {
          const a = (high >> 8) & 0xff;
          const b = high & 0xff;
          const c = (low >> 8) & 0xff;
          const d = low & 0xff;
          return isPrivateOrReservedIpv4(`${a}.${b}.${c}.${d}`);
        }
      }
    }
    // Malformed IPv4-mapped suffix — block it
    return true;
  }

  return (
    lower === '::1' ||
    lower.startsWith('fc') ||
    lower.startsWith('fd') ||
    lower.startsWith('fe80')
  );
}

// Resolves `hostname` and rejects it if the resolved address is a private,
// loopback, or link-local range — the same class of address a cloud
// metadata endpoint or an internal-only service lives on. This is a
// point-in-time check: it doesn't pin the connection to the resolved IP, so
// it doesn't fully close a DNS-rebinding attack (the target changing its
// DNS answer between this check and the actual fetch). Acceptable here
// because this only gates an `integrations:manage`-only, tenant-supplied
// self-hosted URL — not a fix that needs to hold against a hostile network.
async function assertResolvesToPublicAddress(rawHostname: string, label: string): Promise<void> {
  // URL.hostname keeps brackets around IPv6 literals (e.g. "[::1]") — strip
  // them before testing with net.isIPv6, which expects the bare address.
  const hostname = rawHostname.replace(/^\[(.+)\]$/, '$1');

  if (hostname === 'localhost') {
    throw new BadGatewayException(`${label} may not point to localhost`);
  }

  if (isIPv4(hostname)) {
    if (isPrivateOrReservedIpv4(hostname)) {
      throw new BadGatewayException(`${label} may not point to a private or reserved address`);
    }
    return;
  }

  if (isIPv6(hostname)) {
    if (isPrivateOrReservedIpv6(hostname)) {
      throw new BadGatewayException(`${label} may not point to a private or reserved address`);
    }
    return;
  }

  const resolved = await lookup(hostname).catch(() => null);
  if (!resolved) {
    throw new BadGatewayException(`${label} host could not be resolved`);
  }
  const isPrivate = isIPv4(resolved.address)
    ? isPrivateOrReservedIpv4(resolved.address)
    : isPrivateOrReservedIpv6(resolved.address);
  if (isPrivate) {
    throw new BadGatewayException(`${label} resolves to a private or reserved address, which is not allowed`);
  }
}

/**
 * Validates a tenant-supplied URL before it's ever used as an outbound
 * `fetch()` destination: https-only, and the hostname must not resolve to a
 * private/loopback/link-local address. Throws `BadGatewayException` (never
 * silently rewrites the URL) so callers can surface a clear connect-time
 * error instead of the backend quietly reaching an internal service.
 */
export async function assertPublicHttpsUrl(rawUrl: string, label: string): Promise<URL> {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new BadGatewayException(`${label} is not a valid URL`);
  }
  if (parsed.protocol !== 'https:') {
    throw new BadGatewayException(`${label} must use https://`);
  }

  await assertResolvesToPublicAddress(parsed.hostname, label);

  return parsed;
}
