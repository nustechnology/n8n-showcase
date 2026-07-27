import { Body, Controller, HttpCode, Param, Patch, Post, UseGuards } from '@nestjs/common';

import { Public } from '../common/decorators/public.decorator';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { InternalThrottlerGuard } from '../common/rate-limit/internal-throttler.guard';

import { AiValidationService } from './ai-validation.service';
import { InternalService } from './internal.service';

import { CreateOrderEventInput, CreateOrderEventSchema } from './dto/create-order-event.schema';
import { CreateWorkflowRunInput, CreateWorkflowRunSchema } from './dto/create-workflow-run.schema';
import {
  CreateWorkflowRunStepInput,
  CreateWorkflowRunStepSchema,
} from './dto/create-workflow-run-step.schema';
import { UpdateOrderStatusInput, UpdateOrderStatusSchema } from './dto/update-order-status.schema';
import { UpdateWorkflowRunInput, UpdateWorkflowRunSchema } from './dto/update-workflow-run.schema';
import { ValidateOrderInput, ValidateOrderSchema } from './dto/validate-order.schema';
import { InternalAuthGuard } from './guards/internal-auth.guard';

// Called by n8n's HTTP Request nodes, not a browser/Clerk session — @Public()
// opts every route here out of ClerkTenantGuard/PermissionsGuard, and
// InternalAuthGuard is what actually guards them (shared-secret bearer
// token). See apps/n8n/workflows/order-validation.json for the
// full contract this controller implements. InternalThrottlerGuard runs
// after auth — one shared per-deployment budget, not per-tenant (n8n's
// calls carry no per-tenant auth context beyond a body field).
@Public()
@UseGuards(InternalAuthGuard, InternalThrottlerGuard)
@Controller('internal')
export class InternalController {
  constructor(
    private readonly internal: InternalService,
    private readonly aiValidation: AiValidationService,
  ) {}

  @Post('workflow-runs')
  @HttpCode(201)
  createWorkflowRun(@Body(new ZodValidationPipe(CreateWorkflowRunSchema)) body: CreateWorkflowRunInput) {
    return this.internal.createWorkflowRun(body);
  }

  @Post('ai/validate-order')
  @HttpCode(200)
  validateOrder(@Body(new ZodValidationPipe(ValidateOrderSchema)) body: ValidateOrderInput) {
    return this.aiValidation.validateOrder(body.tenantId, body.orderId);
  }

  @Patch('orders/:id/status')
  updateOrderStatus(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpdateOrderStatusSchema)) body: UpdateOrderStatusInput,
  ) {
    return this.internal.updateOrderStatus(id, body.status, body.reason);
  }

  @Patch('workflow-runs/:id')
  updateWorkflowRun(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpdateWorkflowRunSchema)) body: UpdateWorkflowRunInput,
  ) {
    return this.internal.updateWorkflowRun(id, body);
  }

  @Post('workflow-runs/:id/steps')
  @HttpCode(201)
  createWorkflowRunStep(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(CreateWorkflowRunStepSchema)) body: CreateWorkflowRunStepInput,
  ) {
    return this.internal.upsertWorkflowRunStep(id, body);
  }

  @Post('orders/:id/events')
  @HttpCode(201)
  createOrderEvent(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(CreateOrderEventSchema)) body: CreateOrderEventInput,
  ) {
    return this.internal.createOrderEvent(id, body);
  }
}
