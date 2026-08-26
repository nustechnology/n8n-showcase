import { randomUUID } from 'crypto';

import { BadGatewayException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';

import { Observable } from 'rxjs';

import { Prisma } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';

import { N8nOrchestratorService } from '../internal/n8n-orchestrator.service';
import { RealtimeService } from '../realtime/realtime.service';

import { ListWorkflowRunsInput } from './dto/list-workflow-runs.schema';

const DEFAULT_TAKE = 10;

@Injectable()
export class WorkflowRunsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly n8nOrchestrator: N8nOrchestratorService,
    private readonly realtime: RealtimeService,
  ) {}

  async findAll(tenantId: string, query: ListWorkflowRunsInput) {
    const take = query.take ?? DEFAULT_TAKE;
    const skip = query.skip ?? 0;
    const where: Prisma.WorkflowRunWhereInput = {
      tenantId,
      ...(query.status ? { status: query.status } : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.workflowRun.findMany({
        where,
        orderBy: { startedAt: 'desc' },
        include: { steps: { orderBy: { sequence: 'asc' } } },
        take,
        skip,
      }),
      this.prisma.workflowRun.count({ where }),
    ]);

    return { items, total };
  }

  async findOne(tenantId: string, id: string) {
    const run = await this.prisma.workflowRun.findFirst({
      where: { id, tenantId },
      include: { steps: { orderBy: { sequence: 'asc' } } },
    });
    if (!run) {
      throw new NotFoundException('Workflow run not found');
    }
    return run;
  }

  // Re-invokes the same n8n webhook the Shopify order webhook handler
  // already triggers on a new order — this call is manual instead. Doesn't
  // mutate the existing FAILED run row: n8n's workflow calls back into
  // POST /internal/workflow-runs on restart, which creates a fresh row.
  async retry(tenantId: string, id: string): Promise<{ accepted: true }> {
    const run = await this.findOne(tenantId, id);

    if (run.status !== 'FAILED') {
      throw new ConflictException('Only a failed workflow run can be retried');
    }
    if (!run.orderId) {
      throw new ConflictException('Workflow run has no associated order to retry');
    }

    try {
      await this.n8nOrchestrator.startOrderValidationRun({
        tenantId,
        orderId: run.orderId,
        correlationId: randomUUID(),
      });
    } catch {
      throw new BadGatewayException('Failed to trigger the order-validation workflow');
    }

    return { accepted: true };
  }

  async stream(tenantId: string, id: string): Promise<Observable<MessageEvent>> {
    await this.findOne(tenantId, id); // 404s if the run doesn't belong to this tenant
    return this.realtime.streamWorkflowRun(tenantId, id);
  }
}
