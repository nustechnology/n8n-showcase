import { Module } from '@nestjs/common';
import { getStorageToken, ThrottlerStorageService } from '@nestjs/throttler';

import { InternalThrottlerGuard } from '../common/rate-limit/internal-throttler.guard';

import { IntegrationsModule } from '../integrations/integrations.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { RealtimeModule } from '../realtime/realtime.module';

import { AiValidationService } from './ai-validation.service';
import { InternalController } from './internal.controller';
import { InternalService } from './internal.service';
import { IntegrationActionsController } from './integration-actions.controller';
import { IntegrationActionsService } from './integration-actions.service';
import { InternalAuthGuard } from './guards/internal-auth.guard';
import { N8nOrchestratorService } from './n8n-orchestrator.service';

@Module({
  // IntegrationsModule for IntegrationsService (adapter lookup + credential
  // fetch/update) — no circular risk: IntegrationsModule only imports
  // CredentialsModule/NotificationsModule, neither imports InternalModule.
  imports: [NotificationsModule, RealtimeModule, IntegrationsModule],
  controllers: [InternalController, IntegrationActionsController],
  providers: [
    InternalService,
    AiValidationService,
    IntegrationActionsService,
    InternalAuthGuard,
    // Bound to @nestjs/throttler's own DI token — see AuthModule's
    // identical comment on TenantThrottlerGuard's storage provider.
    { provide: getStorageToken(), useClass: ThrottlerStorageService },
    InternalThrottlerGuard,
    N8nOrchestratorService,
  ],
  // N8nOrchestratorService is this module's outbound counterpart to
  // InternalAuthGuard/InternalController (which only ever handle n8n
  // calling *us*) — WebhooksModule imports this module to trigger a run
  // after a Shopify order comes in. Same shape as AuthModule exporting
  // ClerkBackendService for TenantsModule to consume.
  exports: [N8nOrchestratorService],
})
export class InternalModule {}
