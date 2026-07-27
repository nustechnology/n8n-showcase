import { NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';

import { PrismaService } from '../prisma/prisma.service';

import { NotificationsService } from '../notifications/notifications.service';
import { RealtimeService } from '../realtime/realtime.service';

import { InternalService } from './internal.service';

describe('InternalService', () => {
  let service: InternalService;
  let prisma: {
    order: { findFirst: jest.Mock; findUnique: jest.Mock; update: jest.Mock };
    workflowRun: { create: jest.Mock; findUnique: jest.Mock; update: jest.Mock };
    workflowRunStep: { upsert: jest.Mock };
    orderEvent: { create: jest.Mock };
  };
  let notifications: { notifyTenant: jest.Mock };
  let realtime: { publishWorkflowRunUpdate: jest.Mock; publishOrderUpdate: jest.Mock };

  beforeEach(async () => {
    prisma = {
      order: { findFirst: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
      workflowRun: { create: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
      workflowRunStep: { upsert: jest.fn() },
      orderEvent: { create: jest.fn() },
    };
    notifications = { notifyTenant: jest.fn() };
    realtime = { publishWorkflowRunUpdate: jest.fn(), publishOrderUpdate: jest.fn() };

    const moduleRef = await Test.createTestingModule({
      providers: [
        InternalService,
        { provide: PrismaService, useValue: prisma },
        { provide: NotificationsService, useValue: notifications },
        { provide: RealtimeService, useValue: realtime },
      ],
    }).compile();

    service = moduleRef.get(InternalService);
  });

  describe('createWorkflowRun', () => {
    it('404s when the order does not belong to this tenant', async () => {
      prisma.order.findFirst.mockResolvedValue(null);
      await expect(
        service.createWorkflowRun({ tenantId: 't_1', orderId: 'o_1', correlationId: 'c_1' }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.workflowRun.create).not.toHaveBeenCalled();
    });

    it('creates a RUNNING run carrying the correlationId through, and returns its id', async () => {
      prisma.order.findFirst.mockResolvedValue({ id: 'o_1', tenantId: 't_1' });
      prisma.workflowRun.create.mockResolvedValue({ id: 'run_1', orderId: 'o_1', status: 'RUNNING' });

      const result = await service.createWorkflowRun({
        tenantId: 't_1',
        orderId: 'o_1',
        correlationId: 'c_1',
      });

      expect(prisma.workflowRun.create).toHaveBeenCalledWith({
        data: {
          tenantId: 't_1',
          orderId: 'o_1',
          correlationId: 'c_1',
          workflowName: 'order-validation',
          status: 'RUNNING',
        },
      });
      expect(result).toEqual({ workflowRunId: 'run_1' });
    });

    it('publishes a realtime workflow-run update for the new run', async () => {
      prisma.order.findFirst.mockResolvedValue({ id: 'o_1', tenantId: 't_1' });
      prisma.workflowRun.create.mockResolvedValue({ id: 'run_1', orderId: 'o_1', status: 'RUNNING' });

      await service.createWorkflowRun({ tenantId: 't_1', orderId: 'o_1', correlationId: 'c_1' });

      expect(realtime.publishWorkflowRunUpdate).toHaveBeenCalledWith({
        tenantId: 't_1',
        runId: 'run_1',
        orderId: 'o_1',
        status: 'RUNNING',
      });
    });
  });

  describe('updateOrderStatus', () => {
    it('404s when the order does not exist', async () => {
      prisma.order.findUnique.mockResolvedValue(null);
      await expect(service.updateOrderStatus('o_1', 'validated')).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(prisma.order.update).not.toHaveBeenCalled();
    });

    it('maps the wire value "validated" to OrderStatus.VALIDATED', async () => {
      prisma.order.findUnique.mockResolvedValue({ id: 'o_1', tenantId: 't_1' });
      await service.updateOrderStatus('o_1', 'validated');
      expect(prisma.order.update).toHaveBeenCalledWith({
        where: { id: 'o_1' },
        data: { status: 'VALIDATED' },
      });
    });

    it('maps the wire value "validation_failed" to OrderStatus.VALIDATION_FAILED', async () => {
      prisma.order.findUnique.mockResolvedValue({ id: 'o_1', tenantId: 't_1' });
      await service.updateOrderStatus('o_1', 'validation_failed');
      expect(prisma.order.update).toHaveBeenCalledWith({
        where: { id: 'o_1' },
        data: { status: 'VALIDATION_FAILED' },
      });
    });

    it.each([
      ['inventory_checked', 'INVENTORY_CHECKED'],
      ['shipment_created', 'SHIPMENT_CREATED'],
      ['fulfilled', 'FULFILLED'],
      ['notified', 'NOTIFIED'],
      ['failed', 'FAILED'],
    ])('maps the Phase 3 wire value "%s" to OrderStatus.%s', async (wireValue, prismaValue) => {
      prisma.order.findUnique.mockResolvedValue({ id: 'o_1', tenantId: 't_1' });
      await service.updateOrderStatus('o_1', wireValue as never);
      expect(prisma.order.update).toHaveBeenCalledWith({
        where: { id: 'o_1' },
        data: { status: prismaValue },
      });
    });

    it('records an OrderEvent when status is "failed" and a reason is given', async () => {
      prisma.order.findUnique.mockResolvedValue({ id: 'o_1', tenantId: 't_1' });
      await service.updateOrderStatus('o_1', 'failed', 'insufficient_stock');

      expect(prisma.orderEvent.create).toHaveBeenCalledWith({
        data: {
          orderId: 'o_1',
          tenantId: 't_1',
          eventType: 'order_failed',
          actor: 'n8n',
          payload: { reason: 'insufficient_stock' },
        },
      });
    });

    it('does not record an OrderEvent for a non-"failed" status even if a reason were passed', async () => {
      prisma.order.findUnique.mockResolvedValue({ id: 'o_1', tenantId: 't_1' });
      await service.updateOrderStatus('o_1', 'validated');
      expect(prisma.orderEvent.create).not.toHaveBeenCalled();
    });

    it('echoes the wire-format status back in the response, for n8n\'s Close Workflow Run branch', async () => {
      prisma.order.findUnique.mockResolvedValue({ id: 'o_1', tenantId: 't_1' });
      const result = await service.updateOrderStatus('o_1', 'failed', 'insufficient_stock');
      expect(result).toEqual({ updated: true, status: 'failed' });
    });

    it('publishes a realtime order update scoped to the order\'s tenant', async () => {
      prisma.order.findUnique.mockResolvedValue({ id: 'o_1', tenantId: 't_1' });
      await service.updateOrderStatus('o_1', 'validated');
      expect(realtime.publishOrderUpdate).toHaveBeenCalledWith({
        tenantId: 't_1',
        orderId: 'o_1',
        status: 'VALIDATED',
        type: 'order_status_changed',
      });
    });
  });

  describe('updateWorkflowRun', () => {
    it('404s when the workflow run does not exist', async () => {
      prisma.workflowRun.findUnique.mockResolvedValue(null);
      await expect(service.updateWorkflowRun('run_1', { status: 'completed' })).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(prisma.workflowRun.update).not.toHaveBeenCalled();
    });

    it('maps "completed" to SUCCEEDED and sets finishedAt', async () => {
      prisma.workflowRun.findUnique.mockResolvedValue({ id: 'run_1', tenantId: 't_1', orderId: 'o_1' });
      await service.updateWorkflowRun('run_1', { status: 'completed' });

      expect(prisma.workflowRun.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'run_1' },
          data: expect.objectContaining({ status: 'SUCCEEDED' }),
        }),
      );
      const call = prisma.workflowRun.update.mock.calls[0][0];
      expect(call.data.finishedAt).toBeInstanceOf(Date);
      expect(notifications.notifyTenant).not.toHaveBeenCalled();
    });

    it('maps "failed" to FAILED, stores the errorMessage, and notifies the tenant', async () => {
      prisma.workflowRun.findUnique.mockResolvedValue({ id: 'run_1', tenantId: 't_1', orderId: 'o_1' });
      await service.updateWorkflowRun('run_1', { status: 'failed', errorMessage: 'boom' });

      expect(prisma.workflowRun.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'FAILED', error: { message: 'boom' } }),
        }),
      );
      expect(realtime.publishWorkflowRunUpdate).toHaveBeenCalledWith({
        tenantId: 't_1',
        runId: 'run_1',
        orderId: 'o_1',
        status: 'FAILED',
      });
      expect(notifications.notifyTenant).toHaveBeenCalledWith('t_1', {
        type: 'workflow_failed',
        title: 'Workflow run failed',
        body: 'boom',
        payload: { workflowRunId: 'run_1', orderId: 'o_1' },
      });
    });

    it('does not re-notify on a redelivered "failed" callback for an already-FAILED run', async () => {
      prisma.workflowRun.findUnique.mockResolvedValue({
        id: 'run_1',
        tenantId: 't_1',
        orderId: 'o_1',
        status: 'FAILED',
      });

      await service.updateWorkflowRun('run_1', { status: 'failed', errorMessage: 'boom' });

      expect(notifications.notifyTenant).not.toHaveBeenCalled();
    });
  });

  describe('upsertWorkflowRunStep', () => {
    it('404s when the workflow run does not exist', async () => {
      prisma.workflowRun.findUnique.mockResolvedValue(null);
      await expect(
        service.upsertWorkflowRunStep('run_1', { stepKey: 'check_inventory', status: 'succeeded' }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.workflowRunStep.upsert).not.toHaveBeenCalled();
    });

    it('creates a new step with attempt 1, the static label/sequence, and startedAt/finishedAt set', async () => {
      prisma.workflowRun.findUnique.mockResolvedValue({ id: 'run_1', tenantId: 't_1' });
      prisma.workflowRunStep.upsert.mockResolvedValue({ id: 'step_1' });

      const result = await service.upsertWorkflowRunStep('run_1', {
        stepKey: 'check_inventory',
        status: 'succeeded',
      });

      expect(prisma.workflowRunStep.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { workflowRunId_stepKey: { workflowRunId: 'run_1', stepKey: 'check_inventory' } },
          create: expect.objectContaining({
            tenantId: 't_1',
            workflowRunId: 'run_1',
            stepKey: 'check_inventory',
            label: 'Check Inventory',
            sequence: 2,
            status: 'SUCCEEDED',
            attempt: 1,
          }),
        }),
      );
      const call = prisma.workflowRunStep.upsert.mock.calls[0][0];
      expect(call.create.startedAt).toBeInstanceOf(Date);
      expect(call.create.finishedAt).toBeInstanceOf(Date);
      expect(result).toEqual({ id: 'step_1' });
    });

    it('increments attempt on the update branch for a step called again', async () => {
      prisma.workflowRun.findUnique.mockResolvedValue({ id: 'run_1', tenantId: 't_1' });
      prisma.workflowRunStep.upsert.mockResolvedValue({ id: 'step_1' });

      await service.upsertWorkflowRunStep('run_1', {
        stepKey: 'create_shipment',
        status: 'failed',
        error: { message: 'carrier unreachable' },
      });

      expect(prisma.workflowRunStep.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          update: expect.objectContaining({
            status: 'FAILED',
            attempt: { increment: 1 },
            error: { message: 'carrier unreachable' },
          }),
        }),
      );
    });
  });

  describe('createOrderEvent', () => {
    it('404s when the order does not exist', async () => {
      prisma.order.findUnique.mockResolvedValue(null);
      await expect(
        service.createOrderEvent('o_1', { eventType: 'workflow.step' }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.orderEvent.create).not.toHaveBeenCalled();
    });

    it('derives tenantId from the parent order, not the request body', async () => {
      prisma.order.findUnique.mockResolvedValue({ id: 'o_1', tenantId: 't_1' });
      prisma.orderEvent.create.mockResolvedValue({ id: 'evt_1' });

      const result = await service.createOrderEvent('o_1', {
        eventType: 'workflow.step',
        payload: { step: 'validate_order' },
      });

      expect(prisma.orderEvent.create).toHaveBeenCalledWith({
        data: {
          orderId: 'o_1',
          tenantId: 't_1',
          eventType: 'workflow.step',
          actor: 'n8n',
          payload: { step: 'validate_order' },
        },
      });
      expect(result).toEqual({ id: 'evt_1' });
    });
  });
});
