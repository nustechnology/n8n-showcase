import { Controller, Get, HttpCode, Param, Post, Sse } from '@nestjs/common';

import { RequirePermission } from '../auth/decorators/require-permission.decorator';

import { CurrentTenant } from '../common/decorators/current-tenant.decorator';

import { WorkflowRunsService } from './workflow-runs.service';

@Controller('workflow-runs')
export class WorkflowRunsController {
  constructor(private readonly workflowRuns: WorkflowRunsService) {}

  @Get()
  @RequirePermission('orders:read')
  findAll(@CurrentTenant() tenantId: string) {
    return this.workflowRuns.findAll(tenantId);
  }

  @Get(':id')
  @RequirePermission('orders:read')
  findOne(@CurrentTenant() tenantId: string, @Param('id') id: string) {
    return this.workflowRuns.findOne(tenantId, id);
  }

  @Post(':id/retry')
  @HttpCode(202)
  @RequirePermission('orders:write')
  retry(@CurrentTenant() tenantId: string, @Param('id') id: string) {
    return this.workflowRuns.retry(tenantId, id);
  }

  @Sse(':id/stream')
  @RequirePermission('orders:read')
  stream(@CurrentTenant() tenantId: string, @Param('id') id: string) {
    return this.workflowRuns.stream(tenantId, id);
  }
}
