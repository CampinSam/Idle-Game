import { Module } from '@nestjs/common';
import { ObjectStorageController } from './object-storage.controller';
import { NftModule } from '../../modules/nft/nft.module';

@Module({
  imports: [NftModule],
  controllers: [ObjectStorageController],
})
export class ObjectStorageModule {}
