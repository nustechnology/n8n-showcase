import { Body, Controller, Get, Param, Patch, Query } from '@nestjs/common';

import { RequirePermission } from '../auth/decorators/require-permission.decorator';

import { CurrentTenant } from '../common/decorators/current-tenant.decorator';
import { CurrentUserId } from '../common/decorators/current-user-id.decorator';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';

import { OrdersService } from './orders.service';

import { ListOrdersInput, ListOrdersSchema } from './dto/list-orders.schema';
import { UpdateOrderStatusInput, UpdateOrderStatusSchema } from './dto/update-order-status.schema';

@Controller('orders')
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  @Get()
  @RequirePermission('orders:read')
  findAll(
    @CurrentTenant() tenantId: string,
    @Query(new ZodValidationPipe(ListOrdersSchema)) query: ListOrdersInput,
  ) {
    return this.orders.findAll(tenantId, query);
  }

  @Get(':id')
  @RequirePermission('orders:read')
  findOne(@CurrentTenant() tenantId: string, @Param('id') id: string) {
    return this.orders.findOne(tenantId, id);
  }

  @Get(':id/timeline')
  @RequirePermission('orders:read')
  timeline(@CurrentTenant() tenantId: string, @Param('id') id: string) {
    return this.orders.timeline(tenantId, id);
  }

  @Patch(':id/status')
  @RequirePermission('orders:write')
  overrideStatus(
    @CurrentTenant() tenantId: string,
    @CurrentUserId() userId: string,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpdateOrderStatusSchema)) body: UpdateOrderStatusInput,
  ) {
    return this.orders.overrideStatus(tenantId, id, userId, body);
  }
}
