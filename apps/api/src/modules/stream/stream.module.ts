import { Module } from '@nestjs/common';
import { StreamController } from './stream.controller';
import { AuthModule } from '../auth/auth.module';
import { PaymentModule } from '../payment/payment.module';

@Module({
  imports: [AuthModule, PaymentModule],
  controllers: [StreamController],
})
export class StreamModule {}
