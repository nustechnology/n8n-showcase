import { Controller, Get, Query } from '@nestjs/common';

import { RequirePermission } from '../auth/decorators/require-permission.decorator';

import { CurrentTenant } from '../common/decorators/current-tenant.decorator';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';

import { AuditLogService } from './audit-log.service';

import { ListAuditLogInput, ListAuditLogSchema } from './dto/list-audit-log.schema';

@Controller('audit-logs')
export class AuditLogController {
  constructor(private readonly auditLog: AuditLogService) {}

  @Get()
  @RequirePermission('audit:read')
  findAll(
    @CurrentTenant() tenantId: string,
    @Query(new ZodValidationPipe(ListAuditLogSchema)) query: ListAuditLogInput,
  ) {
    return this.auditLog.list(tenantId, query.take, query.skip);
  }
}
