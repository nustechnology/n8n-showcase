import { Test } from '@nestjs/testing';

import { IntegrationProvider } from '@prisma/client';

import { CircuitBreakerService } from './circuit-breaker.service';
import { CircuitOpenException } from './circuit-open.exception';

describe('CircuitBreakerService', () => {
  let service: CircuitBreakerService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [CircuitBreakerService],
    }).compile();

    service = moduleRef.get(CircuitBreakerService);
  });

  it('passes through a successful call untouched', async () => {
    const result = await service.fire(IntegrationProvider.ZOHO_INVENTORY, async () => 'ok');
    expect(result).toBe('ok');
  });

  it('propagates the underlying error for a single failure without tripping', async () => {
    const upstreamError = new Error('zoho unreachable');
    await expect(
      service.fire(IntegrationProvider.ZOHO_INVENTORY, () => Promise.reject(upstreamError)),
    ).rejects.toBe(upstreamError);
  });

  it('trips after 5 consecutive Zoho failures and fails fast with CircuitOpenException, no 6th call made', async () => {
    const failing = jest.fn(() => Promise.reject(new Error('zoho unreachable')));

    for (let i = 0; i < 5; i++) {
      await expect(service.fire(IntegrationProvider.ZOHO_INVENTORY, failing)).rejects.toThrow(
        'zoho unreachable',
      );
    }
    expect(failing).toHaveBeenCalledTimes(5);

    const action = jest.fn(() => Promise.resolve('should not run'));
    await expect(service.fire(IntegrationProvider.ZOHO_INVENTORY, action)).rejects.toBeInstanceOf(
      CircuitOpenException,
    );
    expect(action).not.toHaveBeenCalled();
  });

  it('trips Slack only after 8 consecutive failures, not 5', async () => {
    const failing = jest.fn(() => Promise.reject(new Error('slack unreachable')));

    for (let i = 0; i < 7; i++) {
      await expect(service.fire(IntegrationProvider.SLACK, failing)).rejects.toThrow('slack unreachable');
    }
    // Still closed at 7 — the real upstream error still surfaces, not CircuitOpen.
    await expect(service.fire(IntegrationProvider.SLACK, failing)).rejects.toThrow('slack unreachable');
    expect(failing).toHaveBeenCalledTimes(8);

    const action = jest.fn(() => Promise.resolve('should not run'));
    await expect(service.fire(IntegrationProvider.SLACK, action)).rejects.toBeInstanceOf(CircuitOpenException);
    expect(action).not.toHaveBeenCalled();
  });

  it('keeps separate breaker state per provider', async () => {
    const zohoFailing = jest.fn(() => Promise.reject(new Error('zoho unreachable')));
    for (let i = 0; i < 5; i++) {
      await expect(service.fire(IntegrationProvider.ZOHO_INVENTORY, zohoFailing)).rejects.toThrow();
    }
    await expect(
      service.fire(IntegrationProvider.ZOHO_INVENTORY, () => Promise.resolve('x')),
    ).rejects.toBeInstanceOf(CircuitOpenException);

    // EasyPost's breaker is untouched by Zoho's failures.
    const result = await service.fire(IntegrationProvider.EASYPOST, async () => 'easypost-ok');
    expect(result).toBe('easypost-ok');
  });

  it('half-opens after the reset timeout and closes again on a successful trial call', async () => {
    jest.useFakeTimers();
    try {
      const failing = jest.fn(() => Promise.reject(new Error('zoho unreachable')));
      for (let i = 0; i < 5; i++) {
        await expect(service.fire(IntegrationProvider.ZOHO_INVENTORY, failing)).rejects.toThrow();
      }
      await expect(
        service.fire(IntegrationProvider.ZOHO_INVENTORY, () => Promise.resolve('x')),
      ).rejects.toBeInstanceOf(CircuitOpenException);

      jest.advanceTimersByTime(30_001);

      const recovered = await service.fire(IntegrationProvider.ZOHO_INVENTORY, async () => 'recovered');
      expect(recovered).toBe('recovered');

      // Closed again — a normal failure now surfaces as itself, not CircuitOpen.
      const upstreamError = new Error('zoho flaky');
      await expect(
        service.fire(IntegrationProvider.ZOHO_INVENTORY, () => Promise.reject(upstreamError)),
      ).rejects.toBe(upstreamError);
    } finally {
      jest.useRealTimers();
    }
  });

  it('CircuitOpenException carries a distinguishable error string and the retry window', async () => {
    const failing = jest.fn(() => Promise.reject(new Error('easypost down')));
    for (let i = 0; i < 5; i++) {
      await expect(service.fire(IntegrationProvider.EASYPOST, failing)).rejects.toThrow();
    }

    try {
      await service.fire(IntegrationProvider.EASYPOST, () => Promise.resolve('x'));
      throw new Error('expected CircuitOpenException');
    } catch (error) {
      expect(error).toBeInstanceOf(CircuitOpenException);
      const response = (error as CircuitOpenException).getResponse() as {
        statusCode: number;
        error: string;
        message: string;
        retryAfterMs: number;
      };
      expect(response.statusCode).toBe(503);
      expect(response.error).toBe('CircuitOpen');
      expect(response.retryAfterMs).toBe(30_000);
      expect(response.message).toContain('easypost');
    }
  });
});
