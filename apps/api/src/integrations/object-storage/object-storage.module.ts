import { Module } from '@nestjs/common';
import { ObjectStorageController } from './object-storage.controller';

@Module({
  controllers: [ObjectStorageController],
})
export class ObjectStorageModule {}
