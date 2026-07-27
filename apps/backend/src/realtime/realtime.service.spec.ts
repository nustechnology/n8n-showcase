import { firstValueFrom } from 'rxjs';

import { RealtimeService } from './realtime.service';

describe('RealtimeService', () => {
  let service: RealtimeService;

  beforeEach(() => {
    service = new RealtimeService();
  });

  it('streamWorkflowRun only emits events for the matching tenant and run', async () => {
    const received = firstValueFrom(service.streamWorkflowRun('t_1', 'r_1'));

    service.publishWorkflowRunUpdate({ tenantId: 't_2', runId: 'r_1', orderId: 'o_1', status: 'FAILED' });
    service.publishWorkflowRunUpdate({ tenantId: 't_1', runId: 'r_2', orderId: 'o_1', status: 'FAILED' });
    service.publishWorkflowRunUpdate({ tenantId: 't_1', runId: 'r_1', orderId: 'o_1', status: 'FAILED' });

    const event = await received;
    expect(event.data).toEqual({ tenantId: 't_1', runId: 'r_1', orderId: 'o_1', status: 'FAILED' });
  });

  it('streamTenantActivity merges workflow-run and order events for the tenant only', async () => {
    const events: unknown[] = [];
    const subscription = service.streamTenantActivity('t_1').subscribe((event) => events.push(event.data));

    service.publishOrderUpdate({ tenantId: 't_2', orderId: 'o_1', status: 'RECEIVED', type: 'order_created' });
    service.publishOrderUpdate({ tenantId: 't_1', orderId: 'o_1', status: 'RECEIVED', type: 'order_created' });
    service.publishWorkflowRunUpdate({ tenantId: 't_1', runId: 'r_1', orderId: 'o_1', status: 'SUCCEEDED' });

    subscription.unsubscribe();
    expect(events).toEqual([
      { tenantId: 't_1', orderId: 'o_1', status: 'RECEIVED', type: 'order_created' },
      { tenantId: 't_1', runId: 'r_1', orderId: 'o_1', status: 'SUCCEEDED' },
    ]);
  });
});
