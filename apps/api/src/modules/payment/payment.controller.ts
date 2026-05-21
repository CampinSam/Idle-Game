import {
  Controller,
  Post,
  Get,
  Param,
  Body,
  UseGuards,
  Request,
  Headers,
  BadRequestException,
  RawBodyRequest,
  Req,
} from '@nestjs/common';
import { PaymentService } from './payment.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CreatePurchaseDto } from './create-purchase.dto';

@Controller('v1')
export class PaymentController {
  constructor(private paymentService: PaymentService) {}

  @Get('payments/packs')
  async listPacks() {
    return this.paymentService.listGemPacks();
  }

  @UseGuards(JwtAuthGuard)
  @Post('purchases')
  async createPurchase(@Body() dto: CreatePurchaseDto, @Request() req: any) {
    const userId: string = req.user.id;
    const origin = req.headers.origin || req.headers.referer || '';
    const baseUrl = origin
      ? origin.replace(/\/$/, '')
      : `${req.protocol}://${req.get('host')}`;

    return this.paymentService.createPurchase(
      userId,
      dto.packId,
      dto.paymentMethod,
      `${baseUrl}/store?tab=gems&success=1`,
      `${baseUrl}/store?tab=gems&cancelled=1`,
    );
  }

  @UseGuards(JwtAuthGuard)
  @Get('purchases/:id')
  async getPurchaseStatus(@Param('id') id: string, @Request() req: any) {
    return this.paymentService.getPurchaseStatus(id, req.user.id);
  }

  @UseGuards(JwtAuthGuard)
  @Post('subscriptions/derp-pass')
  async createDerpPassSubscription(@Request() req: any) {
    const userId: string = req.user.id;
    const origin = req.headers.origin || req.headers.referer || '';
    const baseUrl = origin
      ? origin.replace(/\/$/, '')
      : `${req.protocol}://${req.get('host')}`;

    return this.paymentService.createDerpPassSubscription(
      userId,
      `${baseUrl}/store?tab=gems&pass=success`,
      `${baseUrl}/store?tab=gems`,
    );
  }

  @Post('purchases/stripe/webhook')
  async stripeWebhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers('stripe-signature') sig: string,
  ) {
    if (!sig) throw new BadRequestException('Missing stripe-signature header');
    const rawBody = (req as any).rawBody as Buffer | undefined;
    if (!rawBody || !Buffer.isBuffer(rawBody)) {
      throw new BadRequestException('Raw body not available — check middleware configuration');
    }
    await this.paymentService.handleStripeWebhook(rawBody, sig);
    return { received: true };
  }
}
