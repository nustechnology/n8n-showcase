import { Body, Controller, HttpCode, Post, UseGuards } from '@nestjs/common';

import { Public } from '../common/decorators/public.decorator';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { InternalThrottlerGuard } from '../common/rate-limit/internal-throttler.guard';

import { IntegrationActionsService } from './integration-actions.service';

import {
  CheckCheckoutOrderInput,
  CheckCheckoutOrderSchema,
  CheckInventoryInput,
  CheckInventorySchema,
  CreateShipmentInput,
  CreateShipmentSchema,
  SendResendEmailInput,
  SendResendEmailSchema,
  SendSlackMessageInput,
  SendSlackMessageSchema,
  UpdateShopifyOrderInput,
  UpdateShopifyOrderSchema,
} from './dto/integration-actions.schema';
import { InternalAuthGuard } from './guards/internal-auth.guard';

// Shaped around the provider, not the workflow — POST /internal/integrations/
// :provider/:action, not e.g. POST /internal/orders/:id/check-inventory —
// keeps this API reusable by any future workflow, not just order-validation.
// Same guard/auth as InternalController: n8n never holds a Zoho/EasyPost/
// Slack/Shopify credential, every third-party call happens here. Same
// shared InternalThrottlerGuard instance as InternalController — distinct
// per-route keys, one combined per-deployment budget.
@Public()
@UseGuards(InternalAuthGuard, InternalThrottlerGuard)
@Controller('internal/integrations')
export class IntegrationActionsController {
  constructor(private readonly actions: IntegrationActionsService) {}

  @Post('zoho/check-inventory')
  @HttpCode(200)
  checkInventory(@Body(new ZodValidationPipe(CheckInventorySchema)) body: CheckInventoryInput) {
    return this.actions.checkInventory(body.tenantId, body.orderId);
  }

  @Post('inventory/check-inventory')
  @HttpCode(200)
  checkInventoryGeneric(@Body(new ZodValidationPipe(CheckInventorySchema)) body: CheckInventoryInput) {
    return this.actions.checkInventory(body.tenantId, body.orderId);
  }

  @Post('easypost/create-shipment')
  @HttpCode(200)
  createShipment(@Body(new ZodValidationPipe(CreateShipmentSchema)) body: CreateShipmentInput) {
    return this.actions.createShipment(body.tenantId, body.orderId);
  }

  @Post('shipping/create-shipment')
  @HttpCode(200)
  createShipmentGeneric(@Body(new ZodValidationPipe(CreateShipmentSchema)) body: CreateShipmentInput) {
    return this.actions.createShipment(body.tenantId, body.orderId);
  }

  @Post('shopify/update-order')
  @HttpCode(200)
  async updateOrder(
    @Body(new ZodValidationPipe(UpdateShopifyOrderSchema)) body: UpdateShopifyOrderInput,
  ): Promise<{ success: true }> {
    await this.actions.updateShopifyOrder(body.tenantId, body.orderId, body.trackingNumber, body.carrier);
    return { success: true };
  }

  @Post('slack/send-message')
  @HttpCode(200)
  async sendMessage(
    @Body(new ZodValidationPipe(SendSlackMessageSchema)) body: SendSlackMessageInput,
  ): Promise<{ success: true }> {
    await this.actions.sendSlackMessage(body.tenantId, body.message);
    return { success: true };
  }

  @Post('alerts/send-message')
  @HttpCode(200)
  async sendAlertMessage(
    @Body(new ZodValidationPipe(SendSlackMessageSchema)) body: SendSlackMessageInput,
  ): Promise<{ success: true }> {
    await this.actions.sendSlackMessage(body.tenantId, body.message);
    return { success: true };
  }

  @Post('mailer/send-email')
  @HttpCode(200)
  async sendEmail(
    @Body(new ZodValidationPipe(SendResendEmailSchema)) body: SendResendEmailInput,
  ): Promise<{ success: true }> {
    await this.actions.sendResendEmail(body.tenantId, body.orderId);
    return { success: true };
  }

  @Post('shopify/check-checkout-order')
  @HttpCode(200)
  async checkCheckoutOrder(
    @Body(new ZodValidationPipe(CheckCheckoutOrderSchema)) body: CheckCheckoutOrderInput,
  ): Promise<{ orderFound: boolean; orderId?: string }> {
    return this.actions.checkCheckoutOrder(body.tenantId, body.checkoutToken);
  }
}
