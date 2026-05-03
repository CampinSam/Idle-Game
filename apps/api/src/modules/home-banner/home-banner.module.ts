import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { HomeBannerService } from './home-banner.service';

@Module({
  imports: [PrismaModule],
  providers: [HomeBannerService],
  exports: [HomeBannerService],
})
export class HomeBannerModule {}
