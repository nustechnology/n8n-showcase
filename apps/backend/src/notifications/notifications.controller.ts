import { Controller, Get, Param, Patch, Query } from '@nestjs/common';

import { CurrentTenant } from '../common/decorators/current-tenant.decorator';
import { CurrentUserId } from '../common/decorators/current-user-id.decorator';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';

import { NotificationsService } from './notifications.service';

import { ListNotificationsInput, ListNotificationsSchema } from './dto/list-notifications.schema';

// No @RequirePermission on either route — open to any active tenant member,
// same as any route in this app with no permission decorator attached.
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  findAll(
    @CurrentTenant() tenantId: string,
    @CurrentUserId() userId: string,
    @Query(new ZodValidationPipe(ListNotificationsSchema)) query: ListNotificationsInput,
  ) {
    return this.notifications.list(tenantId, userId, query.take, query.skip);
  }

  @Patch(':id/read')
  markRead(
    @CurrentTenant() tenantId: string,
    @CurrentUserId() userId: string,
    @Param('id') id: string,
  ) {
    return this.notifications.markRead(tenantId, userId, id);
  }
}
