import { Module } from '@nestjs/common';
import { PaymentController } from './payment.controller';
import { PaymentService } from './payment.service';
import { PurchaseEventBus } from './purchase-event.bus';
import { CryptoPollerService } from './crypto-poller.service';
import { AdaRateService } from './ada-rate.service';
import { AdaOraclePoller } from './ada-oracle-poller.service';
import { CryptoWalletService } from './crypto-wallet.service';
import { CryptoWalletController } from './crypto-wallet.controller';
import { CryptoRatesAdminController } from './crypto-rates-admin.controller';
import { PrismaModule } from '../../prisma/prisma.module';
import { CurrencyModule } from '../currency/currency.module';
import { NotificationModule } from '../notification/notification.module';
import { InventoryModule } from '../inventory/inventory.module';

@Module({
  imports: [PrismaModule, CurrencyModule, NotificationModule, InventoryModule],
  controllers: [PaymentController, CryptoWalletController, CryptoRatesAdminController],
  providers: [PaymentService, PurchaseEventBus, CryptoPollerService, AdaRateService, AdaOraclePoller, CryptoWalletService],
  exports: [PaymentService, PurchaseEventBus, CryptoWalletService, AdaRateService],
})
export class PaymentModule {}
