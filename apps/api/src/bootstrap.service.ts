import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PrismaService } from './prisma/prisma.service';
import { EntityService } from './modules/entity/entity.service';
import { SeedSyncService } from './seeds/seed-sync.service';
import {
  OUTCOME_SPEC_FIELDS_BY_MODEL,
  normalizeOutcomeSpec,
  migrateGiftRewardSpec,
} from './modules/game-rules/outcome-spec.util';

@Injectable()
export class BootstrapService implements OnModuleInit {
  private readonly logger = new Logger(BootstrapService.name);

  constructor(
    private prisma: PrismaService,
    private entityService: EntityService,
    private seedSyncService: SeedSyncService,
  ) {}

  /**
   * Wrap a single boot step so any throw is attributed to a named stage
   * before being rethrown. Without this, a failure deep inside a boot step
   * surfaces as a bare Prisma error with no context about which OnModuleInit
   * phase was running. We rethrow so Nest still aborts startup; main.ts's
   * top-level catch then surfaces it.
   */
  private async runStep<T>(name: string, fn: () => Promise<T>): Promise<T> {
    const start = Date.now();
    try {
      const result = await fn();
      this.logger.log(`Boot step ${name} completed in ${Date.now() - start}ms`);
      return result;
    } catch (err: any) {
      this.logger.error(
        `Boot step ${name} failed after ${Date.now() - start}ms: ${err?.message ?? err}`,
        err?.stack,
      );
      throw err;
    }
  }

  async onModuleInit() {
    // Run unified seed from Object Storage on every startup (non-fatal).
    // Falls back to prisma/seed-data.json if Object Storage is unavailable.
    try {
      await this.seedSyncService.runSeed();
    } catch (err: any) {
      this.logger.warn(`Auto-seed on startup failed (non-fatal): ${err?.message}`);
    }
  }

