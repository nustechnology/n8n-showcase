import { Prisma, WebhookSource } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';

export interface ClaimWebhookInboundEventInput {
  source: WebhookSource;
  externalId: string;
  tenantId?: string;
  payload: Prisma.InputJsonValue;
  headers: Prisma.InputJsonValue;
}

// Claims the (source, externalId) row before any business logic runs, so
// two concurrent deliveries of the same event can't both pass a
// check-then-act gap and both process it. A brand-new externalId is
// claimed by `create()` succeeding — the unique constraint on
// (source, externalId) means at most one concurrent `create()` for the
// same event can ever win, the other gets a P2002 instead. A PRIOR row is
// only reclaimable if it's still FAILED (the one status allowed to be
// reprocessed — a manual "resend" or a provider's own redelivery reusing
// the same id is exactly how a failed webhook gets recovered), and that
// reclaim itself is an atomic `updateMany` guarded by `status: 'FAILED'`
// so two concurrent retries of the same FAILED row can't both win either.
export async function claimWebhookInboundEvent(
  prisma: PrismaService,
  input: ClaimWebhookInboundEventInput,
): Promise<boolean> {
  try {
    await prisma.webhookInboundEvent.create({
      data: {
        tenantId: input.tenantId,
        source: input.source,
        externalId: input.externalId,
        payload: input.payload,
        headers: input.headers,
        signatureValid: true,
        status: 'PROCESSING',
      },
    });
    return true;
  } catch (error) {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') {
      throw error;
    }
  }

  const reclaimed = await prisma.webhookInboundEvent.updateMany({
    where: { source: input.source, externalId: input.externalId, status: 'FAILED' },
    data: {
      tenantId: input.tenantId,
      payload: input.payload,
      headers: input.headers,
      status: 'PROCESSING',
      processedAt: null,
    },
  });

  return reclaimed.count === 1;
}
