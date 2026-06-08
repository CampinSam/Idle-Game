import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PrismaService } from './prisma/prisma.service';
import { EntityService } from './modules/entity/entity.service';
import {
  buildSeedConsumableMap,
  canonicalConsumableData,
  consumableDataEqual,
} from './seeds/consumable-data.util';
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
    if (process.env.NODE_ENV !== 'production') {
      await this.runStep('seedDevAdmin', () => this.seedDevAdmin());
      await this.runStep('seedDevTestPlayer', () => this.seedDevTestPlayer());
    }
    await this.runStep('seedTickRateIntervals', () => this.seedTickRateIntervals());
    await this.runStep('seedNftCollections', () => this.seedNftCollections());
    await this.runStep('seedEffectDefinitions', () => this.seedEffectDefinitions());
    await this.runStep('seedConsumableItems', () => this.seedConsumableItems());
    // Idempotent: ensures the four gem packs exist in stripe.products / stripe.prices
    // so GET /v1/payments/packs returns data even before Stripe is connected.
    // ON CONFLICT DO NOTHING means real Stripe-synced rows are never overwritten.
    await this.runStep('seedGemPacks', () => this.seedGemPacks());
    // Idempotent: rewrite any historical `consumableData` rows that still
    // carry the legacy `{ effect, duration, ... }` shape, UPPERCASE
    // targetType enum values, or a redundant top-level `targetType`. After
    // this runs every consumable on disk matches the canonical
    // `{ effects: [{ effectDefId, targetType }] }` shape and the client no
    // longer needs defensive normalization.
    await this.backfillConsumableData();
    // One-time backfill: rewrite any legacy `amount` outcome entries to
    // `min` = `max` = amount across every definition table that holds an
    // outcomeSpec. Idempotent — once a row is normalized, subsequent runs
    // are no-ops. The legacy `item.amount` branch in resolveOutcomes has
    // been removed, so any row that still carries `amount` would silently
    // grant `1` at runtime. Failures here MUST crash startup loudly so an
    // operator can intervene rather than serve broken rewards. Set
    // OUTCOME_SPEC_BACKFILL_DISABLED=1 to skip (only safe in environments
    // that have already been backfilled, e.g. CI without seed data).
    if (process.env.OUTCOME_SPEC_BACKFILL_DISABLED === '1') {
      this.logger.log('OutcomeSpec amount→min/max backfill skipped (OUTCOME_SPEC_BACKFILL_DISABLED=1)');
    } else {
      await this.backfillOutcomeSpecAmounts();
    }
    // Idempotent: convert any GiftDef records that still carry a legacy
    // single-object rewardSpec or lootTable-type entries to the canonical
    // array format. Safe to run on every boot — no-op once converged.
    await this.backfillLegacyGiftSpecs();
    // Idempotent: rebuilds missing levelHistory entries / stat gains for any
    // entity that pre-dates the canonical addEntityXp pipeline.
    // Set ENTITY_BACKFILL_DISABLED=1 to skip — useful once the dataset has
    // converged so cold starts at scale don't re-scan every entity row.
    if (process.env.ENTITY_BACKFILL_DISABLED === '1') {
      this.logger.log('Entity level-history backfill skipped (ENTITY_BACKFILL_DISABLED=1)');
    } else {
      try {
        await this.entityService.backfillLevelHistory();
      } catch (err) {
        this.logger.warn(`Entity level-history backfill failed: ${err}`);
      }
    }
    // Idempotent: cancel any GlobalActivePower rows that have no effectDefId
    // AND no effectOverrides. These are true legacy rows from before the
    // effectDefId migration that can no longer be resolved by the effect
    // system. Tick-speed-boost powers always have effectOverrides, so they
    // are never affected by this backfill.
    await this.backfillGlobalPowers();
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

  private async seedNftCollections() {
    const collections = [
      {
        id: 'nft_cardano_dp',
        name: 'Derp Birds (Cardano)',
        collectionId: 'e74862a09d17a9cb03174a6bd5fa305b8684475c4c36021591c606e0',
        entityDefinitionId: 'derp_bird',
      },
      {
        id: 'nft_cardano_derplings',
        name: 'Derplings (Cardano)',
        collectionId: 'b2d25f829ebb7f4c97b5e847923a1115b23ebf78000722c229c9c9f7',
        entityDefinitionId: 'derpling',
      },
      {
        id: 'nft_cardano_derp_apes',
        name: 'Derp Apes (Cardano)',
        collectionId: 'f4873b426a498350c579690bd1f4a369d5d7b521c778acf322f77334',
        entityDefinitionId: 'derp_ape',
      },
      {
        id: 'nft_cardano_preds',
        name: 'Preds (Cardano)',
        collectionId: '73056bffdf28f82da5db1f5ac7c06d030c8a551f43889f7f85746a4a',
        entityDefinitionId: 'pred',
      },
      {
        id: 'nft_cardano_perps',
        name: 'Perps (Cardano)',
        collectionId: 'e6ba9c0ff27be029442c32533c6efd956a60d15ecb976acbb64c4de0',
        entityDefinitionId: 'perp',
        // attributeMap (NFT raw attribute key → slot name) is now part of
        // the EntityDefinition row (see derp/perp seed in definitions.json).
      },
      {
        id: 'nft_cardano_outposts',
        name: 'Derp Outposts (Cardano)',
        collectionId: 'a2e719d70b9d71636aa825e71c11ca508ecf98eec87182b0e526d7c5',
        entityDefinitionId: null,
        locationDefinitionId: 'derp_outpost',
      },
    ];

    let seeded = 0;
    for (const col of collections) {
      const colData: Record<string, any> | undefined = (col as any).data;
      const createData: Record<string, any> = {
        id: col.id,
        name: col.name,
        chain: 'CARDANO',
        collectionId: col.collectionId,
        entityDefinitionId: (col as any).entityDefinitionId ?? null,
        locationDefinitionId: (col as any).locationDefinitionId ?? null,
        mintMode: 'one_per_token',
        active: true,
        data: colData ?? {},
      };
      const updateData: Record<string, any> = {
        locationDefinitionId: (col as any).locationDefinitionId ?? null,
        entityDefinitionId: (col as any).entityDefinitionId ?? null,
      };
      if (colData !== undefined) {
        updateData.data = colData;
      }
      const result = await (this.prisma as any).nftCollectionDef.upsert({
        where: { id: col.id },
        update: updateData,
        create: createData,
      });
      if (result.createdAt.getTime() === result.updatedAt.getTime()) {
        seeded++;
      }
    }

    if (seeded > 0) {
      this.logger.log(`Seeded ${seeded} NFT collection(s)`);
    }
  }

  private async seedEffectDefinitions() {
    const defs = [
      {
        id: 'eff_xp_potion_small',
        name: 'Minor XP Boost',
        description: 'Grants 50 XP to a target entity instantly.',
        iconKey: 'potion_xp',
        category: 'xp_multiplier',
        valueMode: 'flat_grant',
        durationModel: 'instant',
        stackingRule: 'no_stack',
        targetType: 'entity',
        value: 50,
      },
      {
        id: 'eff_xp_boost_timed',
        name: 'XP Boost Elixir',
        description: 'Increases all XP gains by 25% for 30 minutes.',
        iconKey: 'potion_xp_timed',
        category: 'xp_multiplier',
        valueMode: 'percent_add',
        durationModel: 'timed',
        stackingRule: 'refresh',
        targetType: 'player',
        value: 25,
        durationSec: 1800,
      },
      {
        id: 'eff_stat_boost_atk',
        name: 'Attack Tonic',
        description: 'Boosts ATK by 10 for 15 minutes.',
        iconKey: 'potion_atk',
        category: 'stat_boost',
        valueMode: 'flat_add',
        durationModel: 'timed',
        stackingRule: 'stack_capped',
        targetType: 'player',
        value: 0,
        stats: { ATK: 10 },
        maxStacks: 3,
        durationSec: 900,
      },
      {
        id: 'eff_mission_power_flask',
        name: 'Mission Power Flask',
        description: 'Boosts mission power by 15% for the current mission.',
        iconKey: 'flask_mp',
        category: 'mission_power',
        valueMode: 'percent_add',
        durationModel: 'session',
        stackingRule: 'no_stack',
        targetType: 'player',
        value: 15,
        sessionType: 'mission',
      },
      {
        id: 'eff_production_boost',
        name: 'Production Surge',
        description: 'Increases production rates by 50% for 1 hour.',
        iconKey: 'potion_production',
        category: 'production_rate',
        valueMode: 'percent_add',
        durationModel: 'timed',
        stackingRule: 'replace',
        targetType: 'location',
        value: 50,
        durationSec: 3600,
      },
      {
        id: 'eff_currency_boost',
        name: 'Gold Rush',
        description: 'Increases currency rewards by 20% for 30 minutes.',
        iconKey: 'potion_gold',
        category: 'currency_multiplier',
        valueMode: 'percent_add',
        durationModel: 'timed',
        stackingRule: 'refresh',
        targetType: 'player',
        value: 20,
        durationSec: 1800,
      },
      {
        id: 'eff_reward_boost',
        name: 'Luck Charm',
        description: 'Increases all item rewards by 10% for 1 hour.',
        iconKey: 'charm_luck',
        category: 'reward_multiplier',
        valueMode: 'percent_add',
        durationModel: 'timed',
        stackingRule: 'refresh',
        targetType: 'player',
        value: 10,
        durationSec: 3600,
      },
      {
        id: 'eff_success_chance',
        name: 'Lucky Feather',
        description: 'Improves mission success chance by 5% for 30 minutes.',
        iconKey: 'feather_luck',
        category: 'success_chance',
        valueMode: 'flat_add',
        durationModel: 'timed',
        stackingRule: 'stack_capped',
        targetType: 'player',
        value: 5,
        maxStacks: 3,
        durationSec: 1800,
      },
      {
        id: 'eff_xp_scroll',
        name: 'XP Scroll',
        description: 'Doubles XP gains (+100%) for 10 minutes.',
        iconKey: 'xp_scroll',
        category: 'xp_multiplier',
        valueMode: 'percent_add',
        durationModel: 'timed',
        stackingRule: 'refresh',
        targetType: 'player',
        value: 100,
        durationSec: 600,
      },
      {
        id: 'eff_speed_boost',
        name: 'Swift Draught',
        description: 'Boosts SPD by 5 for 1 minute.',
        iconKey: 'potion_speed',
        category: 'stat_boost',
        valueMode: 'flat_add',
        durationModel: 'timed',
        stackingRule: 'refresh',
        targetType: 'player',
        value: 0,
        stats: { SPD: 5 },
        durationSec: 60,
      },
      {
        id: 'eff_heal_minor',
        name: 'Minor Heal',
        description: 'Restores +20 VIT to a target entity.',
        iconKey: 'potion_heal',
        category: 'stat_boost',
        valueMode: 'flat_add',
        durationModel: 'instant',
        stackingRule: 'no_stack',
        targetType: 'entity',
        value: 0,
        stats: { VIT: 20 },
      },
      {
        id: 'eff_heal',
        name: 'Heal',
        description: 'Restores +50 VIT to a target entity.',
        iconKey: 'potion_heal',
        category: 'stat_boost',
        valueMode: 'flat_add',
        durationModel: 'instant',
        stackingRule: 'no_stack',
        targetType: 'entity',
        value: 0,
        stats: { VIT: 50 },
      },
      {
        id: 'eff_revival',
        name: 'Revival',
        description: 'Restores +100 VIT to a target entity.',
        iconKey: 'revival_token',
        category: 'stat_boost',
        valueMode: 'flat_add',
        durationModel: 'instant',
        stackingRule: 'no_stack',
        targetType: 'entity',
        value: 0,
        stats: { VIT: 100 },
      },
      // NFT power EffectDefs — one per new power type. These are referenced by
      // PowerDef.effectDefId so that triggering an NFT power creates a
      // GlobalActivePower that the effect resolver can evaluate.
      {
        id: 'eff_nft_keeper_xp_boost',
        name: 'Keeper XP Boost',
        description: 'Increases keeper (player) XP gains by a percentage for the active window.',
        iconKey: 'nft_power_keeper_xp',
        category: 'keeper_xp_multiplier',
        valueMode: 'percent_add',
        durationModel: 'timed',
        stackingRule: 'refresh',
        targetType: 'player',
        value: 25,
        durationSec: 3600,
      },
      {
        id: 'eff_nft_entity_xp_boost',
        name: 'Entity XP Boost',
        description: 'Increases entity XP gains by a percentage for the active window.',
        iconKey: 'nft_power_entity_xp',
        category: 'xp_multiplier',
        valueMode: 'percent_add',
        durationModel: 'timed',
        stackingRule: 'refresh',
        targetType: 'entity',
        value: 25,
        durationSec: 3600,
      },
      {
        id: 'eff_nft_mission_power_boost',
        name: 'Mission Power Boost',
        description: 'Increases mission power contribution by a percentage for the active window.',
        iconKey: 'nft_power_mission',
        category: 'mission_power',
        valueMode: 'percent_add',
        durationModel: 'timed',
        stackingRule: 'refresh',
        targetType: 'player',
        value: 15,
        durationSec: 3600,
      },
      {
        id: 'eff_nft_mission_timer_speed',
        name: 'Mission Duration Reduction',
        description: 'Reduces mission duration by a percentage for the active window.',
        iconKey: 'nft_power_mission_timer',
        category: 'mission_timer_speed',
        valueMode: 'percent_add',
        durationModel: 'timed',
        stackingRule: 'refresh',
        targetType: 'player',
        value: -20,
        durationSec: 3600,
      },
      {
        id: 'eff_nft_crafting_timer_speed',
        name: 'Crafting Duration Reduction',
        description: 'Reduces crafting job duration by a percentage for the active window.',
        iconKey: 'nft_power_crafting',
        category: 'crafting_timer_speed',
        valueMode: 'percent_add',
        durationModel: 'timed',
        stackingRule: 'refresh',
        targetType: 'player',
        value: -20,
        durationSec: 3600,
      },
      {
        id: 'eff_nft_building_build_timer_speed',
        name: 'Building Construction Boost',
        description: 'Reduces building construction time by a percentage for the active window.',
        iconKey: 'nft_power_build',
        category: 'building_build_timer_speed',
        valueMode: 'percent_add',
        durationModel: 'timed',
        stackingRule: 'refresh',
        targetType: 'player',
        value: -15,
        durationSec: 3600,
      },
      {
        id: 'eff_nft_building_upgrade_timer_speed',
        name: 'Building Upgrade Boost',
        description: 'Reduces building upgrade time by a percentage for the active window.',
        iconKey: 'nft_power_upgrade',
        category: 'building_upgrade_timer_speed',
        valueMode: 'percent_add',
        durationModel: 'timed',
        stackingRule: 'refresh',
        targetType: 'player',
        value: -15,
        durationSec: 3600,
      },
      {
        id: 'eff_nft_dusting_timer_speed',
        name: 'Dusting Duration Reduction',
        description: 'Reduces dusting job starting duration by a percentage for the active window.',
        iconKey: 'nft_power_dusting',
        category: 'dusting_timer_speed',
        valueMode: 'percent_add',
        durationModel: 'timed',
        stackingRule: 'refresh',
        targetType: 'player',
        value: -20,
        durationSec: 3600,
      },
      {
        id: 'eff_nft_injury_recovery_speed',
        name: 'Injury Recovery Boost',
        description: 'Speeds up entity injury recovery by a percentage for the active window.',
        iconKey: 'nft_power_recovery',
        category: 'injury_recovery_speed',
        valueMode: 'percent_add',
        durationModel: 'timed',
        stackingRule: 'refresh',
        targetType: 'player',
        value: 30,
        durationSec: 3600,
      },
      // ── Instant remaining-duration reduction (consumable effects) ────────────
      {
        id: 'eff_consumable_mission_duration_reduction',
        name: 'Mission Rush',
        description: 'Instantly reduces the remaining time on your active mission.',
        iconKey: 'consumable_mission_skip',
        category: 'mission_duration_reduction',
        valueMode: 'percent_add',
        durationModel: 'instant',
        stackingRule: 'no_stack',
        targetType: 'player',
        value: 20,
        durationSec: 0,
      },
      {
        id: 'eff_consumable_crafting_duration_reduction',
        name: 'Crafting Rush',
        description: 'Instantly reduces the remaining time on your active crafting job.',
        iconKey: 'consumable_crafting_skip',
        category: 'crafting_duration_reduction',
        valueMode: 'percent_add',
        durationModel: 'instant',
        stackingRule: 'no_stack',
        targetType: 'player',
        value: 20,
        durationSec: 0,
      },
      {
        id: 'eff_consumable_building_build_duration_reduction',
        name: 'Builder\'s Rush',
        description: 'Instantly reduces the remaining time on your active building construction.',
        iconKey: 'consumable_building_build_skip',
        category: 'building_build_duration_reduction',
        valueMode: 'percent_add',
        durationModel: 'instant',
        stackingRule: 'no_stack',
        targetType: 'player',
        value: 20,
        durationSec: 0,
      },
      {
        id: 'eff_consumable_building_upgrade_duration_reduction',
        name: 'Upgrade Rush',
        description: 'Instantly reduces the remaining time on your active building upgrade.',
        iconKey: 'consumable_building_upgrade_skip',
        category: 'building_upgrade_duration_reduction',
        valueMode: 'percent_add',
        durationModel: 'instant',
        stackingRule: 'no_stack',
        targetType: 'player',
        value: 20,
        durationSec: 0,
      },
      {
        id: 'eff_consumable_dusting_duration_reduction',
        name: 'Dusting Rush',
        description: 'Instantly reduces the remaining time on your active dusting job.',
        iconKey: 'consumable_dusting_skip',
        category: 'dusting_duration_reduction',
        valueMode: 'percent_add',
        durationModel: 'instant',
        stackingRule: 'no_stack',
        targetType: 'player',
        value: 20,
        durationSec: 0,
      },
      // ── Timer speed boost stubs (tier 3 — deferred: requires tick manipulation) ──
      {
        id: 'eff_mission_timer_speed_boost',
        name: 'Mission Speed Boost',
        description: '[Stub] Increases the effective speed of an active mission. Requires tick-rate manipulation.',
        iconKey: 'mission_speed_boost',
        category: 'mission_timer_speed_boost',
        valueMode: 'percent_add',
        durationModel: 'timed',
        stackingRule: 'refresh',
        targetType: 'player',
        value: 50,
        durationSec: 3600,
      },
      {
        id: 'eff_crafting_timer_speed_boost',
        name: 'Crafting Speed Boost',
        description: '[Stub] Increases the effective speed of an active crafting job. Requires tick-rate manipulation.',
        iconKey: 'crafting_speed_boost',
        category: 'crafting_timer_speed_boost',
        valueMode: 'percent_add',
        durationModel: 'timed',
        stackingRule: 'refresh',
        targetType: 'player',
        value: 50,
        durationSec: 3600,
      },
      {
        id: 'eff_building_build_timer_speed_boost',
        name: 'Construction Speed Boost',
        description: '[Stub] Increases the effective speed of building construction. Requires tick-rate manipulation.',
        iconKey: 'building_build_speed_boost',
        category: 'building_build_timer_speed_boost',
        valueMode: 'percent_add',
        durationModel: 'timed',
        stackingRule: 'refresh',
        targetType: 'player',
        value: 50,
        durationSec: 3600,
      },
      {
        id: 'eff_building_upgrade_timer_speed_boost',
        name: 'Upgrade Speed Boost',
        description: '[Stub] Increases the effective speed of building upgrades. Requires tick-rate manipulation.',
        iconKey: 'building_upgrade_speed_boost',
        category: 'building_upgrade_timer_speed_boost',
        valueMode: 'percent_add',
        durationModel: 'timed',
        stackingRule: 'refresh',
        targetType: 'player',
        value: 50,
        durationSec: 3600,
      },
      {
        id: 'eff_dusting_timer_speed_boost',
        name: 'Dusting Speed Boost',
        description: '[Stub] Increases the effective speed of an active dusting job. Requires tick-rate manipulation.',
        iconKey: 'dusting_speed_boost',
        category: 'dusting_timer_speed_boost',
        valueMode: 'percent_add',
        durationModel: 'timed',
        stackingRule: 'refresh',
        targetType: 'player',
        value: 50,
        durationSec: 3600,
      },
    ];

    let seeded = 0;
    for (const def of defs) {
      const result = await (this.prisma as any).effectDef.upsert({
        where: { id: def.id },
        update: { value: def.value, valueMode: def.valueMode },
        create: {
          ...def,
          meta: {},
          enabled: true,
        },
      });
      if (result.createdAt.getTime() === result.updatedAt.getTime()) {
        seeded++;
      }
    }
    if (seeded > 0) {
      this.logger.log(`Seeded ${seeded} effect definitions`);
    }
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

  private async backfillConsumableData() {
    const seedItemDefs = require('./seeds/data/item-defs.json');
    const seedById = buildSeedConsumableMap(seedItemDefs);

    const rows: Array<{ id: string; consumableData: unknown }> = await (
      this.prisma as any
    ).itemDefinition.findMany({ where: { type: 'CONSUMABLE' } });

    let rewritten = 0;
    for (const row of rows) {
      const next = canonicalConsumableData(row.consumableData, seedById.get(row.id) ?? null);
      if (consumableDataEqual(row.consumableData as any, next)) continue;

      await (this.prisma as any).itemDefinition.update({
        where: { id: row.id },
        data: { consumableData: next as any },
      });
      rewritten += 1;
    }

    if (rewritten > 0) {
      this.logger.log(
        `ConsumableData backfill: normalized ${rewritten} item definition(s) to canonical shape`,
      );
    }
  }

}
