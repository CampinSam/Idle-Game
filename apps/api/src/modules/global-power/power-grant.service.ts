import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

export interface CreateGrantDto {
  targetType: string;
  targetId: string;
  powerKey: string;
  powerDefId?: string | null;
  overrides?: Record<string, any> | null;
  sourceType: string;
  sourceId?: string | null;
  expiresAt?: Date | null;
  remainingChargeUnits?: number | null;
}

@Injectable()
export class PowerGrantService {
  private readonly logger = new Logger(PowerGrantService.name);

  constructor(private prisma: PrismaService) {}

  /**
   * Find the first active PowerGrant for the given target + power key.
   * Active = not expired AND not exhausted (remainingChargeUnits !== 0).
   */
  async findActiveGrant(
    targetType: string,
    targetId: string,
    powerKey: string,
    tx?: any,
  ): Promise<any | null> {
    const db = tx ?? this.prisma;
    const now = new Date();
    return (db as any).powerGrant.findFirst({
      where: {
        targetType,
        targetId,
        powerKey,
        AND: [
          {
            OR: [
              { expiresAt: null },
              { expiresAt: { gt: now } },
            ],
          },
          {
            OR: [
              { remainingChargeUnits: null },
              { remainingChargeUnits: { gt: 0 } },
            ],
          },
        ],
      },
      include: { powerDef: true },
    });
  }

  async createGrant(data: CreateGrantDto, tx?: any): Promise<any> {
    const db = tx ?? this.prisma;

    if (data.powerDefId) {
      const def = await (this.prisma as any).powerDef.findFirst({
        where: { OR: [{ id: data.powerDefId }, { key: data.powerDefId }] },
        select: { id: true },
      });
      if (!def) throw new NotFoundException(`PowerDef "${data.powerDefId}" not found`);
      data = { ...data, powerDefId: def.id };
    }

    return (db as any).powerGrant.create({ data });
  }

  async revokeGrant(grantId: string, tx?: any): Promise<void> {
    const db = tx ?? this.prisma;
    const grant = await (db as any).powerGrant.findUnique({ where: { id: grantId } });
    if (!grant) throw new NotFoundException(`PowerGrant "${grantId}" not found`);
    await (db as any).powerGrant.delete({ where: { id: grantId } });
  }

  /**
   * Idempotent: reads entity definition rules.uniques and upserts a PowerGrant
   * + EntityPowerUsage charge pool for every NFT power listed. Safe to call
   * repeatedly — existing rows are left as-is (charges are not reset).
   */
  async syncNftGrants(entityId: string, tx?: any): Promise<void> {
    const db = tx ?? this.prisma;

    const entity = await (db as any).entity.findUnique({
      where: { id: entityId },
      include: { definition: true },
    });
    if (!entity || !entity.nftAssetId) return;

    const rules = (entity.definition?.rules as any) || {};
    const uniques: Record<string, any> = rules.uniques || {};
    const uniqueEntry = uniques[entity.nftAssetId];
    if (!uniqueEntry) return;

    const powers: any[] = uniqueEntry.powers || [];
    for (const powerRef of powers) {
      await this._upsertEntityGrant(db, entityId, entity.nftAssetId, powerRef);
    }
  }

  /**
   * Idempotent: same as syncNftGrants but for LocationInstance.
   */
  async syncNftGrantsForLocation(locationInstanceId: string, tx?: any): Promise<void> {
    const db = tx ?? this.prisma;

    const location = await (db as any).locationInstance.findUnique({
      where: { id: locationInstanceId },
      include: { definition: true },
    });
    if (!location || !location.nftAssetId) return;

    const rules = (location.definition?.rules as any) || {};
    const uniques: Record<string, any> = rules.uniques || {};
    const uniqueEntry = uniques[location.nftAssetId];
    if (!uniqueEntry) return;

    const powers: any[] = uniqueEntry.powers || [];
    for (const powerRef of powers) {
      await this._upsertLocationGrant(db, locationInstanceId, location.nftAssetId, powerRef);
    }
  }

  /** Re-sync all entity NFT grants for admin reconciliation after definition edits. */
  async resyncAllEntityGrants(): Promise<{ updated: number; failed: number }> {
    const entities = await (this.prisma as any).entity.findMany({
      where: { nftAssetId: { not: null } },
      select: { id: true },
    });
    let updated = 0;
    let failed = 0;
    for (const e of entities) {
      try {
        await this.syncNftGrants(e.id);
        updated++;
      } catch (err) {
        this.logger.error(`Failed to sync NFT grants for entity ${e.id}: ${err}`);
        failed++;
      }
    }
    return { updated, failed };
  }

  /** Re-sync all location NFT grants for admin reconciliation. */
  async resyncAllLocationGrants(): Promise<{ updated: number; failed: number }> {
    const locations = await (this.prisma as any).locationInstance.findMany({
      where: { nftAssetId: { not: null } },
      select: { id: true },
    });
    let updated = 0;
    let failed = 0;
    for (const loc of locations) {
      try {
        await this.syncNftGrantsForLocation(loc.id);
        updated++;
      } catch (err) {
        this.logger.error(`Failed to sync NFT grants for location ${loc.id}: ${err}`);
        failed++;
      }
    }
    return { updated, failed };
  }

