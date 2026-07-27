import { Module } from '@nestjs/common';

import { AuditLogController } from './audit-log.controller';
import { AuditLogService } from './audit-log.service';

// Read-only module — writes stay local to whichever service triggers them
// (each writer implements its own small private writeAudit() straight
// against PrismaService, same precedent as MembersService/OrdersService),
// so nothing needs to import AuditLogService itself.
@Module({
  controllers: [AuditLogController],
  providers: [AuditLogService],
})
export class AuditLogModule {}
