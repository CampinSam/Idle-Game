import { Module } from '@nestjs/common';
import { StreamController } from './stream.controller';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuthModule],
  controllers: [StreamController],
})
export class StreamModule {}
