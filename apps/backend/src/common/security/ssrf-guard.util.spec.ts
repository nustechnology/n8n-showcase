import { BadGatewayException } from '@nestjs/common';

jest.mock('dns/promises', () => ({ lookup: jest.fn() }));

import { lookup } from 'dns/promises';

import { assertPublicHttpsUrl } from './ssrf-guard.util';

describe('assertPublicHttpsUrl', () => {
  const mockLookup = lookup as jest.Mock;

  beforeEach(() => {
    mockLookup.mockReset();
  });

  it('rejects a malformed URL', async () => {
    await expect(assertPublicHttpsUrl('not a url', 'Odoo instance URL')).rejects.toBeInstanceOf(
      BadGatewayException,
    );
  });

  it('rejects http:// (non-https)', async () => {
    await expect(assertPublicHttpsUrl('http://odoo.example.com', 'Odoo instance URL')).rejects.toBeInstanceOf(
      BadGatewayException,
    );
  });

  it('rejects localhost', async () => {
    await expect(assertPublicHttpsUrl('https://localhost', 'Odoo instance URL')).rejects.toBeInstanceOf(
      BadGatewayException,
    );
  });

  it.each([
    ['127.0.0.1', 'loopback'],
    ['10.0.0.5', 'RFC1918 10/8'],
    ['172.16.0.1', 'RFC1918 172.16/12'],
    ['192.168.1.1', 'RFC1918 192.168/16'],
    ['169.254.169.254', 'link-local / cloud metadata'],
  ])('rejects a literal private IPv4 address %s (%s)', async (ip) => {
    await expect(assertPublicHttpsUrl(`https://${ip}`, 'Odoo instance URL')).rejects.toBeInstanceOf(
      BadGatewayException,
    );
  });

  it('rejects ::1 (IPv6 loopback) as a literal address', async () => {
    await expect(assertPublicHttpsUrl('https://[::1]', 'Odoo instance URL')).rejects.toBeInstanceOf(
      BadGatewayException,
    );
  });

  it('rejects a hostname that resolves to a private address', async () => {
    mockLookup.mockResolvedValue({ address: '10.1.2.3', family: 4 });

    await expect(assertPublicHttpsUrl('https://internal.example.com', 'Odoo instance URL')).rejects.toBeInstanceOf(
      BadGatewayException,
    );
  });

  it('rejects a hostname that fails to resolve', async () => {
    mockLookup.mockRejectedValue(new Error('ENOTFOUND'));

    await expect(assertPublicHttpsUrl('https://nowhere.example.com', 'Odoo instance URL')).rejects.toBeInstanceOf(
      BadGatewayException,
    );
  });

  it('allows an https URL whose hostname resolves to a public address', async () => {
    mockLookup.mockResolvedValue({ address: '203.0.113.10', family: 4 });

    const result = await assertPublicHttpsUrl('https://odoo.example.com/some/path', 'Odoo instance URL');

    expect(result.hostname).toBe('odoo.example.com');
  });
});
