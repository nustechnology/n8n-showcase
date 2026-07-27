import { BadGatewayException, ConflictException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';

import { N8nOrchestratorService } from '../internal/n8n-orchestrator.service';

import { PrismaService } from '../prisma/prisma.service';

import { RealtimeService } from '../realtime/realtime.service';

import { WorkflowRunsService } from './workflow-runs.service';

describe('WorkflowRunsService', () => {
  let service: WorkflowRunsService;
  let prisma: { workflowRun: { findMany: jest.Mock; findFirst: jest.Mock } };
  let n8nOrchestrator: { startOrderValidationRun: jest.Mock };
  let realtime: { streamWorkflowRun: jest.Mock };

  beforeEach(async () => {
    prisma = { workflowRun: { findMany: jest.fn(), findFirst: jest.fn() } };
    n8nOrchestrator = { startOrderValidationRun: jest.fn() };
    realtime = { streamWorkflowRun: jest.fn() };

    const moduleRef = await Test.createTestingModule({
      providers: [
        WorkflowRunsService,
        { provide: PrismaService, useValue: prisma },
        { provide: N8nOrchestratorService, useValue: n8nOrchestrator },
        { provide: RealtimeService, useValue: realtime },
      ],
    }).compile();

    service = moduleRef.get(WorkflowRunsService);
  });

  it('findAll scopes to the tenant', async () => {
    prisma.workflowRun.findMany.mockResolvedValue([]);
    await service.findAll('t_1');
    expect(prisma.workflowRun.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { tenantId: 't_1' } }),
    );
  });

  // Regression guard: workflowRunSchema on the frontend requires a `steps`
  // array on every entry, including list results — a plain findMany()
  // without this include silently returns rows with no `steps` property,
  // which fails Zod parsing on every call to GET /workflow-runs.
  it('findAll includes steps, ordered by sequence', async () => {
    prisma.workflowRun.findMany.mockResolvedValue([]);
    await service.findAll('t_1');
    expect(prisma.workflowRun.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ include: { steps: { orderBy: { sequence: 'asc' } } } }),
    );
  });

  it('findOne 404s when the run does not belong to this tenant', async () => {
    prisma.workflowRun.findFirst.mockResolvedValue(null);
    await expect(service.findOne('t_1', 'r_1')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('findOne includes steps ordered by sequence', async () => {
    prisma.workflowRun.findFirst.mockResolvedValue({ id: 'r_1', tenantId: 't_1', steps: [] });
    await service.findOne('t_1', 'r_1');
    expect(prisma.workflowRun.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'r_1', tenantId: 't_1' },
        include: { steps: { orderBy: { sequence: 'asc' } } },
      }),
    );
  });

  it('retry rejects a run that is not FAILED', async () => {
    prisma.workflowRun.findFirst.mockResolvedValue({ id: 'r_1', tenantId: 't_1', status: 'SUCCEEDED', orderId: 'o_1' });
    await expect(service.retry('t_1', 'r_1')).rejects.toBeInstanceOf(ConflictException);
    expect(n8nOrchestrator.startOrderValidationRun).not.toHaveBeenCalled();
  });

  it('retry rejects a FAILED run with no associated order', async () => {
    prisma.workflowRun.findFirst.mockResolvedValue({ id: 'r_1', tenantId: 't_1', status: 'FAILED', orderId: null });
    await expect(service.retry('t_1', 'r_1')).rejects.toBeInstanceOf(ConflictException);
    expect(n8nOrchestrator.startOrderValidationRun).not.toHaveBeenCalled();
  });

  it('retry re-invokes the orchestrator for a FAILED run with an order', async () => {
    prisma.workflowRun.findFirst.mockResolvedValue({ id: 'r_1', tenantId: 't_1', status: 'FAILED', orderId: 'o_1' });
    n8nOrchestrator.startOrderValidationRun.mockResolvedValue(undefined);

    const result = await service.retry('t_1', 'r_1');

    expect(n8nOrchestrator.startOrderValidationRun).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: 't_1', orderId: 'o_1' }),
    );
    expect(result).toEqual({ accepted: true });
  });

  it('retry surfaces an orchestrator failure as a BadGatewayException', async () => {
    prisma.workflowRun.findFirst.mockResolvedValue({ id: 'r_1', tenantId: 't_1', status: 'FAILED', orderId: 'o_1' });
    n8nOrchestrator.startOrderValidationRun.mockRejectedValue(new Error('n8n unreachable'));

    await expect(service.retry('t_1', 'r_1')).rejects.toBeInstanceOf(BadGatewayException);
  });

  it('stream 404s before subscribing if the run is not this tenant\'s', async () => {
    prisma.workflowRun.findFirst.mockResolvedValue(null);
    await expect(service.stream('t_1', 'r_1')).rejects.toBeInstanceOf(NotFoundException);
    expect(realtime.streamWorkflowRun).not.toHaveBeenCalled();
  });

  it('stream delegates to RealtimeService once the run is confirmed', async () => {
    prisma.workflowRun.findFirst.mockResolvedValue({ id: 'r_1', tenantId: 't_1', steps: [] });
    realtime.streamWorkflowRun.mockReturnValue('an-observable');

    const result = await service.stream('t_1', 'r_1');

    expect(realtime.streamWorkflowRun).toHaveBeenCalledWith('t_1', 'r_1');
    expect(result).toBe('an-observable');
  });
});
