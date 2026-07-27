import { NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';

import { PrismaService } from '../prisma/prisma.service';

import { AiValidationService } from './ai-validation.service';

describe('AiValidationService', () => {
  let service: AiValidationService;
  let prisma: { order: { findFirst: jest.Mock } };

  beforeEach(async () => {
    prisma = { order: { findFirst: jest.fn() } };

    const moduleRef = await Test.createTestingModule({
      providers: [AiValidationService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = moduleRef.get(AiValidationService);
  });

  it('404s when the order does not belong to this tenant', async () => {
    prisma.order.findFirst.mockResolvedValue(null);
    await expect(service.validateOrder('t_1', 'o_1')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('passes an order with a customer email and a positive total', async () => {
    prisma.order.findFirst.mockResolvedValue({
      id: 'o_1',
      tenantId: 't_1',
      customerEmail: 'a@example.com',
      totalAmount: 10,
    });

    const result = await service.validateOrder('t_1', 'o_1');

    expect(result.valid).toBe(true);
    expect(prisma.order.findFirst).toHaveBeenCalledWith({ where: { id: 'o_1', tenantId: 't_1' } });
  });

  it('fails an order with no customer email', async () => {
    prisma.order.findFirst.mockResolvedValue({
      id: 'o_1',
      tenantId: 't_1',
      customerEmail: null,
      totalAmount: 10,
    });

    const result = await service.validateOrder('t_1', 'o_1');
    expect(result.valid).toBe(false);
  });

  it('fails an order with a non-positive total', async () => {
    prisma.order.findFirst.mockResolvedValue({
      id: 'o_1',
      tenantId: 't_1',
      customerEmail: 'a@example.com',
      totalAmount: 0,
    });

    const result = await service.validateOrder('t_1', 'o_1');
    expect(result.valid).toBe(false);
  });
});
