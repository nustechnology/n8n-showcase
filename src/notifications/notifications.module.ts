import { Module } from '@nestjs/common';

import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';

@Module({
  controllers: [NotificationsController],
  providers: [NotificationsService],
  // Consumed by InternalModule (workflow run failures) and IntegrationsModule
  // (integration DEGRADED/ERROR transitions) to raise tenant-wide notifications.
  exports: [NotificationsService],
})
export class NotificationsModule {}
