import { Module } from '@nestjs/common';
import { PlayerService } from './player.service';
import { PlayerController } from './player.controller';
import { WalletService } from './wallet.service';
import { WalletController } from './wallet.controller';

@Module({
  providers: [PlayerService, WalletService],
  controllers: [PlayerController, WalletController],
  exports: [PlayerService, WalletService],
})
export class PlayerModule {}
