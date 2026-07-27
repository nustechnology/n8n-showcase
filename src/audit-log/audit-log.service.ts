import { Injectable } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';

const DEFAULT_TAKE = 20;

@Injectable()
export class AuditLogService {
  constructor(private readonly prisma: PrismaService) {}

  // take/skip are already bounds-checked by ListAuditLogSchema
  // (src/audit-log/dto/) before reaching here — only defaults live here.
  async list(tenantId: string, take = DEFAULT_TAKE, skip = 0) {
    const [items, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where: { tenantId },
        include: { user: { select: { id: true, email: true, name: true } } },
        orderBy: { createdAt: 'desc' },
        take,
        skip,
      }),
      this.prisma.auditLog.count({ where: { tenantId } }),
    ]);

    return { items, total };
  }
}
