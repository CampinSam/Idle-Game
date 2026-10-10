import { Injectable } from '@nestjs/common';
import { RARITY_TIERS } from '@derp/shared';

@Injectable()
export class MetaService {
  getEnums(): Record<string, string[]> {
    return {
      currencyType: ['SOFT', 'HARD', 'PREMIUM', 'SEASONAL', 'EVENT', 'GUILD'],
      itemType: ['MATERIAL', 'CONSUMABLE', 'GEAR', 'QUEST'],
      itemRarity: RARITY_TIERS.map(r => r.toUpperCase()),
      itemCategory: ['MISC', 'CRAFTING', 'COMBAT', 'EXPLORATION', 'QUEST_ITEMS', 'ENHANCEMENT'],
      xpCurve: ['linear', 'exp', 'custom'],
      growthRate: ['flat', 'linear', 'exp'],
      operator: ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'exists', 'dne'],
      requirementType: ['keeper_level', 'team_size', 'flag', 'trait', 'building', 'currency', 'item', 'has_building', 'has_room', 'parent_has_building', 'parent_has_room', 'in_region'],
      rewardType: ['entity_xp', 'keeper_xp', 'currency', 'item', 'flag', 'text', 'emitEvent'],
      flagOperation: ['set', 'increment', 'decrement', 'invert', 'remove'],
      skipType: ['absolute', 'scaling'],
      giftRewardType: ['currency', 'item', 'entity', 'bundle'],
      eventKind: ['system', 'seasonal', 'promotional'],
      handlerKey: ['createGiftForPlayer'],
      stats: ['ATK', 'DEF', 'SPD', 'FOC', 'LCK', 'VIT'],
      archetypes: ['Dave', 'Astro', 'Magician', 'Ninja', 'Redneck', 'Stoner', 'DJ', 'Viking', 'Monk', 'Corpo', 'Cyborg', 'Buff', 'MadScientist', 'Deity'],
      bodySlots: ['head', 'ears', 'beak', 'eyes', 'body', 'back', 'tail'],
      equipmentSlots: ['weapon', 'armor', 'accessory'],
    };
  }

  getRules(): Record<string, any> {
    return {
      maxEntityLevel: 50,
      starterRegion: 'DerpshireValley',
      starterArcanium: 100,
      starterKeeperLevel: 1,
      traitSlots: ['head', 'ears', 'beak', 'eyes', 'body', 'back', 'tail'],
      regions: [
        'DerpshireValley', 'ChillarcticaDrifts', 'SandcryptBadlands',
        'ChillvineJungle', 'PinnaclePerch', 'BaldosBog', 'LavaLodePeaks',
      ],
      archetypeRarity: {
        Dave: 'common',
        Redneck: 'common',
        Stoner: 'common',
        Buff: 'common',
        DJ: 'uncommon',
        Ninja: 'uncommon',
        Viking: 'uncommon',
        Monk: 'uncommon',
        Astro: 'rare',
        Corpo: 'rare',
        Magician: 'rare',
        Cyborg: 'epic',
        MadScientist: 'epic',
        Deity: 'legendary',
      },
      rarityWeights: {
        common: 40,
        uncommon: 25,
        rare: 15,
        epic: 8,
        legendary: 2,
      },
      antiWhaleCaps: {
        mpEffectivenessCap: 500,
        synergyStackingCap: 0.30,
        craftingLuckCap: 150,
      },
    };
  }
}
