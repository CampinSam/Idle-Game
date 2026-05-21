import { Module } from '@nestjs/common';
import { PaymentController } from './payment.controller';
import { PaymentService } from './payment.service';
import { PurchaseEventBus } from './purchase-event.bus';
import { CryptoPollerService } from './crypto-poller.service';
import { PrismaModule } from '../../prisma/prisma.module';
import { CurrencyModule } from '../currency/currency.module';

@Module({
  imports: [PrismaModule, CurrencyModule],
  controllers: [PaymentController],
  providers: [PaymentService, PurchaseEventBus, CryptoPollerService],
  exports: [PaymentService, PurchaseEventBus],
})
export class PaymentModule {}
