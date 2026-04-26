import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from './prisma/prisma.service';
import { EntityService } from './modules/entity/entity.service';
import { seedDefinitions } from './seeds/definitions.seed';
import { seedSounds } from './seeds/sounds.seed';

@Injectable()
export class BootstrapService implements OnModuleInit {
  private readonly logger = new Logger(BootstrapService.name);

  constructor(
    private prisma: PrismaService,
    private entityService: EntityService,
  ) {}

  async onModuleInit() {
    await this.seedTickRateIntervals();
    await this.seedNftCollections();
    await this.seedEffectDefinitions();
    await this.seedConsumableItems();
    await seedDefinitions(this.prisma);
    await seedSounds(this.prisma);
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
    const result = await (this.prisma as any).nftCollectionDef.upsert({
      where: { id: 'nft_cardano_dp' },
      update: {},
      create: {
        id: 'nft_cardano_dp',
        name: 'Derp Birds (Cardano)',
        chain: 'CARDANO',
        collectionId: 'e74862a09d17a9cb03174a6bd5fa305b8684475c4c36021591c606e0',
        entityDefinitionId: 'derp_bird',
        mintMode: 'one_per_token',
        active: true,
        data: {},
      },
    });

    if (result.createdAt.getTime() === result.updatedAt.getTime()) {
      this.logger.log('Seeded Derp Birds Cardano NFT collection');
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
          targetType: 'entity',
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
          targetType: 'player',
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
          targetType: 'player',
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
          targetType: 'location',
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
          targetType: 'player',
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
          targetType: 'player',
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
}