  private async _resolveGrantPowerDefId(db: any, powerRef: any): Promise<string | null> {
    const rawDefId = powerRef.powerDefId ?? null;
    if (!rawDefId) return null;
    const def = await (db as any).powerDef.findFirst({
      where: { OR: [{ id: rawDefId }, { key: rawDefId }] },
      select: { id: true },
    });
    if (!def) {
      this.logger.warn(`PowerDef "${rawDefId}" referenced by powerRef not found — grant created without def link`);
      return null;
    }
    return def.id;
  }

  private async _getInitialChargeUnits(db: any, powerDefId: string | null, powerRef: any): Promise<number> {
    if (powerRef.initialChargeUnits != null) return powerRef.initialChargeUnits;
    if (!powerDefId) return 1;
    const def = await (db as any).powerDef.findUnique({
      where: { id: powerDefId },
      select: { chargeConfig: true },
    });
    const cc = def?.chargeConfig as any;
    return cc?.initialChargeUnits ?? cc?.maxChargeUnits ?? 1;
  }

  private async _upsertEntityGrant(
    db: any,
    entityId: string,
    nftAssetId: string,
    powerRef: any,
  ): Promise<void> {
    const powerKey: string = powerRef.key ?? powerRef.powerType ?? powerRef.effectDefId ?? 'unknown';
    if (!powerKey || powerKey === 'unknown') {
      this.logger.warn(`Skipping powerRef with no resolvable key for entity ${entityId}`);
      return;
    }

    const powerDefId = await this._resolveGrantPowerDefId(db, powerRef);

    const overrides: Record<string, any> | null = (() => {
      const { key, powerType, effectDefId, powerDefId: _pd, ...rest } = powerRef;
      return Object.keys(rest).length > 0 ? rest : null;
    })();

    await (db as any).powerGrant.upsert({
      where: {
        targetType_targetId_powerKey_sourceType_sourceId: {
          targetType: 'entity',
          targetId: entityId,
          powerKey,
          sourceType: 'nft_unique',
          sourceId: nftAssetId,
        },
      },
      create: {
        targetType: 'entity',
        targetId: entityId,
        powerKey,
        powerDefId,
        overrides,
        sourceType: 'nft_unique',
        sourceId: nftAssetId,
      },
      update: { powerDefId, overrides },
    });

    const grant = await (db as any).powerGrant.findFirst({
      where: {
        targetType: 'entity',
        targetId: entityId,
        powerKey,
        sourceType: 'nft_unique',
        sourceId: nftAssetId,
      },
      select: { id: true },
    });
    if (!grant) return;

    const initialChargeUnits = await this._getInitialChargeUnits(db, powerDefId, powerRef);

    await (db as any).entityPowerUsage.upsert({
      where: { powerGrantId: grant.id },
      create: { entityId, powerGrantId: grant.id, chargeUnits: initialChargeUnits },
      update: {},
    });
  }

  private async _upsertLocationGrant(
    db: any,
    locationInstanceId: string,
    nftAssetId: string,
    powerRef: any,
  ): Promise<void> {
    const powerKey: string = powerRef.key ?? powerRef.powerType ?? powerRef.effectDefId ?? 'unknown';
    if (!powerKey || powerKey === 'unknown') {
      this.logger.warn(`Skipping powerRef with no resolvable key for location ${locationInstanceId}`);
      return;
    }

    const powerDefId = await this._resolveGrantPowerDefId(db, powerRef);

    const overrides: Record<string, any> | null = (() => {
      const { key, powerType, effectDefId, powerDefId: _pd, ...rest } = powerRef;
      return Object.keys(rest).length > 0 ? rest : null;
    })();

    await (db as any).powerGrant.upsert({
      where: {
        targetType_targetId_powerKey_sourceType_sourceId: {
          targetType: 'location',
          targetId: locationInstanceId,
          powerKey,
          sourceType: 'nft_unique',
          sourceId: nftAssetId,
        },
      },
      create: {
        targetType: 'location',
        targetId: locationInstanceId,
        powerKey,
        powerDefId,
        overrides,
        sourceType: 'nft_unique',
        sourceId: nftAssetId,
      },
      update: { powerDefId, overrides },
    });

    const grant = await (db as any).powerGrant.findFirst({
      where: {
        targetType: 'location',
        targetId: locationInstanceId,
        powerKey,
        sourceType: 'nft_unique',
        sourceId: nftAssetId,
      },
      select: { id: true },
    });
    if (!grant) return;

    const initialChargeUnits = await this._getInitialChargeUnits(db, powerDefId, powerRef);

    await (db as any).locationPowerUsage.upsert({
      where: { powerGrantId: grant.id },
      create: { locationInstanceId, powerGrantId: grant.id, chargeUnits: initialChargeUnits },
      update: {},
    });
  }
}
