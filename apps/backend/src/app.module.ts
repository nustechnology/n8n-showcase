import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { ClsModule } from 'nestjs-cls';

import { AuditLogModule } from './audit-log/audit-log.module';
import { AuthModule } from './auth/auth.module';
import { CircuitBreakerModule } from './common/circuit-breaker/circuit-breaker.module';
import { HealthModule } from './health/health.module';
import { InternalModule } from './internal/internal.module';
import { IntegrationsModule } from './integrations/integrations.module';
import { NotificationsModule } from './notifications/notifications.module';
import { OrdersModule } from './orders/orders.module';
import { PrismaModule } from './prisma/prisma.module';
import { TenantsModule } from './tenants/tenants.module';
import { WebhooksModule } from './webhooks/webhooks.module';
import { WorkflowRunsModule } from './workflow-runs/workflow-runs.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ClsModule.forRoot({ global: true, middleware: { mount: true } }),
    PrismaModule,
    CircuitBreakerModule,
    AuthModule,
    HealthModule,
    TenantsModule,
    AuditLogModule,
    IntegrationsModule,
    OrdersModule,
    WorkflowRunsModule,
    NotificationsModule,
    WebhooksModule,
    InternalModule,
  ],
})
export class AppModule {}
