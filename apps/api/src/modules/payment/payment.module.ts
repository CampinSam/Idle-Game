import { Module } from '@nestjs/common';
import { PaymentController } from './payment.controller';
import { PaymentService } from './payment.service';
import { PurchaseEventBus } from './purchase-event.bus';
import { CryptoPollerService } from './crypto-poller.service';
import { AdaRateService } from './ada-rate.service';
import { CryptoWalletService } from './crypto-wallet.service';
import { CryptoWalletController } from './crypto-wallet.controller';
import { PrismaModule } from '../../prisma/prisma.module';
import { CurrencyModule } from '../currency/currency.module';

@Module({
  imports: [PrismaModule, CurrencyModule],
  controllers: [PaymentController, CryptoWalletController],
  providers: [PaymentService, PurchaseEventBus, CryptoPollerService, AdaRateService, CryptoWalletService],
  exports: [PaymentService, PurchaseEventBus, CryptoWalletService],
})
export class PaymentModule {}
