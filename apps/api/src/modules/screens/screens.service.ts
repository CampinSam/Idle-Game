import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

export interface ResolvedScreenDefinition {
  id: string;
  type: string;
  key: string;
  version: number;
  isActive: boolean;
  data: Record<string, any>;
  startsAt: string | null;
  endsAt: string | null;
  createdAt: string;
  updatedAt: string;
}

@Injectable()
export class ScreensService {
  private readonly logger = new Logger(ScreensService.name);

  constructor(private readonly prisma: PrismaService) {}

  async resolveActive(screenKey: string): Promise<ResolvedScreenDefinition> {
    const row = await (this.prisma as any).gameDefinition.findFirst({
      where: {
        type: 'screen_composition',
        key: screenKey,
        isActive: true,
      },
      orderBy: { version: 'desc' },
    });

    if (!row) {
      throw new NotFoundException(
        `No active screen composition found for key "${screenKey}"`,
      );
    }

    return this.serialize(row);
  }

  async resolvePreview(
    screenKey: string,
    version: number,
  ): Promise<ResolvedScreenDefinition> {
    const row = await (this.prisma as any).gameDefinition.findFirst({
      where: {
        type: 'screen_composition',
        key: screenKey,
        version,
      },
    });

    if (!row) {
      throw new NotFoundException(
        `No screen composition found for key "${screenKey}" version ${version}`,
      );
    }

    return this.serialize(row);
  }

  async publish(
    screenKey: string,
    version: number,
  ): Promise<ResolvedScreenDefinition> {
    const target = await (this.prisma as any).gameDefinition.findFirst({
      where: { type: 'screen_composition', key: screenKey, version },
    });

    if (!target) {
      throw new NotFoundException(
        `No screen composition found for key "${screenKey}" version ${version}`,
      );
    }

    await (this.prisma as any).gameDefinition.updateMany({
      where: { type: 'screen_composition', key: screenKey, isActive: true },
      data: { isActive: false },
    });

    const updated = await (this.prisma as any).gameDefinition.update({
      where: { id: target.id },
      data: { isActive: true },
    });

    this.logger.log(
      `Published screen composition key="${screenKey}" version=${version}`,
    );

    return this.serialize(updated);
  }

  async rollback(
    screenKey: string,
    version: number,
  ): Promise<ResolvedScreenDefinition> {
    return this.publish(screenKey, version);
  }

  async listByKey(
    screenKey?: string,
  ): Promise<ResolvedScreenDefinition[]> {
    const rows = await (this.prisma as any).gameDefinition.findMany({
      where: {
        type: 'screen_composition',
        ...(screenKey ? { key: screenKey } : {}),
      },
      orderBy: [{ key: 'asc' }, { version: 'desc' }],
    });

    return rows.map((r: any) => this.serialize(r));
  }

  private serialize(row: any): ResolvedScreenDefinition {
    return {
      id: row.id,
      type: row.type,
      key: row.key,
      version: row.version,
      isActive: row.isActive,
      data: row.data ?? {},
      startsAt: row.startsAt ? row.startsAt.toISOString() : null,
      endsAt: row.endsAt ? row.endsAt.toISOString() : null,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}
