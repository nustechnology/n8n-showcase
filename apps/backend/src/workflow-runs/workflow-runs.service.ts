import { randomUUID } from 'crypto';

import { BadGatewayException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';

import { Observable } from 'rxjs';

import { PrismaService } from '../prisma/prisma.service';

import { N8nOrchestratorService } from '../internal/n8n-orchestrator.service';
import { RealtimeService } from '../realtime/realtime.service';

// No pagination UI exists yet — the frontend fetches this once and renders
// the whole array (see workflow-runs-list.tsx). This cap just bounds the
// query and response size for a tenant with a very large run history; it
// isn't a substitute for real pagination if that's ever needed. (Each run's
// own `steps` is already inherently bounded — at most one row per the 5
// known STEP_DEFINITIONS keys — so it's the runs themselves that needed a
// limit, not the include.)
const MAX_WORKFLOW_RUNS_RETURNED = 100;

@Injectable()
export class WorkflowRunsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly n8nOrchestrator: N8nOrchestratorService,
    private readonly realtime: RealtimeService,
  ) {}

  findAll(tenantId: string) {
    return this.prisma.workflowRun.findMany({
      where: { tenantId },
      orderBy: { startedAt: 'desc' },
      include: { steps: { orderBy: { sequence: 'asc' } } },
      take: MAX_WORKFLOW_RUNS_RETURNED,
    });
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
