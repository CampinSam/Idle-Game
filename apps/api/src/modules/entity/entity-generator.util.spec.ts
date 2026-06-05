import { generateEntityData } from './entity-generator.util';

function makeDef(slotFill: any, opts: { traits?: any; slots?: any } = {}) {
  return {
    id: 'derp_bird',
    name: 'Derp Bird',
    speciesId: 'derp_bird',
    slots: opts.slots ?? { body: ['robin', 'sparrow', 'finch'], head: ['crested', 'plain'] },
    traits: opts.traits ?? {
      robin: { slotStats: { body: { ATK: 5, DEF: 1 } }, scaling: { ATK: 2 }, rarityMultiplier: 1.0 },
      sparrow: { slotStats: { body: { ATK: 1, DEF: 5 } }, scaling: { DEF: 2 }, rarityMultiplier: 1.0 },
      finch: { slotStats: { body: { SPD: 5 } }, scaling: { SPD: 2 }, rarityMultiplier: 1.0 },
      crested: { slotStats: { head: { FOC: 3 } }, scaling: { FOC: 2 }, rarityMultiplier: 1.0 },
      plain: { slotStats: { head: { LCK: 3 } }, scaling: { LCK: 2 }, rarityMultiplier: 1.0 },
    },
    progression: {
      maxLevel: 50,
      xpCurve: { kind: 'geometric', base: 100, ratio: 1.15 },
      statGain: {
        guaranteed: { ATK: 1, DEF: 1, SPD: 1, FOC: 1, LCK: 1, VIT: 1 },
        bonusPool: { kind: 'flat', amount: 0 },
        distribution: { uniformShare: 0.5, weightedShare: 0.5, weightsField: 'scaling' },
      },
    },
    init: {
      scratch: {
        startingLevel: 1,
        baseStats: { ATK: 0, DEF: 0, SPD: 0, FOC: 0, LCK: 0, VIT: 0 },
        slotFill,
      },
    },
  };
}

function makePrisma(def: any) {
  return {
    entityDefinition: { findUnique: jest.fn(async () => def) },
  } as any;
}

describe('generateEntityData — slotFill: { kind: "fixed" }', () => {
  it('always picks the configured archetype for each slot', async () => {
    const def = makeDef({ kind: 'fixed', fixed: { body: 'sparrow', head: 'plain' } });
    const prisma = makePrisma(def);
    for (let i = 0; i < 25; i++) {
      const result = await generateEntityData(prisma, 'user-1', def.id, 'Birdy');
      expect(result.traits).toEqual({ body: 'sparrow', head: 'plain' });
      expect(result.stats.ATK).toBe(1);
      expect(result.stats.DEF).toBe(5);
      expect(result.stats.LCK).toBe(3);
      expect(result.stats.FOC).toBe(0);
      expect(result.stats.SPD).toBe(0);
    }
  });

  it('falls back to random selection for slots not listed in fixed', async () => {
    const def = makeDef({ kind: 'fixed', fixed: { body: 'finch' } });
    const prisma = makePrisma(def);
    const headTraits = new Set<string>();
    for (let i = 0; i < 50; i++) {
      const result = await generateEntityData(prisma, 'user-1', def.id, 'Birdy');
      expect(result.traits.body).toBe('finch');
      expect(['crested', 'plain']).toContain(result.traits.head);
      headTraits.add(result.traits.head as string);
    }
    // Over 50 trials with 2 options the random fallback should hit both.
    expect(headTraits.size).toBe(2);
  });

  it('produces baseStats and scaling derived from the fixed traits only', async () => {
    const def = makeDef({ kind: 'fixed', fixed: { body: 'robin', head: 'crested' } });
    const prisma = makePrisma(def);
    const result = await generateEntityData(prisma, 'user-1', def.id, 'Birdy');
    expect(result.stats.ATK).toBe(5);
    expect(result.stats.DEF).toBe(1);
    expect(result.stats.FOC).toBe(3);
    // scaling is the geometric mean of contributions; ATK appears in robin (2) and defaults to 1 in crested → sqrt(2)
    expect(result.stats.scaling.ATK).toBeCloseTo(Math.sqrt(2), 5);
    expect(result.stats.scaling.FOC).toBeCloseTo(Math.sqrt(2), 5);
    expect(result.stats.compositRarity).toBeCloseTo(1.0, 5);
  });
});
