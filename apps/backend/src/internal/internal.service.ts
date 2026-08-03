import { Injectable, NotFoundException } from '@nestjs/common';

import { OrderStatus, Prisma, WorkflowStepStatus } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';

import { NotificationsService } from '../notifications/notifications.service';
import { RealtimeService } from '../realtime/realtime.service';

import { CreateOrderEventInput } from './dto/create-order-event.schema';
import { CreateWorkflowRunInput } from './dto/create-workflow-run.schema';
import { CreateWorkflowRunStepInput, STEP_DEFINITIONS } from './dto/create-workflow-run-step.schema';
import { UpdateOrderStatusInput } from './dto/update-order-status.schema';
import { UpdateWorkflowRunInput } from './dto/update-workflow-run.schema';

// Wire value -> Prisma enum. Keys match UpdateOrderStatusSchema exactly —
// TS errors here if the schema and this map ever drift apart.
const ORDER_STATUS_BY_WIRE_VALUE: Record<UpdateOrderStatusInput['status'], OrderStatus> = {
  validated: OrderStatus.VALIDATED,
  validation_failed: OrderStatus.VALIDATION_FAILED,
  inventory_checked: OrderStatus.INVENTORY_CHECKED,
  shipment_created: OrderStatus.SHIPMENT_CREATED,
  fulfilled: OrderStatus.FULFILLED,
  notified: OrderStatus.NOTIFIED,
  failed: OrderStatus.FAILED,
};

// Same wire-value convention as the order status map above — n8n's
// "Record ... Step" nodes send lowercase, not WorkflowStepStatus's own
// casing.
const WORKFLOW_STEP_STATUS_BY_WIRE_VALUE: Record<CreateWorkflowRunStepInput['status'], WorkflowStepStatus> = {
  succeeded: WorkflowStepStatus.SUCCEEDED,
  failed: WorkflowStepStatus.FAILED,
  skipped: WorkflowStepStatus.SKIPPED,
};

@Injectable()
export class InternalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly realtime: RealtimeService,
  ) {}

  async createWorkflowRun(input: CreateWorkflowRunInput): Promise<{ workflowRunId: string }> {
    if (input.orderId) {
      const order = await this.prisma.order.findFirst({
        where: { id: input.orderId, tenantId: input.tenantId },
      });
      if (!order) {
        throw new NotFoundException('Order not found for this tenant');
      }
    }

    const run = await this.prisma.workflowRun.create({
      data: {
        tenantId: input.tenantId,
        orderId: input.orderId ?? null,
        correlationId: input.correlationId,
        workflowName: input.workflowName ?? 'order-validation',
        status: 'RUNNING',
      },
    });

    this.realtime.publishWorkflowRunUpdate({
      tenantId: input.tenantId,
      runId: run.id,
      orderId: run.orderId,
      status: run.status,
    });

    return { workflowRunId: run.id };
  }

  // No tenantId on this call (see apps/n8n/workflows/order-validation.json
  // order-validation workflow) — Order.id is a globally-unique cuid, so a
  // primary-key lookup can't cross tenants the way a client-supplied
  // tenantId could be spoofed. Same precedent as ShopifyWebhookController's
  // Integration.id lookup.
  async updateOrderStatus(orderId: string, status: UpdateOrderStatusInput['status'], reason?: string) {
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order) {
      throw new NotFoundException('Order not found');
    }

    const newStatus = ORDER_STATUS_BY_WIRE_VALUE[status];
    await this.prisma.order.update({ where: { id: orderId }, data: { status: newStatus } });

    // Only the hard-failure branches send a reason — records the same
    // { reason } payload the backend Phase 3 contract specifies, on the
    // append-only timeline rather than overloading this status write.
    if (status === 'failed' && reason) {
      await this.prisma.orderEvent.create({
        data: {
          orderId,
          tenantId: order.tenantId,
          eventType: 'order_failed',
          actor: 'n8n',
          payload: { reason } as Prisma.InputJsonValue,
        },
      });
    }

    this.realtime.publishOrderUpdate({
      tenantId: order.tenantId,
      orderId,
      status: newStatus,
      type: 'order_status_changed',
    });

    // Echoes the wire-format value back (not the Prisma enum) — the n8n
    // workflow's "Close Workflow Run" node branches on
    // ['failed','validation_failed'].includes($json.status) using this
    // exact response.
    return { updated: true, status };
  }

  async updateWorkflowRun(id: string, input: UpdateWorkflowRunInput) {
    const run = await this.prisma.workflowRun.findUnique({ where: { id } });
    if (!run) {
      throw new NotFoundException('Workflow run not found');
    }

    const newStatus = input.status === 'completed' ? 'SUCCEEDED' : 'FAILED';
    await this.prisma.workflowRun.update({
      where: { id },
      data: {
        status: newStatus,
        finishedAt: new Date(),
        error: input.errorMessage ? { message: input.errorMessage } : Prisma.DbNull,
      },
    });

    this.realtime.publishWorkflowRunUpdate({
      tenantId: run.tenantId,
      runId: id,
      orderId: run.orderId,
      status: newStatus,
    });

    // Only notify on the actual transition into FAILED — a redelivered
    // "failed" callback for a run that's already FAILED shouldn't
    // re-notify every active member each time.
    if (newStatus === 'FAILED' && run.status !== 'FAILED') {
      await this.notifications.notifyTenant(run.tenantId, {
        type: 'workflow_failed',
        title: 'Workflow run failed',
        body: input.errorMessage,
        payload: { workflowRunId: id, orderId: run.orderId },
      });
    }

    return { updated: true };
  }

  // First real writer to WorkflowRunStep — that model has existed since
  // Phase 1 with zero writers. Upserts on the (workflowRunId, stepKey)
  // unique constraint: a first call creates the row (attempt 1); n8n
  // calling this again for the same step (e.g. after a retry) increments
  // attempt rather than creating a second row.
  async upsertWorkflowRunStep(workflowRunId: string, input: CreateWorkflowRunStepInput) {
    const run = await this.prisma.workflowRun.findUnique({ where: { id: workflowRunId } });
    if (!run) {
      throw new NotFoundException('Workflow run not found');
    }

    const definition = STEP_DEFINITIONS[input.stepKey];
    const status = WORKFLOW_STEP_STATUS_BY_WIRE_VALUE[input.status];
    const now = new Date();
    const step = await this.prisma.workflowRunStep.upsert({
      where: { workflowRunId_stepKey: { workflowRunId, stepKey: input.stepKey } },
      create: {
        tenantId: run.tenantId,
        workflowRunId,
        stepKey: input.stepKey,
        label: definition.label,
        sequence: definition.sequence,
        status,
        attempt: 1,
        startedAt: now,
        finishedAt: now,
        error: (input.error as Prisma.InputJsonValue | undefined) ?? Prisma.DbNull,
      },
      update: {
        status,
        attempt: { increment: 1 },
        finishedAt: now,
        error: (input.error as Prisma.InputJsonValue | undefined) ?? Prisma.DbNull,
      },
    });

    return { id: step.id };
  }

  async createOrderEvent(orderId: string, input: CreateOrderEventInput) {
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order) {
      throw new NotFoundException('Order not found');
    }

    const event = await this.prisma.orderEvent.create({
      data: {
        orderId,
        tenantId: order.tenantId,
        eventType: input.eventType,
        actor: 'n8n',
        payload: input.payload as Prisma.InputJsonValue | undefined,
      },
    });

    return { id: event.id };
  }
}
