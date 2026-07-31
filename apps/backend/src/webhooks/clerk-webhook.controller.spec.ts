import { BadRequestException, RawBodyRequest } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';

import { Request } from 'express';
import { Webhook } from 'svix';

import { Prisma } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';

import { ClerkWebhookController } from './clerk-webhook.controller';
import { ClerkWebhookService } from './clerk-webhook.service';

// Uses the real svix library to sign, so this test exercises actual
// signature verification against the actual controller, not a mocked-out
// "it was called" check. standardwebhooks (svix's dependency) rejects
// anything more than 5 minutes old, so the timestamp has to be live —
// signSvix() takes it as a parameter only so tests can share one `now`.
const SECRET = `whsec_${Buffer.from('test-signing-secret-bytes').toString('base64')}`;

function signSvix(id: string, timestamp: Date, payload: string): string {
  return new Webhook(SECRET).sign(id, timestamp, payload);
}

function buildRequest(payload: string, headers: Record<string, string>): RawBodyRequest<Request> {
  return { rawBody: Buffer.from(payload), headers } as unknown as RawBodyRequest<Request>;
}

function signedRequest(id: string, payload: string): RawBodyRequest<Request> {
  const now = new Date();
  return buildRequest(payload, {
    'svix-id': id,
    'svix-timestamp': String(Math.floor(now.getTime() / 1000)),
    'svix-signature': signSvix(id, now, payload),
  });
}

const DUPLICATE_KEY_ERROR = new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
  code: 'P2002',
  clientVersion: '5.22.0',
});

describe('ClerkWebhookController', () => {
  let controller: ClerkWebhookController;
  let prisma: {
    webhookInboundEvent: { create: jest.Mock; updateMany: jest.Mock; update: jest.Mock };
  };
  let clerkWebhooks: { handle: jest.Mock };

  beforeEach(async () => {
    prisma = {
      webhookInboundEvent: {
        create: jest.fn().mockResolvedValue({}),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        update: jest.fn().mockResolvedValue({}),
      },
    };
    clerkWebhooks = { handle: jest.fn().mockResolvedValue(undefined) };

    const moduleRef = await Test.createTestingModule({
      controllers: [ClerkWebhookController],
      providers: [
        { provide: ConfigService, useValue: { getOrThrow: () => SECRET } },
        { provide: PrismaService, useValue: prisma },
        { provide: ClerkWebhookService, useValue: clerkWebhooks },
      ],
    }).compile();

    controller = moduleRef.get(ClerkWebhookController);
  });

  it('rejects a request with no raw body', async () => {
    const req = { rawBody: undefined, headers: {} } as unknown as RawBodyRequest<Request>;
    await expect(controller.handle(req)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects a request missing Svix headers', async () => {
    const req = buildRequest('{}', {});
    await expect(controller.handle(req)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects a request with an invalid signature', async () => {
    const payload = JSON.stringify({ type: 'organization.created', data: { id: 'org_1' } });
    const now = new Date();
    const req = buildRequest(payload, {
      'svix-id': 'msg_1',
      'svix-timestamp': String(Math.floor(now.getTime() / 1000)),
      'svix-signature': 'v1,not-a-real-signature',
    });
    await expect(controller.handle(req)).rejects.toBeInstanceOf(BadRequestException);
    expect(clerkWebhooks.handle).not.toHaveBeenCalled();
  });

  it('verifies a genuinely signed payload and dispatches it to the service', async () => {
    const payload = JSON.stringify({
      type: 'organization.created',
      data: { id: 'org_1', name: 'Alpha', slug: 'alpha' },
    });
    const id = 'msg_1';
    const req = signedRequest(id, payload);

    await expect(controller.handle(req)).resolves.toEqual({ received: true });

    expect(clerkWebhooks.handle).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'organization.created' }),
    );
    expect(prisma.webhookInboundEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ source: 'CLERK', externalId: id, status: 'PROCESSING' }),
      }),
    );
    expect(prisma.webhookInboundEvent.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: 'PROCESSED', processedAt: expect.any(Date) } }),
    );
  });

  it('is idempotent: a previously-PROCESSED svix-id is acked without re-processing', async () => {
    prisma.webhookInboundEvent.create.mockRejectedValue(DUPLICATE_KEY_ERROR);
    prisma.webhookInboundEvent.updateMany.mockResolvedValue({ count: 0 }); // not FAILED, so not reclaimable

    const payload = JSON.stringify({ type: 'organization.created', data: { id: 'org_1' } });
    const req = signedRequest('msg_1', payload);

    await expect(controller.handle(req)).resolves.toEqual({ received: true });

    expect(clerkWebhooks.handle).not.toHaveBeenCalled();
  });

  it('re-processes when the existing row is FAILED — a resend must not be silently swallowed', async () => {
    prisma.webhookInboundEvent.create.mockRejectedValue(DUPLICATE_KEY_ERROR);
    prisma.webhookInboundEvent.updateMany.mockResolvedValue({ count: 1 }); // reclaimed a FAILED row

    const payload = JSON.stringify({ type: 'organization.created', data: { id: 'org_1' } });
    const req = signedRequest('msg_1', payload);

    await expect(controller.handle(req)).resolves.toEqual({ received: true });

    expect(clerkWebhooks.handle).toHaveBeenCalled();
    expect(prisma.webhookInboundEvent.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: 'FAILED' }),
        data: expect.objectContaining({ status: 'PROCESSING', processedAt: null }),
      }),
    );
    expect(prisma.webhookInboundEvent.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: 'PROCESSED', processedAt: expect.any(Date) } }),
    );
  });

  it('rejects two concurrent deliveries of the same svix-id from both processing it', async () => {
    prisma.webhookInboundEvent.create
      .mockResolvedValueOnce({})
      .mockRejectedValueOnce(DUPLICATE_KEY_ERROR);
    prisma.webhookInboundEvent.updateMany.mockResolvedValue({ count: 0 });

    const payload = JSON.stringify({ type: 'organization.created', data: { id: 'org_1' } });
    const req1 = signedRequest('msg_1', payload);
    const req2 = signedRequest('msg_1', payload);

    const [first, second] = await Promise.all([controller.handle(req1), controller.handle(req2)]);

    expect(first).toEqual({ received: true });
    expect(second).toEqual({ received: true });
    expect(clerkWebhooks.handle).toHaveBeenCalledTimes(1);
  });

  it('still acks with 200 when the handler throws, and records FAILED', async () => {
    clerkWebhooks.handle.mockRejectedValue(new Error('boom'));

    const payload = JSON.stringify({ type: 'organization.created', data: { id: 'org_1' } });
    const req = signedRequest('msg_1', payload);

    await expect(controller.handle(req)).resolves.toEqual({ received: true });

    expect(prisma.webhookInboundEvent.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: 'FAILED' } }),
    );
  });
});
