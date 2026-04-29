import { Module } from '@nestjs/common';
import { PlayerService } from './player.service';
import { PlayerController } from './player.controller';
import { WalletService } from './wallet.service';
import { WalletController } from './wallet.controller';
import { NftModule } from '../nft/nft.module';

@Module({
  imports: [NftModule],
  providers: [PlayerService, WalletService],
  controllers: [PlayerController, WalletController],
  exports: [PlayerService, WalletService],
})
export class PlayerModule {}
