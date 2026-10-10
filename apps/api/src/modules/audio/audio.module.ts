import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { AudioController } from './audio.controller';

@Module({
  imports: [PrismaModule],
  controllers: [AudioController],
})
export class AudioModule {}
