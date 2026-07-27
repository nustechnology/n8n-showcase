import nock from 'nock';

import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';

import { N8nOrchestratorService } from './n8n-orchestrator.service';

describe('N8nOrchestratorService', () => {
  let service: N8nOrchestratorService;

  beforeEach(async () => {
    nock.cleanAll();

    const config = {
      getOrThrow: (key: string) =>
        key === 'N8N_BASE_URL' ? 'http://n8n.test' : 'test-shared-secret',
    };

    const moduleRef = await Test.createTestingModule({
      providers: [N8nOrchestratorService, { provide: ConfigService, useValue: config }],
    }).compile();

    service = moduleRef.get(N8nOrchestratorService);
  });

  afterAll(() => nock.restore());

  it('POSTs the run payload to the order-received webhook with the shared secret', async () => {
    const scope = nock('http://n8n.test')
      .post('/webhook/order-received', {
        tenantId: 't_1',
        orderId: 'o_1',
        correlationId: 'c_1',
      })
      .matchHeader('authorization', 'Bearer test-shared-secret')
      .reply(200);

    await service.startOrderValidationRun({ tenantId: 't_1', orderId: 'o_1', correlationId: 'c_1' });

    expect(scope.isDone()).toBe(true);
  });

  it('throws when n8n responds with a non-2xx status', async () => {
    nock('http://n8n.test').post('/webhook/order-received').reply(500);

    await expect(
      service.startOrderValidationRun({ tenantId: 't_1', orderId: 'o_1', correlationId: 'c_1' }),
    ).rejects.toThrow('n8n order-received webhook responded with 500');
  });
});
