import { Module } from '@nestjs/common';
import { QueryService } from './query.service';
import { QueryController } from './query.controller';
import { CheckInModule } from '../checkin/checkin.module';
import { TickModule } from '../tick/tick.module';
import { NftModule } from '../nft/nft.module';

@Module({
  imports: [CheckInModule, TickModule, NftModule],
  controllers: [QueryController],
  providers: [QueryService],
  exports: [QueryService],
})
export class QueryModule {}
