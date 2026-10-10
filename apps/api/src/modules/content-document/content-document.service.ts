import { Injectable, InternalServerErrorException, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CONTENT_BLOCK_TYPES, type ContentBlock, type ContentDocumentDefinition } from '@derp/shared';

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

    return this.deserialize(row);
  }

  async list(): Promise<ContentDocumentDefinition[]> {
    const rows = await (this.prisma as any).gameDefinition.findMany({
      where: { type: 'content_document', isActive: true },
      orderBy: { key: 'asc' },
    });

    return rows.map((row: any) => this.deserialize(row));
  }

  /**
   * Upsert a content document — creates a new row or skips if one already
   * exists for the given key + version. Used by the seed step.
   */
  async upsert(doc: ContentDocumentDefinition & { isActive?: boolean }): Promise<void> {
    await (this.prisma as any).gameDefinition.upsert({
      where: { type_key_version: { type: 'content_document', key: doc.id, version: doc.version ?? 1 } },
      create: {
        type: 'content_document',
        key: doc.id,
        version: doc.version ?? 1,
        isActive: doc.isActive ?? true,
        data: {
          id: doc.id,
          version: doc.version ?? 1,
          blocks: doc.blocks,
          context: doc.context ?? null,
        },
      },
      update: {},
    });
    this.logger.log(`Content document "${doc.id}" ensured`);
  }

  // ─── Private helpers ────────────────────────────────────────────────────────

  private deserialize(row: any): ContentDocumentDefinition {
    const data = row.data as any;

    if (!data || typeof data !== 'object') {
      throw new InternalServerErrorException(
        `Content document "${row.key}" has invalid data payload (not an object)`,
      );
    }

    if (!Array.isArray(data.blocks)) {
      throw new InternalServerErrorException(
        `Content document "${row.key}" has invalid data payload: "blocks" must be an array`,
      );
    }

    const invalidBlocks: string[] = [];
    const blocks: ContentBlock[] = data.blocks.map((b: any, i: number) => {
      if (!b || typeof b !== 'object') {
        invalidBlocks.push(`blocks[${i}]: not an object`);
        return b;
      }
      if (!b.type || typeof b.type !== 'string') {
        invalidBlocks.push(`blocks[${i}]: missing "type" field`);
        return b;
      }
      if (!(CONTENT_BLOCK_TYPES as string[]).includes(b.type)) {
        invalidBlocks.push(`blocks[${i}]: unknown block type "${b.type}"`);
        return b;
      }
      return b as ContentBlock;
    });

    if (invalidBlocks.length > 0) {
      throw new InternalServerErrorException(
        `Content document "${row.key}" has malformed blocks: ${invalidBlocks.join(', ')}`,
      );
    }

    return {
      id: row.key,
      version: row.version,
      blocks,
      context: data.context ?? undefined,
    };
  }
}
