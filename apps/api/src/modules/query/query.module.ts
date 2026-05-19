import { Module } from '@nestjs/common';
import { QueryService } from './query.service';
import { QueryController } from './query.controller';
import { CheckInModule } from '../checkin/checkin.module';
import { TickModule } from '../tick/tick.module';
import { NftModule } from '../nft/nft.module';
import { HomeBannerModule } from '../home-banner/home-banner.module';
import { GlobalPowerModule } from '../global-power/global-power.module';
import { QuestModule } from '../quest/quest.module';

@Module({
  imports: [CheckInModule, TickModule, NftModule, HomeBannerModule, GlobalPowerModule, QuestModule],
  controllers: [QueryController],
  providers: [QueryService],
  exports: [QueryService],
})
export class QueryModule {}
