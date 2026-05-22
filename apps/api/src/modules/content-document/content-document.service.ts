import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import type { ContentDocumentDefinition } from '@derp/shared';

@Injectable()
export class ContentDocumentService {
  private readonly logger = new Logger(ContentDocumentService.name);

  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string): Promise<ContentDocumentDefinition> {
    const row = await (this.prisma as any).gameDefinition.findFirst({
      where: {
        type: 'content_document',
        key: id,
        isActive: true,
      },
      orderBy: { version: 'desc' },
    });

    if (!row) {
      throw new NotFoundException(`Content document "${id}" not found`);
    }

    const data = row.data as any;

    return {
      id: row.key,
      version: row.version,
      blocks: Array.isArray(data?.blocks) ? data.blocks : [],
      defaultContext: data?.defaultContext ?? undefined,
    };
  }

  async list(): Promise<ContentDocumentDefinition[]> {
    const rows = await (this.prisma as any).gameDefinition.findMany({
      where: { type: 'content_document', isActive: true },
      orderBy: { key: 'asc' },
    });

    return rows.map((row: any) => {
      const data = row.data as any;
      return {
        id: row.key,
        version: row.version,
        blocks: Array.isArray(data?.blocks) ? data.blocks : [],
        defaultContext: data?.defaultContext ?? undefined,
      };
    });
  }

  /**
   * Upsert a content document — creates a new row or bumps version if one
   * already exists for the given key. Used by the seed step.
   */
  async upsert(doc: ContentDocumentDefinition & { isActive?: boolean }): Promise<void> {
    const existing = await (this.prisma as any).gameDefinition.findFirst({
      where: { type: 'content_document', key: doc.id },
      orderBy: { version: 'desc' },
    });

    if (existing) {
      this.logger.log(`Content document "${doc.id}" already exists — skipping seed`);
      return;
    }

    await (this.prisma as any).gameDefinition.create({
      data: {
        type: 'content_document',
        key: doc.id,
        version: doc.version ?? 1,
        isActive: doc.isActive ?? true,
        data: {
          id: doc.id,
          version: doc.version ?? 1,
          blocks: doc.blocks,
          defaultContext: doc.defaultContext ?? null,
        },
      },
    });

    this.logger.log(`Seeded content document "${doc.id}"`);
  }
}
