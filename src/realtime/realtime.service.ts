import { EventEmitter } from 'events';

import { Injectable } from '@nestjs/common';

import { Observable, fromEvent, merge } from 'rxjs';
import { filter, map } from 'rxjs/operators';

export interface WorkflowRunUpdateEvent {
  tenantId: string;
  runId: string;
  orderId: string | null;
  status: string;
}

export interface OrderUpdateEvent {
  tenantId: string;
  orderId: string;
  status: string;
  type: 'order_created' | 'order_status_changed';
}

const WORKFLOW_RUN_UPDATED = 'workflow-run.updated';
const ORDER_UPDATED = 'order.updated';

// Single in-process EventEmitter backing both SSE endpoints (per-run and
// tenant-wide activity). No Redis/BullMQ — single-instance backend today,
// this is the right amount of infrastructure for the current scale. Every
// open SSE connection adds a listener, so the default maxListeners of 10
// would trip under a handful of concurrent tabs/reconnects.
@Injectable()
export class RealtimeService {
  private readonly emitter = new EventEmitter();

  constructor() {
    this.emitter.setMaxListeners(0);
  }

  publishWorkflowRunUpdate(event: WorkflowRunUpdateEvent): void {
    this.emitter.emit(WORKFLOW_RUN_UPDATED, event);
  }

  publishOrderUpdate(event: OrderUpdateEvent): void {
    this.emitter.emit(ORDER_UPDATED, event);
  }

  streamWorkflowRun(tenantId: string, runId: string): Observable<MessageEvent> {
    return (fromEvent(this.emitter, WORKFLOW_RUN_UPDATED) as Observable<WorkflowRunUpdateEvent>).pipe(
      filter((event) => event.tenantId === tenantId && event.runId === runId),
      map((event) => ({ data: event }) as MessageEvent),
    );
  }

  streamTenantActivity(tenantId: string): Observable<MessageEvent> {
    return merge(
      fromEvent(this.emitter, WORKFLOW_RUN_UPDATED) as Observable<WorkflowRunUpdateEvent>,
      fromEvent(this.emitter, ORDER_UPDATED) as Observable<OrderUpdateEvent>,
    ).pipe(
      filter((event) => event.tenantId === tenantId),
      map((event) => ({ data: event }) as MessageEvent),
    );
  }
}
