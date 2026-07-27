import { Injectable, Logger } from '@nestjs/common';

import CircuitBreaker from 'opossum';

import { IntegrationProvider } from '@prisma/client';

import { CircuitOpenException } from './circuit-open.exception';

interface BreakerConfig {
  // Short lowercase name used in the CircuitOpen error message/logs — e.g.
  // "zoho is temporarily unavailable", not the Prisma enum spelling.
  label: string;
  volumeThreshold: number;
  resetTimeout: number;
}

// opossum's breaker is percentage-based over a rolling window, not a literal
// consecutive-failure counter — errorThresholdPercentage: 99 combined with a
// volumeThreshold approximates "N consecutive failures" well enough for
// this: the breaker only opens once at least N calls have landed in the
// window and (effectively) every one of them failed, so a success anywhere
// in between keeps the error rate under 99% and the circuit closed. (100
// itself doesn't work here — opossum opens only when errorRate strictly
// *exceeds* the threshold, and errorRate can never exceed 100.)
const ERROR_THRESHOLD_PERCENTAGE = 99;
const ROLLING_COUNT_TIMEOUT_MS = 60_000;
const ROLLING_COUNT_BUCKETS = 10;

const DEFAULT_THRESHOLD = 5;
const DEFAULT_RESET_TIMEOUT_MS = 30_000;

const PROVIDER_CONFIG: Partial<Record<IntegrationProvider, BreakerConfig>> = {
  [IntegrationProvider.ZOHO_INVENTORY]: {
    label: 'zoho',
    volumeThreshold: DEFAULT_THRESHOLD,
    resetTimeout: DEFAULT_RESET_TIMEOUT_MS,
  },
  [IntegrationProvider.EASYPOST]: {
    label: 'easypost',
    volumeThreshold: DEFAULT_THRESHOLD,
    resetTimeout: DEFAULT_RESET_TIMEOUT_MS,
  },
  [IntegrationProvider.SHOPIFY]: {
    label: 'shopify',
    volumeThreshold: DEFAULT_THRESHOLD,
    resetTimeout: DEFAULT_RESET_TIMEOUT_MS,
  },
  // Slack is already best-effort by design (Phase 3 §4) — a shorter
  // cooldown and a higher failure count both match that: Slack outages
  // shouldn't trip as eagerly as a provider n8n's workflow actually depends
  // on to proceed.
  [IntegrationProvider.SLACK]: { label: 'slack', volumeThreshold: 8, resetTimeout: 15_000 },
  [IntegrationProvider.RESEND]: {
    label: 'resend',
    volumeThreshold: DEFAULT_THRESHOLD,
    resetTimeout: DEFAULT_RESET_TIMEOUT_MS,
  },
};

type Job = () => Promise<unknown>;

// Wraps every outbound third-party call (IntegrationActionsService's four
// actions, IntegrationsService.test()) behind one opossum breaker per
// provider, shared across every call to that provider for the life of the
// process — breaker state living in-process (not Redis) is the same
// "right amount of infrastructure for current scale" call already made for
// RealtimeService's plain EventEmitter.
@Injectable()
export class CircuitBreakerService {
  private readonly logger = new Logger(CircuitBreakerService.name);
  private readonly breakers = new Map<IntegrationProvider, CircuitBreaker<[Job], unknown>>();

  async fire<T>(provider: IntegrationProvider, action: () => Promise<T>): Promise<T> {
    const breaker = this.getOrCreateBreaker(provider);
    try {
      return (await breaker.fire(action)) as T;
    } catch (error) {
      if ((error as { code?: string }).code === 'EOPENBREAKER') {
        const config = this.configFor(provider);
        throw new CircuitOpenException(config.label, config.resetTimeout);
      }
      throw error;
    }
  }

  private getOrCreateBreaker(provider: IntegrationProvider): CircuitBreaker<[Job], unknown> {
    const existing = this.breakers.get(provider);
    if (existing) return existing;

    const config = this.configFor(provider);
    const breaker = new CircuitBreaker<[Job], unknown>((job) => job(), {
      errorThresholdPercentage: ERROR_THRESHOLD_PERCENTAGE,
      volumeThreshold: config.volumeThreshold,
      resetTimeout: config.resetTimeout,
      rollingCountTimeout: ROLLING_COUNT_TIMEOUT_MS,
      rollingCountBuckets: ROLLING_COUNT_BUCKETS,
    });
    breaker.on('open', () => this.logger.warn(`Circuit breaker opened for ${config.label}`));
    breaker.on('halfOpen', () =>
      this.logger.log(`Circuit breaker half-open for ${config.label}, trialing one call`),
    );
    breaker.on('close', () => this.logger.log(`Circuit breaker closed for ${config.label}`));
    this.breakers.set(provider, breaker);
    return breaker;
  }

  private configFor(provider: IntegrationProvider): BreakerConfig {
    return (
      PROVIDER_CONFIG[provider] ?? {
        label: provider.toLowerCase(),
        volumeThreshold: DEFAULT_THRESHOLD,
        resetTimeout: DEFAULT_RESET_TIMEOUT_MS,
      }
    );
  }
}
