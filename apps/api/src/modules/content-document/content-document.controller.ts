import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { ContentDocumentService } from './content-document.service';

@Controller('content-documents')
@UseGuards(JwtAuthGuard)
export class ContentDocumentController {
  constructor(private readonly contentDocumentService: ContentDocumentService) {}

  @Get(':id')
  findById(@Param('id') id: string) {
    return this.contentDocumentService.findById(id);
  }
}
