import { Module } from '@nestjs/common';

import { InternalModule } from '../internal/internal.module';
import { RealtimeModule } from '../realtime/realtime.module';

import { WorkflowRunsController } from './workflow-runs.controller';
import { WorkflowRunsService } from './workflow-runs.service';

@Module({
  // InternalModule for N8nOrchestratorService (retry re-invokes the same
  // n8n webhook the Shopify order webhook handler already triggers).
  imports: [InternalModule, RealtimeModule],
  controllers: [WorkflowRunsController],
  providers: [WorkflowRunsService],
})
export class WorkflowRunsModule {}
