import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { PrismaClient } from '@prisma/client';

// Single connection, no RLS backstop: this project made the call to keep
// tenant isolation to a single layer — every tenant-scoped query MUST
// include an explicit `where: { tenantId }` (or a join back to a row that
// has one). There is no database-level check behind it, so a query that
// forgets the filter will silently return other tenants' data instead of
// erroring.
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor(config: ConfigService) {
    super({ datasources: { db: { url: config.getOrThrow<string>('DATABASE_URL') } } });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