  private async backfillGlobalPowers() {
    // ─── Pass 1: Migrate legacy tick_speed_boost rows ────────────────────────
    //
    // Before this task, GlobalActivePower stored powerType/value/valueMode columns.
    // The ONLY powerType that ever existed in this codebase was 'tick_speed_boost';
    // all NFT entity powers (definitions.seed.ts) and admin-created powers used it.
    //
    // This migration maps those legacy rows → effectOverrides: { value, valueMode }.
    // tick_speed_boost rows keep effectDefId=null; the BoostEvent machinery uses
    // effectOverrides.value + effectOverrides.valueMode at trigger time.
    //
    // Strategy:
    //   A) If the legacy "powerType" column still exists in the DB — read actual
    //      stored value/valueMode and write effectOverrides from them (lossless).
    //   B) If the column is already gone (--accept-data-loss was used) — all
    //      effectDefId=null + effectOverrides=null active/scheduled rows must be
    //      tick_speed_boost (the only type that ever existed) and are safely
    //      defaulted to { value: 50, valueMode: 'percent_add' }.
    //
    // This pass is idempotent: rows that already have effectOverrides are skipped.

    // Check whether the legacy "powerType" column is still present.
    const colCheck = await this.prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*)::bigint AS count
      FROM information_schema.columns
      WHERE table_name  = 'global_active_powers'
        AND column_name = 'powerType'
    `;
    const hasLegacyCols = Number(colCheck[0]?.count ?? 0) > 0;

    if (hasLegacyCols) {
      // A) Legacy columns present: migrate from actual stored values.
      //    Only rows with powerType = 'tick_speed_boost' are handled (the only
      //    type that ever existed). Any unknown powerType rows are left untouched
      //    so they can be inspected manually.
      const migrated = await this.prisma.$executeRaw`
        UPDATE global_active_powers
        SET    "effectOverrides" = jsonb_build_object(
                 'value',     COALESCE(value, 50),
                 'valueMode', COALESCE("valueMode", 'percent_add')
               )
        WHERE  "effectDefId"     IS NULL
          AND  "effectOverrides" IS NULL
          AND  "powerType"       = 'tick_speed_boost'
          AND  status IN ('active', 'scheduled')
      `;
      if (migrated > 0) {
        this.logger.log(
          `GlobalActivePower backfill (A): migrated ${migrated} tick_speed_boost row(s) ` +
          `from legacy powerType/value/valueMode → effectOverrides.`,
        );
      }

      // Log any remaining unknown powerType rows so admins can act.
      const unknown = await this.prisma.$queryRaw<Array<{ id: string; powerType: string }>>`
        SELECT id, "powerType"
        FROM   global_active_powers
        WHERE  "effectDefId"     IS NULL
          AND  "effectOverrides" IS NULL
          AND  "powerType"       IS DISTINCT FROM 'tick_speed_boost'
          AND  status IN ('active', 'scheduled')
      `;
      if (unknown.length > 0) {
        this.logger.warn(
          `GlobalActivePower backfill: ${unknown.length} row(s) have unknown powerType ` +
          `and could not be auto-migrated: ${unknown.map((r) => `${r.id}(${r.powerType})`).join(', ')}`,
        );
      }
    } else {
      // B) Legacy columns already dropped (schema was pushed with --accept-data-loss).
      //    tick_speed_boost was the only GlobalActivePower type in this codebase, so
      //    effectDefId=null + effectOverrides=null rows are safely defaulted.
      const unmigratedRows = await (this.prisma as any).globalActivePower.findMany({
        where: { effectDefId: null, status: { in: ['active', 'scheduled'] } },
        select: { id: true, effectOverrides: true },
      });
      const unmigratedTickBoosts = unmigratedRows.filter(
        (r: any) => r.effectOverrides === null || r.effectOverrides === undefined,
      );
      if (unmigratedTickBoosts.length > 0) {
        await (this.prisma as any).globalActivePower.updateMany({
          where: { id: { in: unmigratedTickBoosts.map((r: any) => r.id) } },
          data: { effectOverrides: { value: 50, valueMode: 'percent_add' } },
        });
        this.logger.warn(
          `GlobalActivePower backfill (B): defaulted ${unmigratedTickBoosts.length} tick_speed_boost row(s) ` +
          `to effectOverrides { value: 50, valueMode: 'percent_add' } (legacy columns already removed; ` +
          `tick_speed_boost was the only powerType that ever existed in this system).`,
        );
      }
    }

    // ─── Pass 2: Default selection on all active/scheduled rows ──────────────
    //
    // Powers created before the selection field was introduced have selection=null.
    // Default them to { scope: 'global', agg: 'any' } to preserve pre-migration
    // behaviour (world-wide, applies to everyone). Idempotent.
    const noSelectionCandidates = await (this.prisma as any).globalActivePower.findMany({
      where: { status: { in: ['active', 'scheduled'] } },
      select: { id: true, selection: true },
    });
    const legacyNoSelection = noSelectionCandidates.filter(
      (r: any) => r.selection === null || r.selection === undefined,
    );
    if (legacyNoSelection.length > 0) {
      await (this.prisma as any).globalActivePower.updateMany({
        where: { id: { in: legacyNoSelection.map((r: any) => r.id) } },
        data: { selection: { scope: 'global', agg: 'any' } },
      });
      this.logger.log(
        `GlobalActivePower backfill: set default selection on ${legacyNoSelection.length} row(s) that had no selection.`,
      );
    }
  }

  private async seedGemPacks() {
    // Stripe schema is created by initStripe() which runs after the Nest app starts
    // listening. On fresh environments or first boot, the schema may not exist yet.
    // We catch that specific Postgres error and skip gracefully — the seed will
    // succeed on the next restart once the schema is in place.
    try {
      await this._seedGemPacksInner();
    } catch (err: any) {
      const isRelationMissing =
        err?.code === '42P01' || /relation.*does not exist/i.test(err?.message ?? '');
      if (isRelationMissing) {
        this.logger.warn(
          'seedGemPacks skipped — Stripe schema not yet available (will seed on next startup)',
        );
        return;
      }
      throw err;
    }
  }

  private async _seedGemPacksInner() {
    const DEMO_ACCOUNT_ID = 'acct_derp_demo';
    const now = Math.floor(Date.now() / 1000);

    // Ensure a demo Stripe account exists to satisfy the FK on products/prices.
    await this.prisma.$executeRawUnsafe(`
      INSERT INTO stripe.accounts (_raw_data)
      VALUES ($1::jsonb)
      ON CONFLICT (id) DO NOTHING
    `, JSON.stringify({
      id: DEMO_ACCOUNT_ID, object: 'account', type: 'standard',
      email: 'demo@derp-universe.game', charges_enabled: false,
      payouts_enabled: false, details_submitted: false, created: now,
    }));

    // Baseline: HANDFUL (100 gems / $0.99). Used to compute honest bonus % labels.
    const baselineGemsPerDollar = 100 / (99 / 100);
    const extraLabel = (gemAmount: number, unitAmount: number): string => {
      const pct = Math.round((gemAmount / (unitAmount / 100) / baselineGemsPerDollar - 1) * 100);
      return `${pct}% EXTRA`;
    };

    const packs = [
      {
        id: 'prod_gems_100',  name: '100 Gems',   packId: 'gems_100',  gemAmount: 100,  unitAmount: 99,    priceId: 'price_gems_100',
        displayName: 'HANDFUL', accentColor: '#f59e0b', borderColor: 'rgba(245,158,11,0.35)', glowColor: 'transparent', badgeType: null, badgeLabel: null, iconSize: 32,
      },
      {
        id: 'prod_gems_500',  name: '500 Gems',   packId: 'gems_500',  gemAmount: 500,  unitAmount: 499,   priceId: 'price_gems_500',
        displayName: 'SATCHEL', accentColor: '#fb923c', borderColor: 'rgba(251,146,60,0.35)', glowColor: 'transparent', badgeType: null, badgeLabel: null, iconSize: 36,
      },
      {
        id: 'prod_gems_1200', name: '1,200 Gems', packId: 'gems_1200', gemAmount: 1200, unitAmount: 999,   priceId: 'price_gems_1200',
        displayName: 'CHEST', accentColor: '#c4b5fd', borderColor: 'rgba(139,92,246,0.55)', glowColor: 'rgba(139,92,246,0.18)', badgeType: 'best_value', badgeLabel: null, iconSize: 42,
      },
      {
        id: 'prod_gems_2000', name: '2,000 Gems', packId: 'gems_2000', gemAmount: 2000, unitAmount: 1499,  priceId: 'price_gems_2000',
        displayName: 'MOUNTAIN', accentColor: '#60a5fa', borderColor: 'rgba(96,165,250,0.35)', glowColor: 'transparent', badgeType: 'extra', badgeLabel: extraLabel(2000, 1499), iconSize: 44,
      },
      {
        id: 'prod_gems_2500', name: '2,500 Gems', packId: 'gems_2500', gemAmount: 2500, unitAmount: 1999,  priceId: 'price_gems_2500',
        displayName: 'VAULT', accentColor: '#34d399', borderColor: 'rgba(52,211,153,0.35)', glowColor: 'transparent', badgeType: 'extra', badgeLabel: extraLabel(2500, 1999), iconSize: 44,
      },
      {
        id: 'prod_gems_5000', name: '5,000 Gems', packId: 'gems_5000', gemAmount: 5000, unitAmount: 2999,  priceId: 'price_gems_5000',
        displayName: 'TROVE', accentColor: '#fbbf24', borderColor: 'rgba(251,191,36,0.5)', glowColor: 'rgba(251,191,36,0.12)', badgeType: 'extra', badgeLabel: extraLabel(5000, 2999), iconSize: 50,
      },
    ];

    let seeded = 0;
    for (const p of packs) {
      const productRaw = JSON.stringify({
        id: p.id, object: 'product', active: true, name: p.name,
        description: `${p.name.replace(',', '')} of premium in-game currency.`,
        metadata: {
          game: 'derp-universe', packId: p.packId, gemAmount: String(p.gemAmount),
          displayName: p.displayName, accentColor: p.accentColor,
          borderColor: p.borderColor, glowColor: p.glowColor,
          badgeType: p.badgeType ?? '', badgeLabel: p.badgeLabel ?? '',
          iconSize: String(p.iconSize),
        },
        images: [], marketing_features: [], created: now, updated: now, livemode: false,
      });
      const priceRaw = JSON.stringify({
        id: p.priceId, object: 'price', active: true, currency: 'usd',
        unit_amount: p.unitAmount, unit_amount_decimal: String(p.unitAmount),
        type: 'one_time', billing_scheme: 'per_unit', product: p.id,
        metadata: {}, created: now, livemode: false,
      });

      const productRes = await this.prisma.$executeRawUnsafe(`
        INSERT INTO stripe.products (_account_id, _raw_data)
        VALUES ($1, $2::jsonb)
        ON CONFLICT (id) DO UPDATE SET _raw_data = EXCLUDED._raw_data
        WHERE stripe.products._account_id = $1
      `, DEMO_ACCOUNT_ID, productRaw);

      await this.prisma.$executeRawUnsafe(`
        INSERT INTO stripe.prices (_account_id, _raw_data)
        VALUES ($1, $2::jsonb)
        ON CONFLICT (id) DO NOTHING
      `, DEMO_ACCOUNT_ID, priceRaw);

      if (productRes > 0) seeded++;
    }

    if (seeded > 0) {
      this.logger.log(`Seeded ${seeded} demo gem pack(s) into stripe.products/prices`);
    }
  }

  private async seedDevAdmin() {
    const DEV_USERNAME = 'superadmin';
    const DEV_PASSWORD = 'admin';
    const SUPER_ADMIN_ROLE_ID = 'role_super_admin';

    await this.prisma.adminRole.upsert({
      where: { id: SUPER_ADMIN_ROLE_ID },
      update: {},
      create: {
        id: SUPER_ADMIN_ROLE_ID,
        name: 'Super Admin',
        slug: 'super_admin',
        permissionFlags: { read: true, write: true, approve: true, player_read: true, player_write: true, system_tools: true, metrics_read: true },
        isBuiltIn: true,
      },
    });

    const existing = await this.prisma.adminAccount.findUnique({ where: { username: DEV_USERNAME } });
    if (existing) return;

    const passwordHash = await bcrypt.hash(DEV_PASSWORD, 10);
    await this.prisma.adminAccount.create({
      data: {
        username: DEV_USERNAME,
        passwordHash,
        roleId: SUPER_ADMIN_ROLE_ID,
        contentScopes: [],
      },
    });
    this.logger.log(`Dev admin account created: ${DEV_USERNAME}`);
  }

  private async seedDevTestPlayer() {
    const DEV_EMAIL = 'test@derp.dev';
    const DEV_PASSWORD = 'Derp1234!';
    const DEV_USERNAME = 'testplayer';

    const existing = await this.prisma.user.findUnique({ where: { email: DEV_EMAIL } });
    if (existing) return;

    const passwordHash = await bcrypt.hash(DEV_PASSWORD, 10);
    await this.prisma.user.create({
      data: {
        email: DEV_EMAIL,
        username: DEV_USERNAME,
        passwordHash,
      },
    });
    this.logger.log(`Dev test player account created: ${DEV_EMAIL}`);
  }

  private async seedTickRateIntervals() {
    const count = await (this.prisma as any).tickRateInterval.count();
    if (count > 0) return;

    this.logger.warn('No tick rate intervals found — seeding initial interval (1 tick/sec from 2025-01-01)');
    await (this.prisma as any).tickRateInterval.create({
      data: {
        ticksPerSecond: 1,
        effectiveFromTime: new Date('2025-01-01T00:00:00Z'),
        effectiveFromTick: 0,
      },
    });
    this.logger.log('Seeded initial tick rate interval');
  }

  private async seedConsumableItems() {
    const items = [
      {
        id: 'item_xp_potion_small',
        type: 'CONSUMABLE',
        rarity: 'COMMON',
        name: 'Minor XP Potion',
        description: 'Grants 50 XP to a target entity.',
        iconKey: 'potion_xp',
        category: 'ENHANCEMENT',
        stackable: true,
        maxStack: 99,
        consumableData: {
          effects: [{ effectDefId: 'eff_xp_potion_small', targetType: 'entity' }],
        },
      },
      {
        id: 'item_xp_boost_elixir',
        type: 'CONSUMABLE',
        rarity: 'UNCOMMON',
        name: 'XP Boost Elixir',
        description: 'Increases all XP gains by 25% for 30 minutes.',
        iconKey: 'potion_xp_timed',
        category: 'ENHANCEMENT',
        stackable: true,
        maxStack: 10,
        consumableData: {
          effects: [{ effectDefId: 'eff_xp_boost_timed', targetType: 'player' }],
        },
      },
      {
        id: 'item_attack_tonic',
        type: 'CONSUMABLE',
        rarity: 'UNCOMMON',
        name: 'Attack Tonic',
        description: 'Boosts ATK by 10 for 15 minutes. Stacks up to 3 times.',
        iconKey: 'potion_atk',
        category: 'ENHANCEMENT',
        stackable: true,
        maxStack: 10,
        consumableData: {
          effects: [{ effectDefId: 'eff_stat_boost_atk', targetType: 'player' }],
        },
      },
      {
        id: 'item_production_surge',
        type: 'CONSUMABLE',
        rarity: 'RARE',
        name: 'Production Surge Potion',
        description: 'Increases production rates by 50% for 1 hour at a target location.',
        iconKey: 'potion_production',
        category: 'ENHANCEMENT',
        stackable: true,
        maxStack: 5,
        consumableData: {
          effects: [{ effectDefId: 'eff_production_boost', targetType: 'location' }],
        },
      },
      {
        id: 'item_gold_rush_potion',
        type: 'CONSUMABLE',
        rarity: 'UNCOMMON',
        name: 'Gold Rush Potion',
        description: 'Increases currency rewards by 20% for 30 minutes.',
        iconKey: 'potion_gold',
        category: 'ENHANCEMENT',
        stackable: true,
        maxStack: 10,
        consumableData: {
          effects: [{ effectDefId: 'eff_currency_boost', targetType: 'player' }],
        },
      },
      {
        id: 'item_luck_charm',
        type: 'CONSUMABLE',
        rarity: 'RARE',
        name: 'Luck Charm',
        description: 'Increases item rewards by 10% for 1 hour.',
        iconKey: 'charm_luck',
        category: 'ENHANCEMENT',
        stackable: true,
        maxStack: 5,
        consumableData: {
          effects: [{ effectDefId: 'eff_reward_boost', targetType: 'player' }],
        },
      },
    ];

    let seeded = 0;
    for (const item of items) {
      const result = await (this.prisma as any).itemDefinition.upsert({
        where: { id: item.id },
        update: {},
        create: item,
      });
      if (result.createdAt.getTime() === result.updatedAt.getTime()) {
        seeded++;
      }
    }
    if (seeded > 0) {
      this.logger.log(`Seeded ${seeded} consumable item definitions`);
    }
  }

  private async backfillOutcomeSpecAmounts() {
    let totalRows = 0;
    let totalRewrites = 0;
    for (const [modelName, fields] of Object.entries(OUTCOME_SPEC_FIELDS_BY_MODEL)) {
      const model = (this.prisma as any)[modelName];
      if (!model) continue;
      const rows: any[] = await model.findMany();
      for (const row of rows) {
        const updates: Record<string, any> = {};
        let rowChanged = 0;
        for (const f of fields) {
          if (row[f] === undefined || row[f] === null) continue;
          const { value, changed } = normalizeOutcomeSpec(row[f]);
          if (changed > 0) {
            updates[f] = value;
            rowChanged += changed;
          }
        }
        if (rowChanged > 0) {
          await model.update({ where: { id: row.id }, data: updates });
          totalRows += 1;
          totalRewrites += rowChanged;
        }
      }
    }
    if (totalRewrites > 0) {
      this.logger.log(
        `OutcomeSpec backfill: rewrote ${totalRewrites} legacy amount→min/max entries across ${totalRows} rows`,
      );
    }
  }

  private async backfillLegacyGiftSpecs() {
    const model = (this.prisma as any).giftDef;
    if (!model) return;
    const rows: any[] = await model.findMany();
    let totalRows = 0;
    let totalChanges = 0;
    for (const row of rows) {
      if (row.rewardSpec === undefined || row.rewardSpec === null) continue;
      const { value, changed } = migrateGiftRewardSpec(row.rewardSpec);
      if (changed > 0) {
        await model.update({ where: { id: row.id }, data: { rewardSpec: value } });
        totalRows += 1;
        totalChanges += changed;
      }
    }
    if (totalChanges > 0) {
      this.logger.log(
        `GiftDef rewardSpec backfill: migrated ${totalChanges} legacy entries across ${totalRows} rows`,
      );
    }
  }

}
