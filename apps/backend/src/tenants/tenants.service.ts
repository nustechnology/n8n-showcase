import { Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';

import { UpdateTenantInput } from './dto/update-tenant.schema';

@Injectable()
export class TenantsService {
  constructor(private readonly prisma: PrismaService) {}

  async getCurrentTenant(tenantId: string) {
    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) {
      // Reaching here means ClerkTenantGuard resolved a tenant that then
      // vanished between the guard and this query — a race, not a client
      // error.
      throw new NotFoundException('Tenant not found');
    }
    return tenant;
  }

  async updateCurrentTenant(tenantId: string, data: UpdateTenantInput) {
    return this.prisma.tenant.update({ where: { id: tenantId }, data });
  }
}
