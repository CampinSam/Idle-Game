import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from './prisma/prisma.service';
import { EntityService } from './modules/entity/entity.service';
import { seedDefinitions } from './seeds/definitions.seed';
import { seedSounds } from './seeds/sounds.seed';
import { seedRetention } from './seeds/retention.seed';
import { seedTags } from './seeds/tags.seed';
import {
  buildSeedConsumableMap,
  canonicalConsumableData,
  consumableDataEqual,
} from './seeds/consumable-data.util';
import {
  OUTCOME_SPEC_FIELDS_BY_MODEL,
  normalizeOutcomeSpec,
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
   * before being rethrown. Without this, a failure deep inside (say)
   * `seedDefinitions` surfaces as a bare Prisma error with no context about
   * which OnModuleInit phase was running — the exact failure mode that made
   * Task #368's silent bootstrap hang so hard to diagnose. We rethrow so
   * Nest still aborts startup; main.ts's top-level catch then surfaces it.
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
    await this.runStep('seedTickRateIntervals', () => this.seedTickRateIntervals());
    await this.runStep('seedNftCollections', () => this.seedNftCollections());
    await this.runStep('seedEffectDefinitions', () => this.seedEffectDefinitions());
    await this.runStep('seedConsumableItems', () => this.seedConsumableItems());
    await this.runStep('seedDefinitions', () => seedDefinitions(this.prisma));
    await this.runStep('seedSounds', () => seedSounds(this.prisma));
    // Retention loop content (daily/weekly quests + achievements). Kept
    // separate from `seedDefinitions` so the giant definitions.json file
    // doesn't have to know about cadence-aware quest defs or the new
    // AchievementDef table.
    await this.runStep('seedRetention', () => seedRetention(this.prisma));
    // Visual tag + reusable effect catalog. Cheap; seeded last so any
    // earlier failure (which is far more likely to be schema-related)
    // surfaces before we get into UI catalog territory.
    await this.runStep('seedTags', () => seedTags(this.prisma));
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
    ];

    let seeded = 0;
    for (const def of defs) {
      const result = await (this.prisma as any).effectDef.upsert({
        where: { id: def.id },
        update: {},
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
