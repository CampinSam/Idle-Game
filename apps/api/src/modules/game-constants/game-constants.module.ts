import { Module } from '@nestjs/common';
import { GameConstantsService } from './game-constants.service';
import { PrismaModule } from '../../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  providers: [GameConstantsService],
  exports: [GameConstantsService],
})
export class GameConstantsModule {}
