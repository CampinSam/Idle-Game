import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { ContentDocumentService } from './content-document.service';
import { ContentDocumentController } from './content-document.controller';

@Module({
  imports: [PrismaModule, AuthModule],
  providers: [ContentDocumentService],
  controllers: [ContentDocumentController],
  exports: [ContentDocumentService],
})
export class ContentDocumentModule {}
